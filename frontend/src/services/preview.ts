import { callFunction } from './api'

export interface PreviewGrant {
  token: string
  expiresAt: number
}

// Short-lived and project-scoped: untrusted code never sees the HighLevel or Firebase token.
export function mintPreviewToken(projectId: string): Promise<PreviewGrant> {
  return callFunction<PreviewGrant>(`/previewToken?projectId=${encodeURIComponent(projectId)}`)
}
