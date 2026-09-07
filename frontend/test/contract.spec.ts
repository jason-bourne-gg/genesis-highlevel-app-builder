import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/firebase', () => ({
  functionsBase: 'https://functions.example.test',
  auth: {},
  db: {},
}))

const { buildPreview } = await import('@/lib/preview')
import type { ProjectFile } from '@/types'

// validate.ts and preview.ts agree on three tags without importing each other. Drift
// means a saved generation the browser renders blank, with no error anywhere.
const ROOT = resolve(__dirname, '../..')

// Compiled rather than the .ts source, so the test exercises what actually ships.
const server = await import(
  /* @vite-ignore */ resolve(ROOT, 'functions/lib/generate/validate.js')
)

const HL = "var BASE = '__PREVIEW_BASE__'\nvar TOKEN = '__PREVIEW_TOKEN__'\nvar W = '__PREVIEW_WRITES__'"

const shellWith = (link: string, hl: string, app: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>App</title>
    ${link}
    ${hl}
  </head>
  <body>
    <div id="app"></div>
    ${app}
  </body>
</html>`

const filesFor = (shell: string): ProjectFile[] => [
  { path: 'index.html', content: shell },
  { path: 'styles.css', content: '.marker-css {}' },
  { path: 'app.js', content: 'const markerJs = 1' },
  { path: 'hl.js', content: HL },
]

const accepted = (shell: string) =>
  server.validateShell(new Map(filesFor(shell).map((f) => [f.path, f.content])), new Set(['index.html'])) === null

const stitched = (shell: string) => {
  const doc = buildPreview(filesFor(shell), 'tok', false)
  return (
    doc.includes('.marker-css {}') &&
    doc.includes('const markerJs = 1') &&
    doc.includes("var TOKEN = 'tok'")
  )
}

// Every one of these is a shell a model could plausibly emit. What matters is not which
// verdict each gets, but that both sides reach the same one.
const VARIANTS: [string, string, string, string][] = [
  ['the exact shape the prompt specifies',
    '<link rel="stylesheet" href="styles.css" />', '<script src="hl.js"></script>', '<script type="module" src="app.js"></script>'],
  ['attributes reordered',
    '<link href="styles.css" rel="stylesheet" />', '<script src="hl.js"></script>', '<script src="app.js" type="module"></script>'],
  ['single quotes',
    "<link rel='stylesheet' href='styles.css'>", "<script src='hl.js'></script>", "<script type='module' src='app.js'></script>"],
  ['./ prefixes',
    '<link rel="stylesheet" href="./styles.css" />', '<script src="./hl.js"></script>', '<script type="module" src="./app.js"></script>'],
  ['uppercase tags',
    '<LINK REL="stylesheet" HREF="styles.css">', '<SCRIPT SRC="hl.js"></SCRIPT>', '<SCRIPT TYPE="module" SRC="app.js"></SCRIPT>'],
  ['no self-closing slash on the link',
    '<link rel="stylesheet" href="styles.css">', '<script src="hl.js"></script>', '<script type="module" src="app.js"></script>'],
  ['extra attributes present',
    '<link rel="stylesheet" href="styles.css" media="all" />', '<script src="hl.js" defer></script>', '<script type="module" src="app.js" crossorigin></script>'],
  ['the stylesheet missing',
    '', '<script src="hl.js"></script>', '<script type="module" src="app.js"></script>'],
  ['hl.js missing',
    '<link rel="stylesheet" href="styles.css" />', '', '<script type="module" src="app.js"></script>'],
  ['app.js missing',
    '<link rel="stylesheet" href="styles.css" />', '<script src="hl.js"></script>', ''],
  ['everything missing',
    '', '', ''],
  ['a different stylesheet name',
    '<link rel="stylesheet" href="main.css" />', '<script src="hl.js"></script>', '<script type="module" src="app.js"></script>'],
  ['app.js not a module',
    '<link rel="stylesheet" href="styles.css" />', '<script src="hl.js"></script>', '<script src="app.js"></script>'],
]

describe('the shell contract between validate.ts and preview.ts', () => {
  it.each(VARIANTS)('agrees on %s', (_what, link, hl, app) => {
    const shell = shellWith(link, hl, app)
    // A shell the server accepts must stitch, and one it rejects must not have been
    // saved — so the only forbidden combination is accepted-but-unstitchable.
    expect(
      { accepted: accepted(shell), stitched: stitched(shell) },
    ).toSatisfy(
      ({ accepted: a, stitched: s }: { accepted: boolean; stitched: boolean }) => !a || s,
    )
  })

  it('accepts and stitches every shape the prompt allows', () => {
    for (const [what, link, hl, app] of VARIANTS.slice(0, 7)) {
      const shell = shellWith(link, hl, app)
      expect(accepted(shell), `server rejected: ${what}`).toBe(true)
      expect(stitched(shell), `browser could not stitch: ${what}`).toBe(true)
    }
  })

  it('rejects every shell with a tag missing, rather than saving an unrenderable one', () => {
    for (const [what, link, hl, app] of VARIANTS.slice(7, 11)) {
      expect(accepted(shellWith(link, hl, app)), `server accepted: ${what}`).toBe(false)
    }
  })

  it('holds the same three tags in both files', () => {
    const serverSrc = readFileSync(resolve(ROOT, 'functions/src/generate/validate.ts'), 'utf8')
    const clientSrc = readFileSync(resolve(ROOT, 'frontend/src/lib/preview.ts'), 'utf8')
    for (const target of ['styles\\.css', 'hl\\.js', 'app\\.js']) {
      expect(serverSrc, `validate.ts stopped matching ${target}`).toContain(target)
      expect(clientSrc, `preview.ts stopped matching ${target}`).toContain(target)
    }
  })
})
