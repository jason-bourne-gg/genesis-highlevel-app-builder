import { callFunction } from './api'

export interface PreviewGrant {
  token: string
  expiresAt: number
}

// Minted per render and scoped to one project. The generated app is untrusted
// code, so it gets a short-lived credential for a read-only proxy — never the
// HighLevel token, and never the user's Firebase session.
export function mintPreviewToken(projectId: string): Promise<PreviewGrant> {
  return callFunction<PreviewGrant>(`/previewToken?projectId=${encodeURIComponent(projectId)}`)
}
