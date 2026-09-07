import { callFunction } from './api'

export interface PreviewGrant {
  token: string
  expiresAt: number
  // The server's own answer for whether hl_writes is on for this user. The frame is told,
  // so it can hide write controls rather than render buttons that 403.
  writes: boolean
}

// Short-lived and project-scoped: untrusted code never sees the HighLevel or Firebase token.
export function mintPreviewToken(projectId: string): Promise<PreviewGrant> {
  return callFunction<PreviewGrant>(`/previewToken?projectId=${encodeURIComponent(projectId)}`)
}
