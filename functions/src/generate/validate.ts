import type { ProjectFile } from './store'

// Must stay in step with buildPreview() in frontend/src/lib/preview.ts, which
// stitches the files together by replacing exactly these tags.
const REQUIRED = [
  { what: 'a <link> to styles.css', re: /<link[^>]+href=["']styles\.css["'][^>]*>/i },
  { what: 'a <script src="hl.js"> tag', re: /<script[^>]+src=["']hl\.js["'][^>]*>\s*<\/script>/i },
  {
    what: 'a <script type="module" src="app.js"> tag',
    re: /<script[^>]+src=["']app\.js["'][^>]*>\s*<\/script>/i,
  },
]

// A shell missing one of these renders blank with no error, which is the worst
// possible failure: it looks like the generated app is broken.
export function validateShell(files: Map<string, string>): string | null {
  const html = files.get('index.html')
  if (!html) return 'The model did not produce an index.html, so there is nothing to preview.'

  const missing = REQUIRED.filter(({ re }) => !re.test(html)).map(({ what }) => what)
  if (!missing.length) return null

  return `index.html is missing ${missing.join(' and ')}. The preview stitches the files together by finding those tags, so nothing was saved.`
}

export const asFiles = (files: Map<string, string>): ProjectFile[] =>
  [...files.entries()].map(([path, content]) => ({ path, content }))

// The prompt forbids code fences, but a model that slips one in would otherwise
// write ```js into the file and break the app silently.
export function stripFence(content: string): string {
  const text = content.replace(/^\n+/, '')
  const fenced = /^```[a-zA-Z]*\n([\s\S]*?)\n?```\s*$/.exec(text.trim())
  return fenced ? fenced[1] : text
}
