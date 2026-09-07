const { test, done, assert } = require('./harness.cjs')
const { systemPrompt, SYSTEM_PROMPT } = require('../lib/generate/prompt.js')

const OFF = { writes: false, extendedReads: false }
const WRITES = { writes: true, extendedReads: false }
const READS = { writes: false, extendedReads: true }
const BOTH = { writes: true, extendedReads: true }

const WRITE_CALLS = [
  'hl.contacts.create',
  'hl.contacts.update',
  'hl.conversations.send',
  'hl.calendars.book',
]

// The whole point of shipping this behind flags: with every flag off the model must see
// exactly what it saw before flags existed, so turning them off is a rollback and not a
// different code path.
test('the exported constant is the all-flags-off surface', () =>
  assert.strictEqual(SYSTEM_PROMPT, systemPrompt(OFF)))

test('the flags-off prompt is the original wording', () => {
  const p = systemPrompt(OFF)
  assert.match(p, /That is the whole API\. There is nothing else - no create, no update, no search/)
  assert.doesNotMatch(p, /## Writing/, 'a writing section appeared with every flag off')
})

test('the flags-off prompt names only the original four reads', () => {
  const p = systemPrompt(OFF)
  for (const call of ['hl.location.get', 'hl.contacts.list', 'hl.conversations.list', 'hl.calendars.events']) {
    assert.ok(p.includes(call), `${call} missing`)
  }
  for (const call of ['hl.contacts.search', 'hl.conversations.messages', 'hl.calendars.list', 'hl.calendars.slots']) {
    assert.ok(!p.includes(call), `${call} leaked into the read-only surface`)
  }
})

// The model must never be told about a call the proxy will refuse for that user.
test('write calls appear only when writes are on', () => {
  for (const call of WRITE_CALLS) {
    assert.ok(!systemPrompt(OFF).includes(call), `${call} with no flags`)
    assert.ok(!systemPrompt(READS).includes(call), `${call} with reads only`)
    assert.ok(systemPrompt(WRITES).includes(call), `${call} missing with writes on`)
    assert.ok(systemPrompt(BOTH).includes(call), `${call} missing with both on`)
  }
})

test('search and the message thread appear only with extended reads', () => {
  for (const call of ['hl.contacts.search', 'hl.conversations.messages']) {
    assert.ok(!systemPrompt(OFF).includes(call), `${call} with no flags`)
    assert.ok(!systemPrompt(WRITES).includes(call), `${call} with writes only`)
    assert.ok(systemPrompt(READS).includes(call), `${call} missing with reads on`)
  }
})

// Booking needs a calendar and a free time, so hl_writes carries those two reads.
test('writes bring the calendar reads with them', () => {
  for (const call of ['hl.calendars.list', 'hl.calendars.slots']) {
    assert.ok(systemPrompt(WRITES).includes(call), `${call} missing with writes on`)
    assert.ok(systemPrompt(READS).includes(call), `${call} missing with reads on`)
  }
})

// Every documented call must be one the server will actually serve, or the model builds
// a UI that 403s. This is the check that would have caught the writes block pointing at
// hl.contacts.search while search was gated behind a different flag.
test('every documented hl call is reachable under the flags that documented it', () => {
  const { READ_GATES } = require('../lib/hl/proxy.js')
  const RESOURCE = {
    'hl.location.get': 'location',
    'hl.contacts.list': 'contacts',
    'hl.contacts.search': 'search',
    'hl.conversations.list': 'conversations',
    'hl.conversations.messages': 'messages',
    'hl.calendars.list': 'calendars',
    'hl.calendars.events': 'events',
    'hl.calendars.slots': 'slots',
  }

  for (const [label, opts] of [['off', OFF], ['writes', WRITES], ['reads', READS], ['both', BOTH]]) {
    const prompt = systemPrompt(opts)
    const on = { hl_writes: opts.writes, hl_extended_reads: opts.extendedReads }

    for (const [call, resource] of Object.entries(RESOURCE)) {
      if (!prompt.includes(call)) continue
      const gates = READ_GATES[resource]
      const allowed = !gates || gates.some((g) => on[g])
      assert.ok(allowed, `${label}: prompt documents ${call} but the proxy would refuse ${resource}`)
    }
  }
})

test('the read-only surface says plainly that writing is unavailable', () => {
  assert.match(systemPrompt(READS), /## Writing is not available/)
  assert.doesNotMatch(systemPrompt(WRITES), /## Writing is not available/)
})

// The three-file rule and the shell contract are what the parser and validateShell rely
// on, so they must survive every combination.
test('the invariants hold under every flag combination', () => {
  // Named, so a failure says which invariant broke rather than only which combination.
  // \s+ rather than a space: the prompt is hard-wrapped, so a phrase can straddle lines.
  const INVARIANTS = {
    'three-file rule': /Never emit a path other than index\.html, styles\.css or app\.js/,
    'file delimiter': /<file path="index\.html">/,
    'no code fences': /No markdown code fences anywhere/,
    'hl.js is off limits': /Never emit\s+it, never import it, never redefine window\.hl/,
    'no build step': /no build step and no bundler/,
    'messy data warning': /Real data is messy/,
    'never an endless spinner': /never an endless spinner/,
    'style section': /## Style/,
  }

  for (const [label, opts] of [['off', OFF], ['writes', WRITES], ['reads', READS], ['both', BOTH]]) {
    const p = systemPrompt(opts)
    for (const [what, re] of Object.entries(INVARIANTS)) {
      assert.match(p, re, `${label}: lost the ${what}`)
    }
    assert.ok(!p.includes('undefined'), `${label}: a template hole rendered as "undefined"`)
    assert.ok(!/\n{3,}/.test(p), `${label}: blocks joined with a gap of blank lines`)
  }
})

test('cancellation and truncation guidance survives too', () => {
  assert.match(systemPrompt(WRITES), /err\.cancelled === true/)
  assert.match(systemPrompt(WRITES), /call hl\.refresh\(\)/)
})

done('prompt')
