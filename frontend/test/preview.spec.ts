import { describe, expect, it, vi } from 'vitest'

// lib/firebase initialises the SDK on import, which a unit test neither needs nor wants.
vi.mock('@/lib/firebase', () => ({
  functionsBase: 'https://functions.example.test',
  auth: {},
  db: {},
}))

// Runs under node, so the one browser global the module reads is stubbed rather than
// pulling in a DOM just for an origin string.
vi.stubGlobal('location', { origin: 'https://app.example.test' })

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
var HOST = '__PREVIEW_HOST__'
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
    const doc = buildPreview(files(), false)
    expect(doc).toContain('<style>')
    expect(doc).toContain('--accent: #2244c4')
    expect(doc).toContain("import { createApp } from 'vue'")
    // The tags that referenced them are gone, replaced by the content.
    expect(doc).not.toContain('href="styles.css"')
    expect(doc).not.toContain('src="app.js"')
    expect(doc).not.toContain('src="hl.js"')
  })

  it('keeps app.js as a module, or its imports would not resolve', () => {
    expect(buildPreview(files(), false)).toContain('<script type="module">')
  })

  it('substitutes the proxy address and the host to hand the pass back over', () => {
    const doc = buildPreview(files(), false)
    expect(doc).toContain("var BASE = 'https://functions.example.test'")
    expect(doc).toContain("var HOST = 'https://app.example.test'")
    expect(doc).not.toContain('__PREVIEW_BASE__')
    expect(doc).not.toContain('__PREVIEW_HOST__')
  })

  // The point of the MessageChannel handshake: app.js is model-written and shares this
  // document, so a pass anywhere in it is a pass that code can read and send on.
  it('puts no HighLevel pass in the document', () => {
    const doc = buildPreview(files(), true)
    expect(doc).not.toContain('PREVIEW_TOKEN')
    expect(doc).not.toMatch(/var TOKEN = '.+'/)
  })

  it('leaves no placeholder behind when writes are off', () => {
    const doc = buildPreview(files(), false)
    expect(doc).toContain("var WRITES = 'off' === 'on'")
    expect(doc).not.toContain('__PREVIEW_WRITES__')
  })

  it('turns writes on only when told to', () => {
    expect(buildPreview(files(), true)).toContain("var WRITES = 'on' === 'on'")
  })

  it('defaults writes to off when the argument is omitted', () => {
    expect(buildPreview(files())).toContain("var WRITES = 'off' === 'on'")
  })

  // A frame with no HighLevel connection still renders; hl.js reports the failure itself
  // once the handshake comes back empty.
  it('renders without a connection rather than refusing', () => {
    const doc = buildPreview(files(), false)
    expect(doc).toContain('<div id="app">')
  })

  // Belt to the handshake's braces: whatever generated code gets hold of, the only host it
  // may open a connection to is the proxy.
  it('locks the document to the proxy for outbound connections', () => {
    const doc = buildPreview(files(), false)
    expect(doc).toContain('http-equiv="Content-Security-Policy"')
    expect(doc).toContain('connect-src https://functions.example.test')
    // Vue comes off a CDN by import map, and its runtime compiler needs eval.
    expect(doc).toContain('https://cdn.jsdelivr.net')
    expect(doc).toContain("'unsafe-eval'")
  })

  // Before the first script, or it would not cover it.
  it('puts the policy at the top of the head', () => {
    const doc = buildPreview(files(), false)
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<style>'))
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<script>'))
  })

  // A model that ignored the template and wrote no head still gets a policy.
  it('still applies a policy to a shell with no head', () => {
    const headless = '<!doctype html><body><div id="app"></div><script type="module" src="app.js"></script></body>'
    const doc = buildPreview(files({ 'index.html': headless }), false)
    expect(doc).toContain('Content-Security-Policy')
  })

  it('returns nothing at all without an index.html', () => {
    expect(buildPreview([{ path: 'app.js', content: 'x' }], false)).toBe('')
    expect(buildPreview([], false)).toBe('')
  })

  it('substitutes a missing sibling as empty rather than throwing', () => {
    const only = [
      { path: 'index.html', content: SHELL },
      { path: 'hl.js', content: HL },
    ]
    const doc = buildPreview(only, false)
    expect(doc).toContain('<style>')
    expect(doc).toContain('<script type="module">')
  })

  // $ and \ in generated code are replacement patterns to String.replace. Passing a
  // function is what stops "$&" in a stylesheet from duplicating the matched tag.
  it('treats replacement patterns in generated code literally', () => {
    const doc = buildPreview(
      files({ 'styles.css': '.a::after { content: "$& $1 $` \\\\" }' }),
      false,
    )
    expect(doc).toContain('content: "$& $1 $` \\\\"')
    expect(doc).not.toContain('href="styles.css"')
  })

  it('accepts ./ prefixes and single quotes, as validateShell does', () => {
    const shell = SHELL.replace('href="styles.css"', "href='./styles.css'")
      .replace('src="hl.js"', 'src="./hl.js"')
      .replace('src="app.js"', "src='./app.js'")
    const doc = buildPreview(files({ 'index.html': shell }), false)
    expect(doc).toContain('<style>')
    expect(doc).toContain('<script type="module">')
    expect(doc).toContain("var BASE = 'https://functions.example.test'")
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
