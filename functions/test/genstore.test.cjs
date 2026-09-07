const { atest, run, assert } = require('./harness.cjs')
const { withStubs } = require('./stub.cjs')

const UID = 'uid_alice'
const OTHER = 'uid_bob'
const P = 'proj_1'

const withStore = (firestore, body) =>
  withStubs({ firestore }, { store: 'lib/generate/store.js' }, body)

const project = { [`projects/${P}`]: { ownerUid: UID, name: 'Demo', description: 'd' } }

const msg = (role, content, createdAt, over = {}) => ({
  role, content, createdAt, status: 'complete', ...over,
})

// The client sends a project id in the body, and nothing stops it sending someone
// else's — so ownership is re-checked here even though rules already cover the
// collections the browser touches directly.
atest('a project you do not own is a 403', async () => {
  await withStore(project, async ({ store }) => {
    await assert.rejects(store.loadContext(OTHER, P), (e) => {
      assert.strictEqual(e.code, 'forbidden')
      assert.strictEqual(e.status, 403)
      return true
    })
  })
})

atest('a project that does not exist is a 404', async () => {
  await withStore({}, async ({ store }) => {
    await assert.rejects(store.loadContext(UID, 'nope'), (e) => {
      assert.strictEqual(e.status, 404)
      return true
    })
  })
})

atest('your own project loads its name and files', async () => {
  await withStore(
    {
      ...project,
      [`projects/${P}/files/index.html`]: { path: 'index.html', content: '<!doctype html>' },
      [`projects/${P}/files/app.js`]: { path: 'app.js', content: 'const a = 1' },
    },
    async ({ store }) => {
      const ctx = await store.loadContext(UID, P)
      assert.strictEqual(ctx.name, 'Demo')
      assert.strictEqual(ctx.files.length, 2)
      assert.deepStrictEqual(ctx.files.map((f) => f.path).sort(), ['app.js', 'index.html'])
    },
  )
})

atest('a project with no files yet loads cleanly, which is the first prompt', async () => {
  await withStore(project, async ({ store }) => {
    const ctx = await store.loadContext(UID, P)
    assert.deepStrictEqual(ctx.files, [])
    assert.deepStrictEqual(ctx.history, [])
  })
})

// History goes to the model oldest-first, whatever order it came back in.
atest('history is ordered oldest first', async () => {
  await withStore(
    {
      ...project,
      [`projects/${P}/messages/m3`]: msg('user', 'third', 3),
      [`projects/${P}/messages/m1`]: msg('user', 'first', 1),
      [`projects/${P}/messages/m2`]: msg('assistant', 'second', 2),
    },
    async ({ store }) => {
      const { history } = await store.loadContext(UID, P)
      assert.deepStrictEqual(history.map((m) => m.content), ['first', 'second', 'third'])
    },
  )
})

// An empty assistant message is what a failed or immediately-stopped run leaves behind,
// and the Anthropic API rejects a message with empty content.
atest('empty messages are dropped before they reach the model', async () => {
  await withStore(
    {
      ...project,
      [`projects/${P}/messages/m1`]: msg('user', 'real', 1),
      [`projects/${P}/messages/m2`]: msg('assistant', '', 2),
      [`projects/${P}/messages/m3`]: msg('assistant', '   ', 3),
    },
    async ({ store }) => {
      const { history } = await store.loadContext(UID, P)
      assert.deepStrictEqual(history.map((m) => m.content), ['real'])
    },
  )
})

atest('history carries only role and content, not status or cost', async () => {
  await withStore(
    { ...project, [`projects/${P}/messages/m1`]: msg('user', 'hi', 1, { usage: { costUsd: 1 } }) },
    async ({ store }) => {
      const [turn] = (await store.loadContext(UID, P)).history
      assert.deepStrictEqual(Object.keys(turn).sort(), ['content', 'role'])
    },
  )
})

// Both messages, every changed file and the snapshot land together or not at all, so the
// preview can never render a half-saved generation.
atest('a generation writes the pair of messages and the files in one commit', async () => {
  await withStore(project, async ({ store }, s) => {
    await store.persist({
      projectId: P,
      prompt: 'add a search box',
      reply: { role: 'assistant', content: 'done', createdAt: 0, status: 'complete' },
      written: [{ path: 'app.js', content: 'const a = 2' }],
      snapshot: [{ path: 'app.js', content: 'const a = 2' }],
    })

    const paths = [...s.docs.keys()]
    assert.strictEqual(paths.filter((p) => p.includes('/messages/')).length, 2)
    assert.strictEqual(paths.filter((p) => p.includes('/snapshots/')).length, 1)
    assert.ok(s.docs.has(`projects/${P}/files/app.js`))
    assert.strictEqual(s.docs.get(`projects/${P}/files/app.js`).content, 'const a = 2')
  })
})

atest('the user turn is stamped before the reply, so the order is stable', async () => {
  await withStore(project, async ({ store }, s) => {
    await store.persist({
      projectId: P,
      prompt: 'p',
      reply: { role: 'assistant', content: 'r', createdAt: 0, status: 'complete' },
      written: [],
      snapshot: null,
    })
    const messages = [...s.docs.entries()]
      .filter(([p]) => p.includes('/messages/'))
      .map(([, d]) => d)
    const user = messages.find((m) => m.role === 'user')
    const reply = messages.find((m) => m.role === 'assistant')
    assert.ok(user.createdAt < reply.createdAt, 'the reply sorted before the prompt')
  })
})

// Only a run that finished is worth being able to return to.
atest('a stopped run saves its files and message but no snapshot', async () => {
  await withStore(project, async ({ store }, s) => {
    await store.persist({
      projectId: P,
      prompt: 'p',
      reply: { role: 'assistant', content: 'partial', createdAt: 0, status: 'stopped' },
      written: [{ path: 'index.html', content: '<!doctype html>' }],
      snapshot: null,
    })
    assert.strictEqual([...s.docs.keys()].some((p) => p.includes('/snapshots/')), false)
    assert.ok(s.docs.has(`projects/${P}/files/index.html`), 'lost the finished file')
  })
})

atest('the message keeps the status and cost it was given', async () => {
  await withStore(project, async ({ store }, s) => {
    const usage = { model: 'claude-sonnet-5', inputTokens: 7300, outputTokens: 7400, costUsd: 0.0886 }
    await store.persist({
      projectId: P,
      prompt: 'p',
      reply: { role: 'assistant', content: 'r', createdAt: 0, status: 'failed', error: 'boom', usage },
      written: [],
      snapshot: null,
    })
    const reply = [...s.docs.values()].find((d) => d.role === 'assistant')
    assert.strictEqual(reply.status, 'failed')
    assert.strictEqual(reply.error, 'boom')
    assert.strictEqual(reply.usage.costUsd, 0.0886)
  })
})

atest('the project is touched, so the dashboard sorts it to the top', async () => {
  await withStore(project, async ({ store }, s) => {
    await store.persist({
      projectId: P,
      prompt: 'p',
      reply: { role: 'assistant', content: 'r', createdAt: 0, status: 'complete' },
      written: [],
      snapshot: null,
    })
    assert.ok(s.docs.get(`projects/${P}`).updatedAt > 0)
  })
})

atest('a file is written to the id derived from its path, so a rerun overwrites', async () => {
  await withStore(project, async ({ store }, s) => {
    const write = (content) =>
      store.persist({
        projectId: P,
        prompt: 'p',
        reply: { role: 'assistant', content: 'r', createdAt: 0, status: 'complete' },
        written: [{ path: 'app.js', content }],
        snapshot: null,
      })
    await write('first')
    await write('second')
    const files = [...s.docs.keys()].filter((p) => p.includes('/files/'))
    assert.strictEqual(files.length, 1, 'created a second document instead of overwriting')
    assert.strictEqual(s.docs.get(`projects/${P}/files/app.js`).content, 'second')
  })
})

run('generation store')
