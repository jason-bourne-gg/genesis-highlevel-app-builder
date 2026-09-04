import type { ProjectFile } from '@/types'

const contentOf = (files: ProjectFile[], path: string) =>
  files.find((f) => f.path === path)?.content ?? ''

export function buildPreview(files: ProjectFile[]): string {
  const html = contentOf(files, 'index.html')
  if (!html) return ''

  return html
    .replace(
      /<link[^>]+href=["']styles\.css["'][^>]*>/i,
      () => `<style>\n${contentOf(files, 'styles.css')}\n</style>`,
    )
    .replace(
      /<script[^>]+src=["']hl\.js["'][^>]*>\s*<\/script>/i,
      () => `<script>\n${contentOf(files, 'hl.js')}\n</script>`,
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
