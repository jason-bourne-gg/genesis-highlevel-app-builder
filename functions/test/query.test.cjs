const { test, done, assert } = require('./harness.cjs')
const { queryFrom, READ_GATES } = require('../lib/hl/proxy.js')

// Forwarding the whole query string would let a caller append arbitrary parameters to a
// HighLevel URL, so only the ones the read handlers understand are carried through.
test('carries the four understood parameters', () => {
  assert.deepStrictEqual(
    queryFrom({ q: 'asha', conversationId: 'c1', calendarId: 'cal1', days: '7' }),
    { q: 'asha', conversationId: 'c1', calendarId: 'cal1', days: '7' },
  )
})

test('drops anything not on the list', () => {
  assert.deepStrictEqual(
    queryFrom({ q: 'asha', limit: '9999', locationId: 'someone-elses', apiKey: 'x' }),
    { q: 'asha' },
  )
})

test('drops non-string values, so an array cannot become a repeated parameter', () => {
  assert.deepStrictEqual(queryFrom({ q: ['a', 'b'], calendarId: 5, days: null }), {})
})

test('drops empty strings rather than sending a blank parameter', () => {
  assert.deepStrictEqual(queryFrom({ q: '', calendarId: 'cal1' }), { calendarId: 'cal1' })
})

test('caps a value at 200 characters', () => {
  const out = queryFrom({ q: 'a'.repeat(500) })
  assert.strictEqual(out.q.length, 200)
})

test('an empty query yields an empty object', () => {
  assert.deepStrictEqual(queryFrom({}), {})
})

// Reads added after the flags existed are gated; the original four stay ungated, so an
// all-flags-off deployment exposes exactly what it always did.
test('the original four reads are ungated', () => {
  for (const name of ['location', 'contacts', 'conversations', 'events']) {
    assert.strictEqual(READ_GATES[name], undefined, `${name} became gated`)
  }
})

test('search and the message thread need the extended-reads flag', () => {
  assert.deepStrictEqual(READ_GATES.search, ['hl_extended_reads'])
  assert.deepStrictEqual(READ_GATES.messages, ['hl_extended_reads'])
})

// Booking cannot work without a calendar and a free slot, so either flag is enough.
test('calendars and slots come with either flag', () => {
  for (const name of ['calendars', 'slots']) {
    assert.deepStrictEqual([...READ_GATES[name]].sort(), ['hl_extended_reads', 'hl_writes'])
  }
})

done('query')
