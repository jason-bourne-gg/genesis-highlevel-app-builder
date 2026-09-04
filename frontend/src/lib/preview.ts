import type { ProjectFile } from '@/types'
import { functionsBase } from '@/lib/firebase'

const contentOf = (files: ProjectFile[], path: string) =>
  files.find((f) => f.path === path)?.content ?? ''

// The generated app's hl.js is stored with placeholders, which is what the editor
// shows. The credential itself is substituted here, at render time, and lives only
// in the srcdoc of one iframe.
function fillClient(source: string, token: string): string {
  return source
    .replace(/__PREVIEW_BASE__/g, () => functionsBase)
    .replace(/__PREVIEW_TOKEN__/g, () => token)
}

/**
 * Stitches the project's files into one document for the iframe.
 *
 * The generated app is four separate files in Firestore — separately edited,
 * separately versioned — but there is no bundler, so they are concatenated by
 * replacing the tags that reference them. index.html is load-bearing: without it
 * there is nothing to stitch into.
 */
export function buildPreview(files: ProjectFile[], previewToken = ''): string {
  const html = contentOf(files, 'index.html')
  if (!html) return ''

  return html
    .replace(
      /<link[^>]+href=["']styles\.css["'][^>]*>/i,
      () => `<style>\n${contentOf(files, 'styles.css')}\n</style>`,
    )
    .replace(
      /<script[^>]+src=["']hl\.js["'][^>]*>\s*<\/script>/i,
      () => `<script>\n${fillClient(contentOf(files, 'hl.js'), previewToken)}\n</script>`,
    )
    .replace(
      /<script[^>]+src=["']app\.js["'][^>]*>\s*<\/script>/i,
      () => `<script type="module">\n${contentOf(files, 'app.js')}\n</script>`,
    )
}

export function languageFor(path: string) {
  if (path.endsWith('.html')) return 'html'
  if (path.endsWith('.css')) return 'css'
  return 'javascript'
}
