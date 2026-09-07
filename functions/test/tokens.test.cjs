const { atest, run: runSuite, assert } = require('./harness.cjs')
const { withStubs, json } = require('./stub.cjs')

Object.assign(process.env, {
  HL_CLIENT_ID: 'cid',
  HL_CLIENT_SECRET: 'csecret',
  HL_REDIRECT_URI: 'https://example.test/oauthCallback',
  HL_SCOPES: 'contacts.readonly',
})

const UID = 'uid_alice'
const DOC = `users/${UID}/private/highlevel`
const MIN = 60_000

const stored = (over = {}) => ({
  [DOC]: {
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    expiresAt: Date.now() + 60 * MIN,
    locationId: 'loc_1',
    ...over,
  },
})

const refreshed = (over = {}) =>
  json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 86400, ...over })

const withTokens = (opts, body) => withStubs(opts, { tokens: 'lib/hl/tokens.js' }, body)

// A HighLevel refresh token dies on first use, so everything here is about not spending
// one twice and not losing a field while replacing it.
atest('a connection that does not exist is a 412, not a crash', async () => {
    await withTokens({}, async ({ tokens }) => {
      await assert.rejects(tokens.accessTokenFor(UID), (e) => {
        assert.strictEqual(e.code, 'not_connected')
        assert.strictEqual(e.status, 412)
        return true
      })
    })
})

atest('a token with plenty of life is returned without contacting HighLevel', async () => {
    await withTokens({ firestore: stored() }, async ({ tokens }, s) => {
      const t = await tokens.accessTokenFor(UID)
      assert.strictEqual(t.accessToken, 'old-access')
      assert.strictEqual(s.calls.length, 0, 'refreshed a token that was still good')
    })
})

  // Refreshed before expiry rather than after a 401, so a request never fails first.
atest('a token inside the five-minute margin is refreshed', async () => {
    await withTokens(
      { firestore: stored({ expiresAt: Date.now() + 4 * MIN }), fetch: () => refreshed() },
      async ({ tokens }, s) => {
        const t = await tokens.accessTokenFor(UID)
        assert.strictEqual(t.accessToken, 'new-access')
        assert.strictEqual(t.refreshToken, 'new-refresh')
        assert.strictEqual(s.calls.length, 1)
        assert.match(s.calls[0].url, /\/oauth\/token$/)
        assert.strictEqual(s.docs.get(DOC).accessToken, 'new-access', 'not persisted')
      },
    )
})

atest('an expired token is refreshed', async () => {
    await withTokens(
      { firestore: stored({ expiresAt: Date.now() - MIN }), fetch: () => refreshed() },
      async ({ tokens }) => {
        assert.strictEqual((await tokens.accessTokenFor(UID)).accessToken, 'new-access')
      },
    )
})

  // The bug this guards: a refresh response can omit locationId, and replacing the document
  // would blank it.
atest('a refresh that omits locationId does not blank it', async () => {
    await withTokens(
      { firestore: stored({ expiresAt: Date.now() - MIN }), fetch: () => refreshed() },
      async ({ tokens }, s) => {
        const t = await tokens.accessTokenFor(UID)
        assert.strictEqual(t.locationId, 'loc_1')
        assert.strictEqual(s.docs.get(DOC).locationId, 'loc_1')
      },
    )
})

atest('a refresh that returns an empty locationId does not blank it either', async () => {
    await withTokens(
      {
        firestore: stored({ expiresAt: Date.now() - MIN }),
        fetch: () => refreshed({ locationId: '' }),
      },
      async ({ tokens }) => {
        assert.strictEqual((await tokens.accessTokenFor(UID)).locationId, 'loc_1')
      },
    )
})

atest('a refresh that does return a locationId updates it', async () => {
    await withTokens(
      {
        firestore: stored({ expiresAt: Date.now() - MIN }),
        fetch: () => refreshed({ locationId: 'loc_2' }),
      },
      async ({ tokens }) => {
        assert.strictEqual((await tokens.accessTokenFor(UID)).locationId, 'loc_2')
      },
    )
})

  // One resource request fans out over every calendar, so several callers hitting an expired
  // token at the same instant is the common path, not a rare race.
atest('concurrent callers share a single refresh', async () => {
    await withTokens(
      { firestore: stored({ expiresAt: Date.now() - MIN }), fetch: () => refreshed() },
      async ({ tokens }, s) => {
        const all = await Promise.all([
          tokens.accessTokenFor(UID),
          tokens.accessTokenFor(UID),
          tokens.accessTokenFor(UID),
          tokens.accessTokenFor(UID),
        ])
        assert.strictEqual(s.calls.length, 1, `spent ${s.calls.length} refresh tokens`)
        for (const t of all) assert.strictEqual(t.accessToken, 'new-access')
      },
    )
})

atest('the in-flight entry is released, so a later refresh still happens', async () => {
    await withTokens(
      { firestore: stored({ expiresAt: Date.now() - MIN }), fetch: () => refreshed() },
      async ({ tokens }, s) => {
        await tokens.accessTokenFor(UID)
        // Put it back into the expired state and ask again.
        s.docs.set(DOC, { ...s.docs.get(DOC), expiresAt: Date.now() - MIN })
        await tokens.accessTokenFor(UID)
        assert.strictEqual(s.calls.length, 2, 'the second refresh was swallowed')
      },
    )
})

atest('a failed refresh surfaces as token_exchange_failed', async () => {
    await withTokens(
      {
        firestore: stored({ expiresAt: Date.now() - MIN }),
        fetch: () => json({ error: 'invalid_grant' }, 400),
      },
      async ({ tokens }) => {
        await assert.rejects(tokens.accessTokenFor(UID), (e) => {
          assert.strictEqual(e.code, 'token_exchange_failed')
          assert.match(e.message, /400/)
          return true
        })
      },
    )
})

atest('a failed refresh does not overwrite the stored token', async () => {
    await withTokens(
      {
        firestore: stored({ expiresAt: Date.now() - MIN }),
        fetch: () => json({}, 500),
      },
      async ({ tokens }, s) => {
        await assert.rejects(tokens.accessTokenFor(UID))
        assert.strictEqual(s.docs.get(DOC).refreshToken, 'old-refresh')
      },
    )
})

atest('the code exchange posts form-encoded credentials, not JSON', async () => {
    await withTokens({ fetch: () => refreshed({ locationId: 'loc_9' }) }, async ({ tokens }, s) => {
      const t = await tokens.exchangeCode('the-code')
      const { init } = s.calls[0]
      assert.strictEqual(init.method, 'POST')
      assert.strictEqual(init.headers['Content-Type'], 'application/x-www-form-urlencoded')

      const sent = new URLSearchParams(String(init.body))
      assert.strictEqual(sent.get('grant_type'), 'authorization_code')
      assert.strictEqual(sent.get('code'), 'the-code')
      assert.strictEqual(sent.get('client_id'), 'cid')
      assert.strictEqual(sent.get('client_secret'), 'csecret')
      assert.strictEqual(sent.get('user_type'), 'Location', 'a location token, not an agency one')
      assert.strictEqual(sent.get('redirect_uri'), 'https://example.test/oauthCallback')
      assert.strictEqual(t.locationId, 'loc_9')
    })
})

atest('expiresAt is derived from expires_in', async () => {
    await withTokens({ fetch: () => refreshed({ expires_in: 3600 }) }, async ({ tokens }) => {
      const t = await tokens.exchangeCode('c')
      const hours = (t.expiresAt - Date.now()) / 3_600_000
      assert.ok(hours > 0.9 && hours < 1.1, `expected about an hour, got ${hours}`)
    })
})

atest('a response with no access_token is a failure even with a 200', async () => {
    await withTokens({ fetch: () => json({ refresh_token: 'r' }) }, async ({ tokens }) => {
      await assert.rejects(tokens.exchangeCode('c'), (e) => {
        assert.strictEqual(e.code, 'token_exchange_failed')
        return true
      })
    })
})

atest('disconnecting removes the stored tokens', async () => {
    await withTokens({ firestore: stored() }, async ({ tokens }, s) => {
      await tokens.clearTokens(UID)
      assert.strictEqual(s.docs.has(DOC), false)
    })
})

atest('readTokens returns null rather than throwing when absent', async () => {
    await withTokens({}, async ({ tokens }) => {
      assert.strictEqual(await tokens.readTokens(UID), null)
    })
})
runSuite('tokens')
