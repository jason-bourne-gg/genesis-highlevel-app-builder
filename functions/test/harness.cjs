// Names each case and keeps going after a failure, so one run lists everything wrong.
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

// Awaited in order, so a stubbed module is never swapped out from under a running case.
const queue = []

function atest(name, fn) {
  queue.push([name, fn])
}

async function run(label) {
  for (const [name, fn] of queue) {
    count++
    try {
      await fn()
    } catch (e) {
      failures++
      console.error(`  ✗ ${name}\n    ${(e.message || String(e)).split('\n').join('\n    ')}`)
    }
  }
  done(label)
}

function done(label) {
  if (failures) {
    console.error(`not ok — ${label}: ${failures} of ${count} cases failed`)
    process.exit(1)
  }
  console.log(`ok — ${label}, ${count} cases`)
}

module.exports = { test, atest, run, throws, done, assert }
