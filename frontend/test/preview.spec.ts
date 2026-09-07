import { describe, expect, it, vi } from 'vitest'

// lib/firebase initialises the SDK on import, which a unit test neither needs nor wants.
vi.mock('@/lib/firebase', () => ({
  functionsBase: 'https://functions.example.test',
  auth: {},
  db: {},
}))

const { buildPreview, languageFor } = await import('@/lib/preview')
import type { ProjectFile } from '@/types'

// The exact shell the prompt tells the model to produce, which is also what
// functions/src/generate/validate.ts holds it to.
const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <title>App</title>
    <link rel="stylesheet" href="styles.css" />
    <script src="hl.js"></script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="app.js"></script>
  </body>
</html>`

const HL = `var BASE = '__PREVIEW_BASE__'
var TOKEN = '__PREVIEW_TOKEN__'
var WRITES = '__PREVIEW_WRITES__' === 'on'`

const files = (over: Partial<Record<string, string>> = {}): ProjectFile[] =>
  [
    { path: 'index.html', content: SHELL },
    { path: 'styles.css', content: ':root { --accent: #2244c4 }' },
    { path: 'app.js', content: "import { createApp } from 'vue'" },
    { path: 'hl.js', content: HL },
  ].map((f) => ({ ...f, content: over[f.path] ?? f.content }))

describe('buildPreview', () => {
  it('inlines all three referenced files', () => {
    const doc = buildPreview(files(), 'tok', false)
    expect(doc).toContain('<style>')
    expect(doc).toContain('--accent: #2244c4')
    expect(doc).toContain("import { createApp } from 'vue'")
    // The tags that referenced them are gone, replaced by the content.
    expect(doc).not.toContain('href="styles.css"')
    expect(doc).not.toContain('src="app.js"')
    expect(doc).not.toContain('src="hl.js"')
  })

  it('keeps app.js as a module, or its imports would not resolve', () => {
    expect(buildPreview(files(), 'tok', false)).toContain('<script type="module">')
  })

  // The credential is substituted per render, so the stored file never holds a live one.
  it('substitutes the base and the token', () => {
    const doc = buildPreview(files(), 'secret-token', false)
    expect(doc).toContain("var BASE = 'https://functions.example.test'")
    expect(doc).toContain("var TOKEN = 'secret-token'")
    expect(doc).not.toContain('__PREVIEW_BASE__')
    expect(doc).not.toContain('__PREVIEW_TOKEN__')
  })

  it('leaves no placeholder behind when writes are off', () => {
    const doc = buildPreview(files(), 'tok', false)
    expect(doc).toContain("var WRITES = 'off' === 'on'")
    expect(doc).not.toContain('__PREVIEW_WRITES__')
  })

  it('turns writes on only when told to', () => {
    expect(buildPreview(files(), 'tok', true)).toContain("var WRITES = 'on' === 'on'")
  })

  it('defaults writes to off when the argument is omitted', () => {
    expect(buildPreview(files(), 'tok')).toContain("var WRITES = 'off' === 'on'")
  })

  // A frame with no HighLevel connection still renders; hl.js reports the failure itself.
  it('renders with an empty token rather than refusing', () => {
    const doc = buildPreview(files(), '', false)
    expect(doc).toContain("var TOKEN = ''")
    expect(doc).toContain('<div id="app">')
  })

  it('returns nothing at all without an index.html', () => {
    expect(buildPreview([{ path: 'app.js', content: 'x' }], 'tok', false)).toBe('')
    expect(buildPreview([], 'tok', false)).toBe('')
  })

  it('substitutes a missing sibling as empty rather than throwing', () => {
    const only = [
      { path: 'index.html', content: SHELL },
      { path: 'hl.js', content: HL },
    ]
    const doc = buildPreview(only, 'tok', false)
    expect(doc).toContain('<style>')
    expect(doc).toContain('<script type="module">')
  })

  // $ and \ in generated code are replacement patterns to String.replace. Passing a
  // function is what stops "$&" in a stylesheet from duplicating the matched tag.
  it('treats replacement patterns in generated code literally', () => {
    const doc = buildPreview(
      files({ 'styles.css': '.a::after { content: "$& $1 $` \\\\" }' }),
      'tok',
      false,
    )
    expect(doc).toContain('content: "$& $1 $` \\\\"')
    expect(doc).not.toContain('href="styles.css"')
  })

  it('substitutes a token containing $ literally', () => {
    const doc = buildPreview(files(), "a$&b$'c", false)
    expect(doc).toContain("var TOKEN = 'a$&b$'c'")
  })

  it('accepts ./ prefixes and single quotes, as validateShell does', () => {
    const shell = SHELL.replace('href="styles.css"', "href='./styles.css'")
      .replace('src="hl.js"', 'src="./hl.js"')
      .replace('src="app.js"', "src='./app.js'")
    const doc = buildPreview(files({ 'index.html': shell }), 'tok', false)
    expect(doc).toContain('<style>')
    expect(doc).toContain('<script type="module">')
    expect(doc).toContain("var TOKEN = 'tok'")
  })
})

describe('languageFor', () => {
  it('maps the three editable files', () => {
    expect(languageFor('index.html')).toBe('html')
    expect(languageFor('styles.css')).toBe('css')
    expect(languageFor('app.js')).toBe('javascript')
  })

  it('falls back to javascript, which is what hl.js is', () => {
    expect(languageFor('hl.js')).toBe('javascript')
    expect(languageFor('mystery')).toBe('javascript')
  })
})
