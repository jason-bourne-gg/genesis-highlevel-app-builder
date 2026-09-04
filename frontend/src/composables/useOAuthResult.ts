import { toast } from 'vue-sonner'

// Codes the callback can redirect back with, from functions/src/oauth/routes.ts.
const REASONS: Record<string, string> = {
  missing_code: 'HighLevel sent us back without an authorization code. Try connecting again.',
  bad_state: 'That connection request expired or was already used. Start it again from here.',
  token_exchange_failed:
    'HighLevel refused the connection. The app credentials or redirect URL may be wrong.',
  not_connected: 'The connection did not complete. Try again.',
  exchange_failed: 'Something went wrong finishing the HighLevel connection.',
}

// The callback returns the browser to the app with ?hl=connected or ?hl=error.
// Without this the user comes back from HighLevel to a page that looks unchanged.
export function readOAuthResult(): void {
  const params = new URLSearchParams(window.location.search)
  const result = params.get('hl')
  if (!result) return

  const reason = params.get('reason') ?? ''
  params.delete('hl')
  params.delete('reason')

  const rest = params.toString()
  window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''))

  if (result === 'connected') {
    toast.success('HighLevel connected')
    return
  }
  toast.error(REASONS[reason] ?? REASONS.exchange_failed, { duration: 10_000 })
}
