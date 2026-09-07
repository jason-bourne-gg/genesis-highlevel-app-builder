import type { ProjectFile } from '@/types'
import { functionsBase } from '@/lib/firebase'

const contentOf = (files: ProjectFile[], path: string) =>
  files.find((f) => f.path === path)?.content ?? ''

// hl.js is stored with placeholders; the credential is substituted here, per render.
// `writes` comes from the server's own resolution of the hl_writes flag, not from
// anything the browser decided, and the proxy re-checks it on every write anyway.
function fillClient(source: string, token: string, writes: boolean): string {
  return source
    .replace(/__PREVIEW_BASE__/g, () => functionsBase)
    .replace(/__PREVIEW_TOKEN__/g, () => token)
    .replace(/__PREVIEW_WRITES__/g, () => (writes ? 'on' : 'off'))
}

// No bundler: the files are inlined by replacing the tags that reference them.
export function buildPreview(files: ProjectFile[], previewToken = '', writes = false): string {
  const html = contentOf(files, 'index.html')
  if (!html) return ''

  return html
    .replace(
      /<link[^>]+href=["'](?:\.\/)?styles\.css["'][^>]*>/i,
      () => `<style>\n${contentOf(files, 'styles.css')}\n</style>`,
    )
    .replace(
      /<script[^>]+src=["'](?:\.\/)?hl\.js["'][^>]*>\s*<\/script>/i,
      () => `<script>\n${fillClient(contentOf(files, 'hl.js'), previewToken, writes)}\n</script>`,
    )
    .replace(
      /<script[^>]+src=["'](?:\.\/)?app\.js["'][^>]*>\s*<\/script>/i,
      () => `<script type="module">\n${contentOf(files, 'app.js')}\n</script>`,
    )
}

export function languageFor(path: string) {
  if (path.endsWith('.html')) return 'html'
  if (path.endsWith('.css')) return 'css'
  return 'javascript'
}
