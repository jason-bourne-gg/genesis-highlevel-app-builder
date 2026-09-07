const { atest, run, assert } = require('./harness.cjs')
const { withStubs } = require('./stub.cjs')

const ALICE = 'uid_alice'
const BOB = 'uid_bob'

const withFlags = (firestore, auth, body) =>
  withStubs({ firestore, auth }, { store: 'lib/flags/store.js' }, body)

const users = {
  getUserByEmail: async (email) => {
    if (email === 'alice@x.com') return { uid: ALICE, email }
    if (email === 'bob@x.com') return { uid: BOB, email }
    throw new Error('user not found')
  },
  listUsers: async () => ({
    users: [
      { uid: BOB, email: 'bob@x.com', providerData: [{ providerId: 'google.com' }], metadata: { creationTime: '2026-01-02T00:00:00Z' } },
      { uid: ALICE, email: 'alice@x.com', providerData: [{ providerId: 'password' }], metadata: { creationTime: '2026-03-04T00:00:00Z' } },
    ],
    pageToken: undefined,
  }),
}

const flagOf = (list, key) => list.find((f) => f.key === key)

// readFlags is driven by the registry, not by what happens to be in the collection, so a
// flag with no document yet resolves to its default instead of vanishing.
atest('a flag with no document still appears, at its default', async () => {
  await withFlags({}, users, async ({ store }) => {
    const flags = await store.readFlags()
    assert.strictEqual(flags.length, 3, 'a registered flag went missing')
    for (const f of flags) {
      assert.strictEqual(f.enabled, false, `${f.key} defaulted on`)
      assert.deepStrictEqual(f.actors, [])
    }
  })
})

atest('every registered flag is described, so the admin is never blank', async () => {
  await withFlags({}, users, async ({ store }) => {
    for (const f of await store.readFlags()) {
      assert.ok(f.label && f.label.length > 3, `${f.key} has no label`)
      assert.ok(f.description && f.description.length > 20, `${f.key} has no description`)
    }
  })
})

atest('only the sign-in flag is global-only, since it is read before sign-in', async () => {
  await withFlags({}, users, async ({ store }) => {
    const flags = await store.readFlags()
    assert.strictEqual(flagOf(flags, 'google_login').globalOnly, true)
    assert.ok(!flagOf(flags, 'hl_writes').globalOnly)
    assert.ok(!flagOf(flags, 'hl_extended_reads').globalOnly)
  })
})

atest('a stored document overrides the default', async () => {
  await withFlags(
    { 'flags/hl_writes': { enabled: true, actors: [ALICE], updatedAt: 5, updatedBy: 'root' } },
    users,
    async ({ store }) => {
      const f = flagOf(await store.readFlags(), 'hl_writes')
      assert.strictEqual(f.enabled, true)
      assert.deepStrictEqual(f.actors, [ALICE])
      assert.strictEqual(f.updatedBy, 'root')
    },
  )
})

// A hand-edited or half-written document must not take a flag with it.
atest('a malformed document degrades to off rather than throwing', async () => {
  await withFlags(
    { 'flags/hl_writes': { enabled: 'yes', actors: 'alice' } },
    users,
    async ({ store }) => {
      const f = flagOf(await store.readFlags(), 'hl_writes')
      assert.strictEqual(f.enabled, false, 'a non-boolean was treated as on')
      assert.deepStrictEqual(f.actors, [])
    },
  )
})

atest('non-string entries in the actor list are discarded', async () => {
  await withFlags(
    { 'flags/hl_writes': { enabled: false, actors: [ALICE, null, 42, { uid: BOB }] } },
    users,
    async ({ store }) => {
      assert.deepStrictEqual(flagOf(await store.readFlags(), 'hl_writes').actors, [ALICE])
    },
  )
})

atest('the global gate can be set on and back off', async () => {
  await withFlags({}, users, async ({ store }) => {
    assert.strictEqual((await store.setFlag('hl_writes', { enabled: true }, 'root')).enabled, true)
    assert.strictEqual((await store.setFlag('hl_writes', { enabled: false }, 'root')).enabled, false)
  })
})

// A full-document replace would let two roots adding actors at once drop one, so these
// are field-level array operations instead.
atest('adding an actor is an array union, not a document replace', async () => {
  await withFlags({}, users, async ({ store }, s) => {
    await store.setFlag('hl_writes', { actorUid: ALICE, on: true }, 'root')
    const write = s.writes.at(-1)
    assert.strictEqual(write.op, 'merge', 'replaced the whole document')
    assert.deepStrictEqual(write.data.actors, { __op: 'arrayUnion', values: [ALICE] })
  })
})

atest('removing an actor is an array remove', async () => {
  await withFlags({}, users, async ({ store }, s) => {
    await store.setFlag('hl_writes', { actorUid: ALICE, on: false }, 'root')
    assert.deepStrictEqual(s.writes.at(-1).data.actors, { __op: 'arrayRemove', values: [ALICE] })
  })
})

atest('toggling one account never touches the global gate', async () => {
  await withFlags(
    { 'flags/hl_writes': { enabled: true, actors: [], updatedAt: 1, updatedBy: 'x' } },
    users,
    async ({ store }, s) => {
      await store.setFlag('hl_writes', { actorUid: ALICE, on: true }, 'root')
      assert.strictEqual('enabled' in s.writes.at(-1).data, false, 'the global gate was rewritten')
    },
  )
})

atest('who changed it and when are recorded', async () => {
  await withFlags({}, users, async ({ store }, s) => {
    await store.setFlag('hl_writes', { enabled: true }, 'root@example.com')
    assert.strictEqual(s.writes.at(-1).data.updatedBy, 'root@example.com')
    assert.ok(s.writes.at(-1).data.updatedAt > 0)
  })
})

// google_login is resolved with no signed-in user, so an actor list on it could never be
// honoured — refusing the write is better than storing something inert.
atest('an actor cannot be added to a global-only flag', async () => {
  await withFlags({}, users, async ({ store }) => {
    await assert.rejects(store.setFlag('google_login', { actorUid: ALICE, on: true }, 'root'), (e) => {
      assert.strictEqual(e.code, 'global_only')
      assert.strictEqual(e.status, 400)
      return true
    })
  })
})

atest('a global-only flag can still be turned on for everyone', async () => {
  await withFlags({}, users, async ({ store }) => {
    assert.strictEqual((await store.setFlag('google_login', { enabled: true }, 'root')).enabled, true)
  })
})

atest('an unknown flag key is refused', async () => {
  await withFlags({}, users, async ({ store }) => {
    await assert.rejects(store.setFlag('made_up', { enabled: true }, 'root'), (e) => {
      assert.strictEqual(e.code, 'unknown_flag')
      return true
    })
  })
})

// Emails are resolved live for the admin UI, so they never enter the world-readable
// flag documents.
atest('every account is listed, newest first', async () => {
  await withFlags({}, users, async ({ store }) => {
    const { users: list, truncated } = await store.listAllUsers()
    assert.deepStrictEqual(list.map((u) => u.email), ['alice@x.com', 'bob@x.com'])
    assert.strictEqual(truncated, false)
    assert.strictEqual(list[0].provider, 'password')
    assert.strictEqual(list[1].provider, 'google.com')
  })
})

atest('an account with no email falls back to its uid, so no row is blank', async () => {
  await withFlags(
    {},
    {
      ...users,
      listUsers: async () => ({
        users: [{ uid: ALICE, providerData: [], metadata: { creationTime: 'nonsense' } }],
        pageToken: 'more',
      }),
    },
    async ({ store }) => {
      const { users: list, truncated } = await store.listAllUsers()
      assert.strictEqual(list[0].email, ALICE)
      assert.strictEqual(list[0].provider, 'password', 'defaulted the provider')
      assert.strictEqual(list[0].createdAt, 0, 'an unparseable date became NaN')
      assert.strictEqual(truncated, true, 'did not report the extra page')
    },
  )
})

atest('seeding writes a document for every registered flag, once', async () => {
  await withFlags({}, users, async ({ store }, s) => {
    await store.seedFlags()
    assert.strictEqual([...s.docs.keys()].filter((p) => p.startsWith('flags/')).length, 3)
    const before = s.writes.length
    await store.seedFlags()
    assert.strictEqual(s.writes.length, before, 'rewrote flags that already existed')
  })
})

atest('seeding does not overwrite a flag that is already set', async () => {
  await withFlags(
    { 'flags/hl_writes': { enabled: true, actors: [ALICE], updatedAt: 9, updatedBy: 'root' } },
    users,
    async ({ store }, s) => {
      await store.seedFlags()
      assert.strictEqual(s.docs.get('flags/hl_writes').enabled, true)
      assert.deepStrictEqual(s.docs.get('flags/hl_writes').actors, [ALICE])
    },
  )
})

run('flag store')
