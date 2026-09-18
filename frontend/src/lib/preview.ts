import type { ProjectFile } from '@/types'
import { functionsBase } from '@/lib/firebase'

const contentOf = (files: ProjectFile[], path: string) =>
  files.find((f) => f.path === path)?.content ?? ''

const originOf = (url: string) => {
  try {
    return new URL(url).origin
  } catch {
    return functionsBase
  }
}

// Where the frame posts its request for a pass. Read off the global rather than through
// `window` so this module still loads outside a browser.
const hostOrigin = () => globalThis.location?.origin ?? ''

// Belt to the MessageChannel's braces. The pass is no longer in the document, but generated
// code still runs here with whatever it read out of the location — so the only host it may
// open a connection to is the proxy. Scripts, styles and images stay permissive: locking
// those breaks ordinary generated apps, and without a credential to carry off they are not
// what makes this document dangerous. 'unsafe-eval' is Vue's runtime template compiler,
// which every app the model writes uses.
const policy = () =>
  [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
    "style-src 'unsafe-inline' https:",
    'img-src data: blob: https:',
    'font-src data: https:',
    `connect-src ${originOf(functionsBase)}`,
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ')

const withPolicy = (html: string): string => {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy()}" />`
  // A policy after the first script would not cover it, so it goes at the top of the head —
  // or, if the model ignored the template and wrote no head, at the top of the document,
  // which the parser hoists into one anyway.
  return /<head(\s[^>]*)?>/i.test(html)
    ? html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n    ${meta}`)
    : `${meta}\n${html}`
}

// hl.js is stored with placeholders; only the proxy's address and the write flag are filled
// in here. The pass itself is handed over at runtime and never appears in the source — see
// HL_CLIENT_SOURCE. `writes` comes from the server's own resolution of the hl_writes flag,
// not from anything the browser decided, and the proxy re-checks it on every write anyway.
function fillClient(source: string, writes: boolean): string {
  return source
    .replace(/__PREVIEW_BASE__/g, () => functionsBase)
    .replace(/__PREVIEW_HOST__/g, () => hostOrigin())
    .replace(/__PREVIEW_WRITES__/g, () => (writes ? 'on' : 'off'))
}

// No bundler: the files are inlined by replacing the tags that reference them.
export function buildPreview(files: ProjectFile[], writes = false): string {
  const html = contentOf(files, 'index.html')
  if (!html) return ''

  return withPolicy(
    html
      .replace(
        /<link[^>]+href=["'](?:\.\/)?styles\.css["'][^>]*>/i,
        () => `<style>\n${contentOf(files, 'styles.css')}\n</style>`,
      )
      .replace(
        /<script[^>]+src=["'](?:\.\/)?hl\.js["'][^>]*>\s*<\/script>/i,
        () => `<script>\n${fillClient(contentOf(files, 'hl.js'), writes)}\n</script>`,
      )
      .replace(
        /<script[^>]+src=["'](?:\.\/)?app\.js["'][^>]*>\s*<\/script>/i,
        () => `<script type="module">\n${contentOf(files, 'app.js')}\n</script>`,
      ),
  )
}

export function languageFor(path: string) {
  if (path.endsWith('.html')) return 'html'
  if (path.endsWith('.css')) return 'css'
  return 'javascript'
}
