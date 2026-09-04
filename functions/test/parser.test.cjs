// The stream parser is the one piece of this project where a bug is invisible:
// a delimiter split across a chunk boundary corrupts a file quietly. So it is
// tested against every possible split point, not a couple of hand-picked ones.
//
//   npm run build && npm test
const assert = require('node:assert')
const { FileStreamParser } = require('../lib/generate/parser.js')

const SOURCE =
  'Building it now.\n\n' +
  '<file path="index.html">\n<!doctype html>\n<div id="app"></div>\n</file>\n' +
  // A file whose body contains both a bare `<` and the closing tag split across
  // a string concatenation — the two things a naive split() would get wrong.
  '<file path="app.js">\nconst x = a < b\nconst s = "</fil" + "e>"\n</file>\n' +
  '<file path="styles.css">\nbody { margin: 0 }\n</file>\n' +
  '\nDone — three files.'

function run(chunks) {
  const parser = new FileStreamParser()
  const events = []
  for (const chunk of chunks) events.push(...parser.push(chunk))
  events.push(...parser.end())

  let prose = ''
  const files = new Map()
  const closed = []
  for (const e of events) {
    if (e.type === 'text') prose += e.text
    if (e.type === 'file') files.set(e.path, '')
    if (e.type === 'token') files.set(e.path, files.get(e.path) + e.text)
    if (e.type === 'close') closed.push(e.path)
  }
  return { prose, files: [...files], closed }
}

const whole = run([SOURCE])

assert.deepStrictEqual(whole.closed, ['index.html', 'app.js', 'styles.css'])
assert.strictEqual(whole.prose, 'Building it now.\n\nDone — three files.')
assert.strictEqual(
  whole.files.find(([p]) => p === 'app.js')[1],
  'const x = a < b\nconst s = "</fil" + "e>"\n',
)

for (let i = 1; i < SOURCE.length; i++) {
  const split = run([SOURCE.slice(0, i), SOURCE.slice(i)])
  assert.deepStrictEqual(split, whole, `split at ${i}: ${JSON.stringify(SOURCE.slice(i - 6, i + 6))}`)
}
assert.deepStrictEqual(run([...SOURCE]), whole, 'one character at a time')

// A file the stream died inside never gets a close event, so the caller can tell
// a finished file from a truncated one and refuse to commit the truncation.
const truncated = run([SOURCE.slice(0, SOURCE.indexOf('const s'))])
assert.deepStrictEqual(truncated.closed, ['index.html'])

console.log(`ok — ${SOURCE.length - 1} split points, per-character, and truncation`)
