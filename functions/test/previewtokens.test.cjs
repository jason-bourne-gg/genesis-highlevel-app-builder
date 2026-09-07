const { atest, run, assert } = require('./harness.cjs')
const { withStubs } = require('./stub.cjs')

const UID = 'uid_alice'
const OTHER = 'uid_bob'
const PROJECT = 'proj_1'

const withTokens = (firestore, body) =>
  withStubs({ firestore }, { pt: 'lib/preview/tokens.js' }, body)

const owned = { [`projects/${PROJECT}`]: { ownerUid: UID } }

// A sandboxed frame has no identity of its own — no cookies, no session — so it cannot prove
// who it is.
atest('a minted pass is long, random and stored against the project', async () => {
  await withTokens({}, async ({ pt }, s) => {
    const a = await pt.mintPreviewToken(UID, PROJECT)
    const b = await pt.mintPreviewToken(UID, PROJECT)
    assert.notStrictEqual(a.token, b.token, 'two mints produced the same pass')
    assert.ok(a.token.length >= 40, `pass was only ${a.token.length} characters`)
    assert.match(a.token, /^[A-Za-z0-9_-]+$/, 'not url-safe')

    const grant = s.docs.get(`previewTokens/${a.token}`)
    assert.strictEqual(grant.uid, UID)
    assert.strictEqual(grant.projectId, PROJECT)
    assert.strictEqual(grant.writes, 0, 'the write budget did not start at zero')
  })
})

atest('a pass lasts fifteen minutes, which only has to outlive one render', async () => {
  await withTokens({}, async ({ pt }) => {
    const { expiresAt } = await pt.mintPreviewToken(UID, PROJECT)
    const minutes = (expiresAt - Date.now()) / 60_000
    assert.ok(minutes > 14 && minutes <= 15, `lasted ${minutes} minutes`)
  })
})

atest('claiming a live pass returns who it was minted for', async () => {
  await withTokens({}, async ({ pt }) => {
    const { token } = await pt.mintPreviewToken(UID, PROJECT)
    const grant = await pt.claimPreviewToken(token)
    assert.strictEqual(grant.uid, UID)
    assert.strictEqual(grant.projectId, PROJECT)
  })
})

atest('an unknown pass is a 401, not a 500', async () => {
  await withTokens({}, async ({ pt }) => {
    await assert.rejects(pt.claimPreviewToken('made-up'), (e) => {
      assert.strictEqual(e.code, 'bad_preview_token')
      assert.strictEqual(e.status, 401)
      return true
    })
  })
})

atest('a missing pass is refused before any lookup', async () => {
  await withTokens({}, async ({ pt }) => {
    await assert.rejects(pt.claimPreviewToken(''), (e) => e.code === 'no_preview_token')
  })
})

atest('an expired pass is refused and deleted on the way out', async () => {
  const token = 'stale'
  await withTokens(
    { [`previewTokens/${token}`]: { uid: UID, projectId: PROJECT, expiresAt: Date.now() - 1000, writes: 0 } },
    async ({ pt }, s) => {
      await assert.rejects(pt.claimPreviewToken(token), (e) => /expired/.test(e.message))
      assert.strictEqual(s.docs.has(`previewTokens/${token}`), false, 'left behind')
    },
  )
})

// Badges minted before the budget existed have no writes field, and defaulting it wrong
// would either lock them out or give them an unlimited allowance.
atest('a pass predating the write budget is treated as having spent none', async () => {
  const token = 'legacy'
  await withTokens(
    { [`previewTokens/${token}`]: { uid: UID, projectId: PROJECT, expiresAt: Date.now() + 60_000 } },
    async ({ pt }) => {
      const grant = await pt.claimPreviewWrite(token)
      assert.strictEqual(grant.writes, 0)
    },
  )
})

// The confirmation dialog lives in hl.js, but the badge sits in the same document as the
// generated code — so this budget is what bounds a runaway loop.
atest('each write spends one from the budget', async () => {
  await withTokens({}, async ({ pt }, s) => {
    const { token } = await pt.mintPreviewToken(UID, PROJECT)
    await pt.claimPreviewWrite(token)
    await pt.claimPreviewWrite(token)
    assert.strictEqual(s.docs.get(`previewTokens/${token}`).writes, 2)
  })
})

atest('the budget runs out at twenty-five and says how to get a fresh one', async () => {
  const token = 'spent'
  await withTokens(
    { [`previewTokens/${token}`]: { uid: UID, projectId: PROJECT, expiresAt: Date.now() + 60_000, writes: 25 } },
    async ({ pt }) => {
      await assert.rejects(pt.claimPreviewWrite(token), (e) => {
        assert.strictEqual(e.code, 'write_budget_spent')
        assert.strictEqual(e.status, 429)
        assert.match(e.message, /Reload the preview/)
        return true
      })
    },
  )
})

atest('an expired pass cannot be used for a write either', async () => {
  const token = 'stale'
  await withTokens(
    { [`previewTokens/${token}`]: { uid: UID, projectId: PROJECT, expiresAt: Date.now() - 1, writes: 0 } },
    async ({ pt }) => {
      await assert.rejects(pt.claimPreviewWrite(token), (e) => /expired/.test(e.message))
    },
  )
})

atest('a write with no pass is refused', async () => {
  await withTokens({}, async ({ pt }) => {
    await assert.rejects(pt.claimPreviewWrite(''), (e) => e.code === 'no_preview_token')
  })
})

// The client sends a project id, and nothing stops it sending someone else's.
atest('ownership is checked, so a pass is only issued for your own project', async () => {
  await withTokens(owned, async ({ pt }) => {
    await pt.assertOwns(UID, PROJECT)
    await assert.rejects(pt.assertOwns(OTHER, PROJECT), (e) => {
      assert.strictEqual(e.code, 'forbidden')
      assert.strictEqual(e.status, 403)
      return true
    })
  })
})

atest('a project that does not exist is forbidden, not missing', async () => {
  await withTokens({}, async ({ pt }) => {
    await assert.rejects(pt.assertOwns(UID, 'nope'), (e) => e.status === 403)
  })
})

// A pass is minted on every render and only deleted when claimed after expiry, so
// without a sweep the collection grows for the life of the project.
atest('the sweep removes expired passes and leaves live ones', async () => {
  await withTokens(
    {
      'previewTokens/old': { uid: UID, projectId: PROJECT, expiresAt: Date.now() - 60_000, writes: 0 },
      'previewTokens/new': { uid: UID, projectId: PROJECT, expiresAt: Date.now() + 60_000, writes: 0 },
    },
    async ({ pt }, s) => {
      await pt.sweepExpired()
      assert.strictEqual(s.docs.has('previewTokens/old'), false, 'kept an expired pass')
      assert.strictEqual(s.docs.has('previewTokens/new'), true, 'swept a live pass')
    },
  )
})

run('preview tokens')
