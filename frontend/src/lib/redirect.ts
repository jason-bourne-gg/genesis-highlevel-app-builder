// Where sign-in should return someone after the guard bounced them here.
//
// Same-origin paths only. A protocol-relative value like //evil.com is a valid path as
// far as the browser is concerned, so accepting one would make this an open redirect.
export function safeRedirect(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  return value
}
