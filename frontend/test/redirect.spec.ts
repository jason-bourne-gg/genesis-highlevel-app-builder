import { describe, expect, it } from 'vitest'
import { safeRedirect } from '@/lib/redirect'

// The guard puts the intended path in a query parameter, which means the value comes
// back through the URL and is therefore attacker-supplied.
describe('safeRedirect', () => {
  it('accepts an in-app path', () => {
    expect(safeRedirect('/admin/flags')).toBe('/admin/flags')
    expect(safeRedirect('/project/abc123')).toBe('/project/abc123')
    expect(safeRedirect('/')).toBe('/')
  })

  it('keeps a query string and hash on the intended path', () => {
    expect(safeRedirect('/project/abc?tab=files#L10')).toBe('/project/abc?tab=files#L10')
  })

  // A protocol-relative URL is a valid path to the browser, so this is the case that
  // would quietly turn the sign-in page into an open redirect.
  it('refuses a protocol-relative URL', () => {
    expect(safeRedirect('//evil.com')).toBeNull()
    expect(safeRedirect('//evil.com/admin/flags')).toBeNull()
  })

  it('refuses an absolute URL to another origin', () => {
    for (const value of [
      'https://evil.com',
      'http://evil.com/admin/flags',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
    ]) {
      expect(safeRedirect(value), value).toBeNull()
    }
  })

  it('refuses a bare path with no leading slash', () => {
    expect(safeRedirect('admin/flags')).toBeNull()
    expect(safeRedirect('evil.com')).toBeNull()
  })

  it('refuses anything that is not a string', () => {
    for (const value of [undefined, null, 42, ['/admin/flags'], { path: '/admin/flags' }]) {
      expect(safeRedirect(value)).toBeNull()
    }
  })

  it('refuses the empty string, so an empty parameter falls back', () => {
    expect(safeRedirect('')).toBeNull()
  })
})
