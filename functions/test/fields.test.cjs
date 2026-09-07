const { test, throws, done, assert } = require('./harness.cjs')
const { text, required, iso, tags, compact, contactFields } = require('../lib/hl/fields.js')

// Write bodies arrive from code an LLM wrote from a one-line prompt, so every field is
// allowlisted and coerced rather than forwarded. An unexpected field on a CRM record is
// a silent data change.
test('text trims', () => assert.strictEqual(text('  Asha  '), 'Asha'))
test('text treats an all-whitespace value as absent', () => assert.strictEqual(text('   '), undefined))
test('text treats null and undefined as absent', () => {
  assert.strictEqual(text(null), undefined)
  assert.strictEqual(text(undefined), undefined)
})
test('text coerces a number', () => assert.strictEqual(text(42), '42'))
test('text accepts a value at the limit', () => assert.strictEqual(text('a'.repeat(500)), 'a'.repeat(500)))
test('text rejects a value over the limit', () =>
  throws(() => text('a'.repeat(501)), /longer than 500/))
test('text honours a smaller limit', () => throws(() => text('abcdef', 5), /longer than 5/))

test('required accepts a value', () => assert.strictEqual(required('x', 'name'), 'x'))
test('required names the field it is missing', () =>
  throws(() => required('', 'contactId'), /contactId is required/))
test('required rejects whitespace', () => throws(() => required('  ', 'title'), /required/))

test('iso accepts an ISO date-time', () => {
  const t = '2026-09-09T14:00:00.000Z'
  assert.strictEqual(iso(t, 'startTime'), t)
})
test('iso rejects a non-date', () =>
  throws(() => iso('next tuesday', 'startTime'), /startTime must be an ISO date-time/))
test('iso rejects an empty value as missing', () =>
  throws(() => iso('', 'startTime'), /required/))

test('tags trims, drops blanks and coerces', () =>
  assert.deepStrictEqual(tags([' lead ', '', 'vip', 7]), ['lead', 'vip', '7']))
test('tags ignores a non-array', () => {
  assert.strictEqual(tags('lead'), undefined)
  assert.strictEqual(tags(undefined), undefined)
})
test('an all-blank array counts as absent', () => assert.strictEqual(tags(['', '  ']), undefined))
test('tags are capped at twenty', () => {
  const out = tags(Array.from({ length: 40 }, (_, i) => `t${i}`))
  assert.strictEqual(out.length, 20)
})

// A partial body must never send nulls that would blank a field on the record.
test('compact drops undefined but keeps falsy values that were set', () =>
  assert.deepStrictEqual(compact({ a: 1, b: undefined, c: '', d: 0, e: false }), {
    a: 1,
    c: '',
    d: 0,
    e: false,
  }))

test('contactFields keeps only the five allowed fields', () => {
  const out = contactFields({
    firstName: 'Asha',
    lastName: 'Rao',
    email: 'asha@x.com',
    phone: '+15551234',
    tags: ['lead'],
    // None of these may reach HighLevel.
    id: 'someone-elses-contact',
    locationId: 'another-sub-account',
    dnd: true,
    customField: 'x',
    __proto__: { polluted: true },
  })
  assert.deepStrictEqual(Object.keys(out).sort(), ['email', 'firstName', 'lastName', 'phone', 'tags'])
})

test('contactFields omits fields that were not supplied, rather than nulling them', () => {
  const out = contactFields({ phone: '+15551234' })
  assert.deepStrictEqual(out, { phone: '+15551234' })
  assert.strictEqual('firstName' in out, false, 'would blank the name on the record')
})

test('contactFields enforces its own per-field limits', () => {
  throws(() => contactFields({ firstName: 'a'.repeat(101) }), /longer than 100/)
  throws(() => contactFields({ email: 'a'.repeat(201) }), /longer than 200/)
  throws(() => contactFields({ phone: '9'.repeat(41) }), /longer than 40/)
})

test('an empty body yields no fields at all', () =>
  assert.deepStrictEqual(contactFields({}), {}))

done('fields')
