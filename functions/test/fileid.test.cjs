const { test, done, assert } = require('./harness.cjs')
const { fileId } = require('../lib/generate/store.js')
const fs = require('node:fs')
const path = require('node:path')

// Two write paths land in this collection — the generation function through the admin SDK, and
// the browser for manual edits and restores.
test('the browser and the server derive ids with the same expression', () => {
  const client = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/services/projects.ts'),
    'utf8',
  )
  const match = client.match(/export const fileId = \(path: string\) =>\s*(.+)/)
  assert.ok(match, 'could not find fileId in the frontend')
  assert.match(
    match[1],
    /path\.replace\(\/\[\^a-zA-Z0-9\._-\]\/g, '_'\)/,
    'the frontend expression no longer matches the server',
  )
})

test('the four real paths are stable and distinct', () => {
  const ids = ['index.html', 'app.js', 'styles.css', 'hl.js'].map(fileId)
  assert.deepStrictEqual(ids, ['index.html', 'app.js', 'styles.css', 'hl.js'])
  assert.strictEqual(new Set(ids).size, 4)
})

// Firestore ids cannot contain "/", and a path that produced one would throw on write.
test('a separator cannot survive into an id', () => {
  assert.strictEqual(fileId('src/app.js').includes('/'), false)
  assert.strictEqual(fileId('../../etc/passwd').includes('/'), false)
})

test('every character outside the allowed set is replaced', () => {
  assert.strictEqual(fileId('a b?c#d.js'), 'a_b_c_d.js')
})

test('dots, dashes and underscores are kept, since real filenames use them', () => {
  assert.strictEqual(fileId('my-file_v2.min.css'), 'my-file_v2.min.css')
})

test('the same path always gives the same id', () => {
  assert.strictEqual(fileId('index.html'), fileId('index.html'))
})

done('fileId')
