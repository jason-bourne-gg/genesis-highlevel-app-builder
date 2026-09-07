const { test, done, assert } = require('./harness.cjs')
const { gate, isRoot } = require('../lib/flags/store.js')

const flag = (over = {}) => ({
  key: 'hl_writes',
  label: 'HighLevel write APIs',
  description: '',
  default: false,
  enabled: false,
  actors: [],
  updatedAt: 0,
  updatedBy: '',
  ...over,
})

const ALICE = 'uid_alice'
const BOB = 'uid_bob'

// Flipper's two gates: the boolean gate opens it for everyone, the actor gate for a named
// list. Either is enough, which is what makes "off for all but these three" expressible
// without a second flag.
test('off with no actors is off for everyone', () => {
  assert.strictEqual(gate(flag(), ALICE), false)
})

test('the boolean gate opens it for anyone', () => {
  assert.strictEqual(gate(flag({ enabled: true }), ALICE), true)
})

test('the boolean gate opens it even for a signed-out caller', () => {
  assert.strictEqual(gate(flag({ enabled: true }), null), true)
})

test('an actor gets it while everyone else does not', () => {
  const f = flag({ actors: [ALICE] })
  assert.strictEqual(gate(f, ALICE), true)
  assert.strictEqual(gate(f, BOB), false)
})

test('the actor gate needs a uid, so a signed-out caller is off', () => {
  assert.strictEqual(gate(flag({ actors: [ALICE] }), null), false)
})

test('the boolean gate wins over an empty actor list', () => {
  assert.strictEqual(gate(flag({ enabled: true, actors: [] }), BOB), true)
})

// google_login is read on the sign-in page, before anyone is signed in, so there is no
// account to target. An actor list on it must never be honoured.
test('a globalOnly flag ignores its actor list', () => {
  const f = flag({ globalOnly: true, actors: [ALICE] })
  assert.strictEqual(gate(f, ALICE), false)
})

test('a globalOnly flag still honours the boolean gate', () => {
  assert.strictEqual(gate(flag({ globalOnly: true, enabled: true }), ALICE), true)
})

test('a uid that merely contains an actor uid does not match', () => {
  assert.strictEqual(gate(flag({ actors: [ALICE] }), ALICE + '_extra'), false)
})

// Root is configuration, never data: a Firestore row that granted root would be a row
// worth attacking.
const withEnv = (env, fn) => {
  const saved = { ...process.env }
  Object.assign(process.env, env)
  try {
    fn()
  } finally {
    for (const k of Object.keys(env)) delete process.env[k]
    Object.assign(process.env, saved)
  }
}

test('nobody is root by default', () => {
  withEnv({ ROOT_UIDS: '', ROOT_EMAILS: '' }, () => {
    assert.strictEqual(isRoot(ALICE, 'alice@example.com', true), false)
  })
})

test('a configured uid is root', () => {
  withEnv({ ROOT_UIDS: `${BOB},${ALICE}` }, () => {
    assert.strictEqual(isRoot(ALICE), true)
  })
})

test('an unconfigured uid is not root', () => {
  withEnv({ ROOT_UIDS: BOB }, () => {
    assert.strictEqual(isRoot(ALICE), false)
  })
})

test('a verified configured email is root', () => {
  withEnv({ ROOT_EMAILS: 'boss@example.com' }, () => {
    assert.strictEqual(isRoot(ALICE, 'boss@example.com', true), true)
  })
})

// An unverified address is self-asserted at signup, so an allowlisted address nobody has
// registered yet would otherwise be an account anyone could claim.
test('an unverified configured email is refused', () => {
  withEnv({ ROOT_EMAILS: 'boss@example.com' }, () => {
    assert.strictEqual(isRoot(ALICE, 'boss@example.com', false), false)
  })
})

test('email matching ignores case', () => {
  withEnv({ ROOT_EMAILS: 'Boss@Example.com' }, () => {
    assert.strictEqual(isRoot(ALICE, 'boss@EXAMPLE.com', true), true)
  })
})

test('a missing email cannot be root by email', () => {
  withEnv({ ROOT_EMAILS: 'boss@example.com' }, () => {
    assert.strictEqual(isRoot(ALICE, undefined, true), false)
  })
})

test('whitespace around configured values is tolerated', () => {
  withEnv({ ROOT_UIDS: `  ${ALICE} , ${BOB} ` }, () => {
    assert.strictEqual(isRoot(BOB), true)
  })
})

done('flags')
