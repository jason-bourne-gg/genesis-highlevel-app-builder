const { test, done, assert } = require('./harness.cjs')
const { ALLOWED_MODELS, resolveModel, supportsAdaptiveThinking } = require('../lib/generate/models.js')

const FALLBACK = 'claude-sonnet-5'

// The picker is a convenience; this allowlist is the control. An unchecked model id from
// a browser is an unbounded bill on someone else's account.
for (const id of ALLOWED_MODELS) {
  test(`allows ${id}`, () => assert.strictEqual(resolveModel(id, FALLBACK), id))
}

// Falls back rather than throwing, so an old tab holding a retired id still works.
for (const [what, value] of [
  ['an unknown id', 'gpt-4o'],
  ['a retired id', 'claude-3-opus-20240229'],
  ['the empty string', ''],
  ['whitespace', '   '],
  ['undefined', undefined],
  ['null', null],
  ['a number', 42],
  ['an object', { model: 'claude-opus-5' }],
  ['an array', ['claude-opus-5']],
  ['an id with an inner space', 'claude opus 5'],
  ['a prefix of an allowed id', 'claude-opus'],
  ['an allowed id with a suffix', 'claude-opus-5-evil'],
]) {
  test(`falls back for ${what}`, () =>
    assert.strictEqual(resolveModel(value, FALLBACK), FALLBACK))
}

test('trims surrounding whitespace before matching', () =>
  assert.strictEqual(resolveModel('  claude-opus-5  ', FALLBACK), 'claude-opus-5'))

test('the allowlist is exactly the three intended models', () =>
  assert.deepStrictEqual([...ALLOWED_MODELS].sort(), [
    'claude-haiku-4-5',
    'claude-opus-5',
    'claude-sonnet-5',
  ]))

// Haiku 4.5 predates adaptive thinking and rejects output_config.effort with a 400, so
// the request has to be built per model rather than fixed.
test('haiku does not get adaptive thinking', () =>
  assert.strictEqual(supportsAdaptiveThinking('claude-haiku-4-5'), false))

test('the check is case-insensitive', () =>
  assert.strictEqual(supportsAdaptiveThinking('Claude-Haiku-4-5'), false))

for (const id of ['claude-opus-5', 'claude-sonnet-5']) {
  test(`${id} gets adaptive thinking`, () =>
    assert.strictEqual(supportsAdaptiveThinking(id), true))
}

done('models')
