const { test, done, assert } = require('./harness.cjs')
const { priceUsage } = require('../lib/generate/usage.js')

const M = 1_000_000
const at = (n) => Math.round(n * 1e6) / 1e6

test('sonnet prices input and output at its published rates', () => {
  const u = priceUsage('claude-sonnet-5', { input_tokens: M }, { output_tokens: M })
  assert.strictEqual(u.inputTokens, M)
  assert.strictEqual(u.outputTokens, M)
  assert.strictEqual(u.costUsd, at(2 + 10))
})

test('opus is the dearer of the three', () => {
  const u = priceUsage('claude-opus-5', { input_tokens: M }, { output_tokens: M })
  assert.strictEqual(u.costUsd, at(5 + 25))
})

test('haiku is the cheapest', () => {
  const u = priceUsage('claude-haiku-4-5', { input_tokens: M }, { output_tokens: M })
  assert.strictEqual(u.costUsd, at(1 + 5))
})

test('cache reads bill at a tenth of the input rate', () => {
  const u = priceUsage('claude-sonnet-5', { cache_read_input_tokens: M }, {})
  assert.strictEqual(u.cacheReadTokens, M)
  assert.strictEqual(u.costUsd, at(2 * 0.1))
})

test('cache writes bill at 1.25x the input rate', () => {
  const u = priceUsage('claude-sonnet-5', { cache_creation_input_tokens: M }, {})
  assert.strictEqual(u.cacheWriteTokens, M)
  assert.strictEqual(u.costUsd, at(2 * 1.25))
})

test('the four token kinds are summed together', () => {
  const u = priceUsage(
    'claude-sonnet-5',
    { input_tokens: M, cache_read_input_tokens: M, cache_creation_input_tokens: M },
    { output_tokens: M },
  )
  assert.strictEqual(u.costUsd, at(2 + 0.2 + 2.5 + 10))
})

// An unknown model costs nothing rather than throwing. A wrong number here must never be
// the reason a finished generation fails to save.
test('an unknown model prices at zero instead of throwing', () => {
  const u = priceUsage('some-future-model', { input_tokens: M }, { output_tokens: M })
  assert.strictEqual(u.costUsd, 0)
  assert.strictEqual(u.inputTokens, M, 'token counts are still recorded')
  assert.strictEqual(u.outputTokens, M)
})

test('the model is carried through onto the record', () => {
  assert.strictEqual(priceUsage('claude-opus-5', {}, {}).model, 'claude-opus-5')
})

// A stopped run has no final message, so these fields can be missing or null.
test('missing usage fields count as zero', () => {
  const u = priceUsage('claude-sonnet-5', {}, {})
  assert.deepStrictEqual(
    [u.inputTokens, u.outputTokens, u.cacheReadTokens, u.cacheWriteTokens, u.costUsd],
    [0, 0, 0, 0, 0],
  )
})

test('null cache fields count as zero', () => {
  const u = priceUsage(
    'claude-sonnet-5',
    { input_tokens: 10, cache_read_input_tokens: null, cache_creation_input_tokens: null },
    { output_tokens: 20 },
  )
  assert.strictEqual(u.cacheReadTokens, 0)
  assert.strictEqual(u.cacheWriteTokens, 0)
  assert.ok(u.costUsd > 0)
})

// A run stopped mid-stream still has to report what it burned, and a realistic
// generation costs fractions of a cent — so the rounding has to keep six places.
test('a small real generation does not round away to zero', () => {
  const u = priceUsage('claude-sonnet-5', { input_tokens: 7300 }, { output_tokens: 7400 })
  assert.ok(u.costUsd > 0, 'cost rounded to zero')
  assert.strictEqual(u.costUsd, at((7300 * 2 + 7400 * 10) / M))
})

test('cost is rounded to six decimal places', () => {
  const u = priceUsage('claude-sonnet-5', { input_tokens: 1 }, { output_tokens: 0 })
  assert.strictEqual(String(u.costUsd).replace(/^\d+\.?/, '').length <= 6, true)
})

done('usage')
