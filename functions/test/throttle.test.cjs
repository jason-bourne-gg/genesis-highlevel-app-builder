const { atest, run, assert } = require('./harness.cjs')
const { withStubs } = require('./stub.cjs')

// The throttle and the credential comparison are tested directly rather than through the
// handler. Driving onRequest means building a request express and the cors middleware
// will accept, and at that point the test is asserting the mock rather than the code.
const CALLER = 'uid_alice'
const OTHER = 'uid_bob'
const configured = { ROOT_USERNAME: 'root', ROOT_PASSWORD: 'hunter2' }

const withUnlock = (firestore, env, body) =>
  withStubs({ firestore }, { unlock: 'lib/admin/unlock.js' }, async (mods, s) => {
    const saved = { ...process.env }
    Object.assign(process.env, env)
    try {
      await body(mods, s)
    } finally {
      for (const k of Object.keys(env)) delete process.env[k]
      Object.assign(process.env, saved)
    }
  })

atest('the right credential matches', async () => {
  await withUnlock({}, configured, async ({ unlock }) => {
    assert.strictEqual(unlock.credentialMatches('root', 'hunter2'), true)
  })
})

atest('the username is matched case-insensitively and trimmed', async () => {
  await withUnlock({}, configured, async ({ unlock }) => {
    assert.strictEqual(unlock.credentialMatches('  ROOT  ', 'hunter2'), true)
  })
})

// A case-insensitive password would quietly shrink the keyspace.
atest('the password is matched exactly', async () => {
  await withUnlock({}, configured, async ({ unlock }) => {
    assert.strictEqual(unlock.credentialMatches('root', 'HUNTER2'), false)
    assert.strictEqual(unlock.credentialMatches('root', ' hunter2'), false)
  })
})

atest('a wrong username or password does not match', async () => {
  await withUnlock({}, configured, async ({ unlock }) => {
    assert.strictEqual(unlock.credentialMatches('nobody', 'hunter2'), false)
    assert.strictEqual(unlock.credentialMatches('root', 'nope'), false)
    assert.strictEqual(unlock.credentialMatches('', ''), false)
  })
})

// A prefix must not match: comparing buffers of unequal length throws, so the length
// check has to come first.
atest('a prefix or a longer guess does not match', async () => {
  await withUnlock({}, configured, async ({ unlock }) => {
    assert.strictEqual(unlock.credentialMatches('root', 'hunter'), false)
    assert.strictEqual(unlock.credentialMatches('root', 'hunter2extra'), false)
  })
})

// Unset means disabled, so an unconfigured deployment cannot be unlocked by guessing the
// empty string.
atest('nothing matches when the credential is not configured', async () => {
  await withUnlock({}, { ROOT_USERNAME: '', ROOT_PASSWORD: '' }, async ({ unlock }) => {
    assert.strictEqual(unlock.credentialMatches('', ''), false)
    assert.strictEqual(unlock.credentialMatches('root', 'hunter2'), false)
  })
})

atest('a half-configured credential is also disabled', async () => {
  await withUnlock({}, { ROOT_USERNAME: 'root', ROOT_PASSWORD: '' }, async ({ unlock }) => {
    assert.strictEqual(unlock.credentialMatches('root', ''), false)
  })
})

// Keyed on the authenticated uid, not on an address: X-Forwarded-For is a list the caller
// can prepend to, and neither end of it is safe to key a limit on.
atest('the first ten attempts pass and the eleventh does not', async () => {
  await withUnlock({}, configured, async ({ unlock }) => {
    for (let i = 1; i <= 10; i++) {
      assert.strictEqual(await unlock.throttle(CALLER), true, `attempt ${i} was refused`)
    }
    assert.strictEqual(await unlock.throttle(CALLER), false)
  })
})

atest('one account being throttled does not throttle another', async () => {
  await withUnlock({}, configured, async ({ unlock }) => {
    for (let i = 0; i < 10; i++) await unlock.throttle(CALLER)
    assert.strictEqual(await unlock.throttle(CALLER), false)
    assert.strictEqual(await unlock.throttle(OTHER), true)
  })
})

atest('the count is persisted, so it survives a cold start', async () => {
  await withUnlock({}, configured, async ({ unlock }, s) => {
    await unlock.throttle(CALLER)
    await unlock.throttle(CALLER)
    assert.strictEqual(s.docs.get(`adminUnlockAttempts/${CALLER}`).count, 2)
  })
})

atest('a window older than fifteen minutes starts over', async () => {
  await withUnlock(
    { [`adminUnlockAttempts/${CALLER}`]: { count: 10, startedAt: Date.now() - 16 * 60_000 } },
    configured,
    async ({ unlock }, s) => {
      assert.strictEqual(await unlock.throttle(CALLER), true)
      assert.strictEqual(s.docs.get(`adminUnlockAttempts/${CALLER}`).count, 1, 'did not reset')
    },
  )
})

atest('a window still inside fifteen minutes keeps counting', async () => {
  await withUnlock(
    { [`adminUnlockAttempts/${CALLER}`]: { count: 10, startedAt: Date.now() - 60_000 } },
    configured,
    async ({ unlock }) => {
      assert.strictEqual(await unlock.throttle(CALLER), false)
    },
  )
})

// Otherwise creating accounts would farm fresh per-account budgets indefinitely.
atest('a shared budget bounds it across every account', async () => {
  await withUnlock(
    { 'adminUnlockAttempts/_global': { count: 60, startedAt: Date.now() } },
    configured,
    async ({ unlock }) => {
      assert.strictEqual(await unlock.throttle('a-brand-new-account'), false)
    },
  )
})

atest('the shared window also expires', async () => {
  await withUnlock(
    { 'adminUnlockAttempts/_global': { count: 60, startedAt: Date.now() - 16 * 60_000 } },
    configured,
    async ({ unlock }) => {
      assert.strictEqual(await unlock.throttle(CALLER), true)
    },
  )
})

// Firestore rejects document ids matching __.*__ at write time, which the client-side
// path validation does not catch — so the shared bucket cannot be called __all__.
atest('the shared bucket id is not a reserved one', async () => {
  await withUnlock({}, configured, async ({ unlock }, s) => {
    await unlock.throttle(CALLER)
    const shared = [...s.docs.keys()].find((p) => p.startsWith('adminUnlockAttempts/_'))
    assert.ok(shared, 'no shared bucket was written')
    assert.ok(!/__.*__/.test(shared.split('/').pop()), `${shared} is a reserved id`)
  })
})

atest('a uid needing escaping cannot break out of the collection', async () => {
  await withUnlock({}, configured, async ({ unlock }, s) => {
    await unlock.throttle('a/b')
    const keys = [...s.docs.keys()].filter((p) => p.startsWith('adminUnlockAttempts/'))
    for (const k of keys) {
      assert.strictEqual(k.split('/').length, 2, `${k} escaped the collection`)
    }
  })
})

// The pass itself: an opaque random string looked up server-side, same shape as the
// preview badge, so it is revocable and there is no signing key to manage.
atest('a live pass resolves to the account it was minted for', async () => {
  await withUnlock(
    { 'adminTokens/abc': { uid: CALLER, expiresAt: Date.now() + 60_000 } },
    configured,
    async ({ unlock }) => {
      assert.strictEqual((await unlock.claimAdminToken('abc')).uid, CALLER)
    },
  )
})

// Null rather than throwing: the caller may legitimately have no pass yet, which is the
// normal state of the admin page before the credential is entered.
atest('a missing or unknown pass resolves to nothing, not an error', async () => {
  await withUnlock({}, configured, async ({ unlock }) => {
    assert.strictEqual(await unlock.claimAdminToken(''), null)
    assert.strictEqual(await unlock.claimAdminToken('never-minted'), null)
  })
})

atest('an expired pass resolves to nothing and is cleaned up', async () => {
  await withUnlock(
    { 'adminTokens/stale': { uid: CALLER, expiresAt: Date.now() - 1 } },
    configured,
    async ({ unlock }, s) => {
      assert.strictEqual(await unlock.claimAdminToken('stale'), null)
      assert.strictEqual(s.docs.has('adminTokens/stale'), false, 'left behind')
    },
  )
})

// Minted per unlock and only removed when claimed after expiry, so the collection would
// otherwise grow without bound.
atest('the sweep removes expired passes and leaves live ones', async () => {
  await withUnlock(
    {
      'adminTokens/old': { uid: CALLER, expiresAt: Date.now() - 60_000 },
      'adminTokens/new': { uid: CALLER, expiresAt: Date.now() + 60_000 },
    },
    configured,
    async ({ unlock }, s) => {
      await unlock.sweepAdminTokens()
      assert.strictEqual(s.docs.has('adminTokens/old'), false, 'kept an expired pass')
      assert.strictEqual(s.docs.has('adminTokens/new'), true, 'swept a live pass')
    },
  )
})

run('unlock')
