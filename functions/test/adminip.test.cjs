// clientIp feeds the audit log, not the rate limit — the limit is keyed on the authenticated
// uid, precisely because X-Forwarded-For is attacker-influenced.
const assert = require('node:assert')
const { clientIp } = require('../lib/admin/unlock.js')

const cases = [
  // [xff, req.ip, expected, why]
  [undefined, '203.0.113.9', '203.0.113.9', 'no header at all'],
  ['', '203.0.113.9', '203.0.113.9', 'empty header'],
  ['203.0.113.9', undefined, '203.0.113.9', 'infrastructure set the only entry'],
  ['1.2.3.4, 203.0.113.9', undefined, '203.0.113.9', 'client forged one hop'],
  ['a, b, c, 203.0.113.9', undefined, '203.0.113.9', 'client forged several'],
  ['  1.2.3.4 ,  203.0.113.9  ', undefined, '203.0.113.9', 'whitespace around entries'],
  [undefined, undefined, 'unknown', 'nothing available'],
]

for (const [xff, fallback, expected, why] of cases) {
  assert.strictEqual(clientIp(xff, fallback), expected, why)
}

// The bug this file exists for: a forged leftmost entry must not become the bucket key.
assert.notStrictEqual(clientIp('1.2.3.4, 203.0.113.9', undefined), '1.2.3.4')

console.log(`ok — ${cases.length} client-ip cases, forged hops ignored`)
