// Same-origin paths only: //evil.com is a valid path to the browser, so it would
// otherwise be an open redirect.
export function safeRedirect(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  return value
}
