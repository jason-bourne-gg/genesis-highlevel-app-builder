// A test file here is a plain node script, which keeps the suite dependency-free but
// means an assertion failure reports a stack rather than which case broke. This gives
// each case a name and keeps going after a failure, so one run lists everything wrong.
const assert = require('node:assert')

let failures = 0
let count = 0

function test(name, fn) {
  count++
  try {
    fn()
  } catch (e) {
    failures++
    console.error(`  ✗ ${name}\n    ${(e.message || String(e)).split('\n').join('\n    ')}`)
  }
}

// Asserts the call throws, and that the message explains itself — an error a user may
// see is part of the behaviour, not an implementation detail.
function throws(fn, matching) {
  assert.throws(fn, (e) => {
    assert.ok(
      matching.test(e.message),
      `message ${JSON.stringify(e.message)} does not match ${matching}`,
    )
    return true
  })
}

function done(label) {
  if (failures) {
    console.error(`not ok — ${label}: ${failures} of ${count} cases failed`)
    process.exit(1)
  }
  console.log(`ok — ${label}, ${count} cases`)
}

module.exports = { test, throws, done, assert }
