// Firebase-admin and fetch, replaced in the require cache so the module under test picks
// up a stub instead. Enough of Firestore to exercise the logic that matters — the
// single-use token refresh, the flag documents — without an emulator, which needs a JVM.
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const idOf = (p) => p.split('/').pop()

function install(name, exports) {
  const resolved = require.resolve(name, { paths: [ROOT] })
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports }
  return resolved
}

// Documents are a plain map from path to data, so a test can assert on it afterwards.
function fakeFirestore(initial = {}) {
  const docs = new Map(Object.entries(initial))
  const writes = []

  const snap = (p) => ({
    exists: docs.has(p),
    id: idOf(p),
    ref: ref(p),
    data: () => (docs.has(p) ? { ...docs.get(p) } : undefined),
  })

  const ref = (p) => ({
    path: p,
    id: idOf(p),
    // A document can own subcollections, which is how projects hold files and messages.
    collection: (name) => collection(`${p}/${name}`),
    get: async () => snap(p),
    set: async (data, opts) => {
      writes.push({ op: opts?.merge ? 'merge' : 'set', path: p, data })
      docs.set(p, opts?.merge ? { ...(docs.get(p) ?? {}), ...data } : { ...data })
    },
    update: async (data) => {
      if (!docs.has(p)) throw new Error(`NOT_FOUND: ${p}`)
      writes.push({ op: 'update', path: p, data })
      docs.set(p, { ...docs.get(p), ...data })
    },
    delete: async () => {
      writes.push({ op: 'delete', path: p })
      docs.delete(p)
    },
  })

  // Only direct children: projects/p/files/x is in projects/p/files, not in projects.
  const childrenOf = (c) =>
    [...docs.keys()].filter((p) => p.startsWith(`${c}/`) && !p.slice(c.length + 1).includes('/'))

  // Enough of a query builder to exercise ordering and limits, which is what the code
  // under test actually relies on.
  const query = (c, opts = {}) => ({
    orderBy: (field, dir = 'asc') => query(c, { ...opts, field, dir }),
    limit: (n) => query(c, { ...opts, limit: n }),
    where: (field, op, value) => query(c, { ...opts, where: [field, op, value] }),
    get: async () => {
      let paths = childrenOf(c)
      if (opts.where) {
        const [field, op, value] = opts.where
        paths = paths.filter((p) => {
          const v = docs.get(p)?.[field]
          return op === '<' ? v < value : op === '==' ? v === value : true
        })
      }
      if (opts.field) {
        paths.sort((a, b) => {
          const x = docs.get(a)?.[opts.field]
          const y = docs.get(b)?.[opts.field]
          return opts.dir === 'desc' ? (y > x ? 1 : y < x ? -1 : 0) : x > y ? 1 : x < y ? -1 : 0
        })
      }
      if (opts.limit !== undefined) paths = paths.slice(0, opts.limit)
      return { docs: paths.map(snap), empty: paths.length === 0, size: paths.length }
    },
  })

  let autoId = 0
  const collection = (c) =>
    Object.assign(query(c), {
      doc: (id) => ref(id ? `${c}/${id}` : `${c}/auto_${++autoId}`),
    })

  const db = {
    doc: ref,
    collection,
    batch: () => {
      const queued = []
      return {
        set: (r, data, opts) => queued.push(() => r.set(data, opts)),
        update: (r, data) => queued.push(() => r.update(data)),
        commit: async () => {
          for (const run of queued) await run()
        },
      }
    },
    // Commits immediately, which is enough to exercise read-then-write ordering.
    runTransaction: async (fn) =>
      fn({
        get: async (r) => snap(r.path),
        getAll: async (...refs) => refs.map((r) => snap(r.path)),
        set: (r, data, opts) => void r.set(data, opts),
        update: (r, data) => void docs.set(r.path, { ...(docs.get(r.path) ?? {}), ...data }),
      }),
  }

  return { db, docs, writes }
}

// Installs the stubs, runs the body with a freshly required module, then restores.
async function withStubs({ firestore = {}, auth = {}, fetch: onFetch }, modules, body) {
  const store = fakeFirestore(firestore)
  const calls = []

  const installed = [
    install('firebase-admin/firestore', {
      getFirestore: () => store.db,
      FieldValue: {
        arrayUnion: (...v) => ({ __op: 'arrayUnion', values: v }),
        arrayRemove: (...v) => ({ __op: 'arrayRemove', values: v }),
      },
    }),
    install('firebase-admin/auth', { getAuth: () => auth }),
  ]

  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: init?.body })
    return onFetch ? onFetch(String(url), init, calls.length) : { ok: true, status: 200, json: async () => ({}) }
  }

  const loaded = {}
  for (const [alias, rel] of Object.entries(modules)) {
    const target = require.resolve(path.join(ROOT, rel))
    delete require.cache[target]
    loaded[alias] = require(target)
  }

  try {
    return await body(loaded, { ...store, calls })
  } finally {
    globalThis.fetch = realFetch
    for (const id of installed) delete require.cache[id]
    for (const rel of Object.values(modules)) {
      delete require.cache[require.resolve(path.join(ROOT, rel))]
    }
  }
}

// A JSON response, the shape node's fetch gives back.
const json = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

module.exports = { withStubs, json }
