const { atest, run, assert } = require('./harness.cjs')
const { withStubs } = require('./stub.cjs')

const UID = 'uid_alice'
const ATTACKER = 'uid_mallory'
const ORIGIN = 'https://app.example.test'
const MIN = 60_000

const TOKENS = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 60 * MIN,
  locationId: 'loc_1',
}

const withOauth = (firestore, body) =>
  withStubs({ firestore }, { state: 'lib/oauth/state.js', handoff: 'lib/oauth/handoff.js' }, body)

// ---- state ---------------------------------------------------------------------------

atest('a minted state is a uuid stored against the account that started the flow', async () => {
  await withOauth({}, async ({ state }, s) => {
    const nonce = await state.mintState(UID, ORIGIN)
    assert.match(nonce, /^[0-9a-f-]{36}$/)
    const stored = s.docs.get(`oauthStates/${nonce}`)
    assert.strictEqual(stored.uid, UID)
    assert.strictEqual(stored.origin, ORIGIN, 'the return origin is vetted at mint, not at callback')
  })
})

atest('claiming a state returns it and burns it', async () => {
  await withOauth({}, async ({ state }, s) => {
    const nonce = await state.mintState(UID, ORIGIN)
    assert.strictEqual((await state.claimState(nonce)).uid, UID)
    assert.strictEqual(s.docs.has(`oauthStates/${nonce}`), false, 'left behind')
    await assert.rejects(state.claimState(nonce), (e) => e.code === 'bad_state')
  })
})

// The nonce arrives on HighLevel's redirect, so it is caller-controlled. A "/" would make
// it a path to some other document rather than a state.
atest('a malformed state is refused before it is used as a path', async () => {
  await withOauth({}, async ({ state }) => {
    for (const bad of ['', 'a/b/c', '../../users/uid_alice', 'not-a-uuid']) {
      await assert.rejects(state.claimState(bad), (e) => {
        assert.strictEqual(e.code, 'bad_state')
        assert.match(e.message, /Malformed/)
        return true
      })
    }
  })
})

atest('a state older than ten minutes is refused', async () => {
  await withOauth(
    { 'oauthStates/11111111-2222-3333-4444-555555555555': { uid: UID, origin: ORIGIN, createdAt: Date.now() - 11 * MIN } },
    async ({ state }) => {
      await assert.rejects(state.claimState('11111111-2222-3333-4444-555555555555'), (e) =>
        /expired/.test(e.message),
      )
    },
  )
})

// A user who closes the HighLevel tab never comes back to claim, so nothing else deletes it.
atest('abandoned states are swept, live ones are not', async () => {
  await withOauth(
    {
      'oauthStates/aaaaaaaa-1111-1111-1111-111111111111': { uid: UID, origin: ORIGIN, createdAt: Date.now() - 30 * MIN },
      'oauthStates/bbbbbbbb-2222-2222-2222-222222222222': { uid: UID, origin: ORIGIN, createdAt: Date.now() },
    },
    async ({ state }, s) => {
      await state.sweepExpiredStates()
      assert.strictEqual(s.docs.has('oauthStates/aaaaaaaa-1111-1111-1111-111111111111'), false, 'kept an abandoned state')
      assert.strictEqual(s.docs.has('oauthStates/bbbbbbbb-2222-2222-2222-222222222222'), true, 'swept a live one')
    },
  )
})

// ---- handoff -------------------------------------------------------------------------

atest('a handoff parks the tokens against the account the flow was started from', async () => {
  await withOauth({}, async ({ handoff }, s) => {
    const code = await handoff.mintHandoff({ uid: UID, tokens: TOKENS, locationName: 'Acme' })
    assert.match(code, /^[A-Za-z0-9_-]{43}$/)
    const stored = s.docs.get(`pendingConnections/${code}`)
    assert.strictEqual(stored.uid, UID)
    assert.strictEqual(stored.tokens.accessToken, 'access')
    assert.strictEqual(stored.locationName, 'Acme')
  })
})

atest('the account that started the flow can claim it, once', async () => {
  await withOauth({}, async ({ handoff }, s) => {
    const code = await handoff.mintHandoff({ uid: UID, tokens: TOKENS, locationName: 'Acme' })
    const pending = await handoff.claimHandoff(code, UID)
    assert.strictEqual(pending.tokens.refreshToken, 'refresh')
    assert.strictEqual(s.docs.has(`pendingConnections/${code}`), false, 'left behind')
    await assert.rejects(handoff.claimHandoff(code, UID), (e) => e.code === 'bad_handoff')
  })
})

// The attack this whole two-step exists for. An authorize URL is a link: start a flow, send
// the link to someone else, and whoever approves it at HighLevel is approving against the
// sender's state. Committing at the callback would hand their location to the sender.
atest('a different account cannot claim the handoff, and the tokens are dropped', async () => {
  await withOauth({}, async ({ handoff }, s) => {
    const code = await handoff.mintHandoff({ uid: ATTACKER, tokens: TOKENS, locationName: 'Victim Co' })

    await assert.rejects(handoff.claimHandoff(code, UID), (e) => {
      assert.strictEqual(e.code, 'handoff_mismatch')
      assert.strictEqual(e.status, 403)
      return true
    })

    assert.strictEqual(
      s.docs.has(`pendingConnections/${code}`),
      false,
      'a rejected handoff left live HighLevel tokens sitting in Firestore',
    )
  })
})

atest('a malformed handoff code is refused before it is used as a path', async () => {
  await withOauth({}, async ({ handoff }) => {
    for (const bad of ['', 'a/b/c', 'short']) {
      await assert.rejects(handoff.claimHandoff(bad, UID), (e) => e.code === 'bad_handoff')
    }
  })
})

atest('a handoff older than ten minutes is refused', async () => {
  const code = 'c'.repeat(43)
  await withOauth(
    { [`pendingConnections/${code}`]: { uid: UID, tokens: TOKENS, locationName: 'Acme', createdAt: Date.now() - 11 * MIN } },
    async ({ handoff }) => {
      await assert.rejects(handoff.claimHandoff(code, UID), (e) => /too long/.test(e.message))
    },
  )
})

// A browser that never comes back leaves live tokens here.
atest('expired handoffs are swept, live ones are not', async () => {
  const stale = 'd'.repeat(43)
  const fresh = 'e'.repeat(43)
  await withOauth(
    {
      [`pendingConnections/${stale}`]: { uid: UID, tokens: TOKENS, createdAt: Date.now() - 30 * MIN },
      [`pendingConnections/${fresh}`]: { uid: UID, tokens: TOKENS, createdAt: Date.now() },
    },
    async ({ handoff }, s) => {
      await handoff.sweepExpiredHandoffs()
      assert.strictEqual(s.docs.has(`pendingConnections/${stale}`), false, 'kept live tokens')
      assert.strictEqual(s.docs.has(`pendingConnections/${fresh}`), true, 'swept a live handoff')
    },
  )
})

run('oauth state and handoff')
