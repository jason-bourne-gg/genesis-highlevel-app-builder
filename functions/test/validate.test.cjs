const { test, done, assert } = require('./harness.cjs')
const { validateShell, stripFence, asFiles } = require('../lib/generate/validate.js')

const SHELL = `<!doctype html>
<html lang="en"><head>
<link rel="stylesheet" href="styles.css" />
<script src="hl.js"></script>
</head><body><div id="app"></div>
<script type="module" src="app.js"></script>
</body></html>`

const wrote = (...paths) => new Set(paths)
const files = (html) => new Map([['index.html', html]])

// The preview stitches the files together by finding these three tags.
test('a complete shell passes', () => {
  assert.strictEqual(validateShell(files(SHELL), wrote('index.html')), null)
})

test('no index.html at all is rejected', () => {
  const why = validateShell(new Map([['app.js', 'x']]), wrote('app.js'))
  assert.match(why, /did not produce an index\.html/)
})

for (const [what, tag] of [
  ['styles.css link', '<link rel="stylesheet" href="styles.css" />'],
  ['hl.js script', '<script src="hl.js"></script>'],
  ['app.js script', '<script type="module" src="app.js"></script>'],
]) {
  test(`a shell missing the ${what} is rejected, and says which`, () => {
    const why = validateShell(files(SHELL.replace(tag, '')), wrote('index.html'))
    assert.ok(why, `expected a rejection with the ${what} removed`)
    assert.match(why, /missing/)
    assert.match(why, /nothing was saved/)
  })
}

test('two missing tags are both named', () => {
  const broken = SHELL.replace('<script src="hl.js"></script>', '').replace(
    '<script type="module" src="app.js"></script>',
    '',
  )
  const why = validateShell(files(broken), wrote('index.html'))
  assert.match(why, /hl\.js/)
  assert.match(why, /app\.js/)
  assert.match(why, / and /)
})

// A hand-edited shell is the user's own business. Policing it would mean one manual edit
// failing every future generation on the project, which is unfixable from the UI.
test('a broken shell the model did not write this turn is left alone', () => {
  const broken = files(SHELL.replace('<script src="hl.js"></script>', ''))
  assert.strictEqual(validateShell(broken, wrote('styles.css')), null)
})

test('a missing index.html is still rejected even when not written this turn', () => {
  const why = validateShell(new Map(), wrote('styles.css'))
  assert.match(why, /nothing to preview/)
})

// The tags are matched loosely on purpose: attribute order and ./ prefixes vary.
for (const variant of [
  '<link href="./styles.css" rel="stylesheet">',
  "<link rel='stylesheet' href='styles.css'>",
  '<LINK REL="stylesheet" HREF="styles.css">',
]) {
  test(`accepts a styles.css link written as ${variant.slice(0, 34)}…`, () => {
    const html = SHELL.replace('<link rel="stylesheet" href="styles.css" />', variant)
    assert.strictEqual(validateShell(files(html), wrote('index.html')), null)
  })
}

test('accepts ./ prefixes on the scripts', () => {
  const html = SHELL.replace('src="hl.js"', 'src="./hl.js"').replace(
    'src="app.js"',
    'src="./app.js"',
  )
  assert.strictEqual(validateShell(files(html), wrote('index.html')), null)
})

// The prompt forbids code fences, but a model that slips one in would otherwise write
// ```js as line one and break the app silently.
test('strips a fenced block, keeping the code', () => {
  assert.strictEqual(stripFence('```js\nconst a = 1\n```'), 'const a = 1')
})

test('strips a fence with no language', () => {
  assert.strictEqual(stripFence('```\nbody {}\n```'), 'body {}')
})

test('leaves unfenced content exactly as it is', () => {
  assert.strictEqual(stripFence('const a = 1\n'), 'const a = 1\n')
})

test('leaves a fence that is only opened, since that is not a wrapper', () => {
  assert.strictEqual(stripFence('```js\nconst a = 1'), '```js\nconst a = 1')
})

test('does not strip a fence that appears mid-file', () => {
  const src = 'const md = "```js"\nconsole.log(md)\n'
  assert.strictEqual(stripFence(src), src)
})

test('drops leading blank lines', () => {
  assert.strictEqual(stripFence('\n\nconst a = 1'), 'const a = 1')
})

test('asFiles turns the map into path/content records', () => {
  const out = asFiles(new Map([['a.js', '1'], ['b.css', '2']]))
  assert.deepStrictEqual(out, [
    { path: 'a.js', content: '1' },
    { path: 'b.css', content: '2' },
  ])
})

done('validate')
