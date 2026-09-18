import { toast } from 'vue-sonner'
import { ApiError } from '@/services/api'
import { finishOAuth } from '@/services/highlevel'

// Codes the callback and the finish step can come back with, from functions/src/oauth/.
const REASONS: Record<string, string> = {
  missing_code: 'HighLevel sent us back without an authorization code. Try connecting again.',
  bad_state: 'That connection request expired or was already used. Start it again from here.',
  bad_handoff: 'That connection took too long to finish. Start it again from here.',
  handoff_mismatch:
    'That HighLevel connection was started from a different account, so nothing was connected.',
  token_exchange_failed:
    'HighLevel refused the connection. The app credentials or redirect URL may be wrong.',
  not_connected: 'The connection did not complete. Try again.',
  exchange_failed: 'Something went wrong finishing the HighLevel connection.',
}

// Strips the parameters before anything awaits, so a reload cannot replay a handoff code
// and the code does not sit in the address bar while the request is in flight.
function take(): { result: string; reason: string; handoff: string } | null {
  const params = new URLSearchParams(window.location.search)
  const result = params.get('hl')
  if (!result) return null

  const reason = params.get('reason') ?? ''
  const handoff = params.get('handoff') ?? ''
  params.delete('hl')
  params.delete('reason')
  params.delete('handoff')

  const rest = params.toString()
  window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''))
  return { result, reason, handoff }
}

// The callback returns the browser to the app with ?hl=pending, ?hl=connected or ?hl=error.
// Without this the user comes back from HighLevel to a page that looks unchanged.
export async function readOAuthResult(): Promise<void> {
  const taken = take()
  if (!taken) return

  const { result, reason, handoff } = taken

  if (result === 'pending') {
    const pending = toast.loading('Finishing the HighLevel connection…')
    try {
      const { locationName } = await finishOAuth(handoff)
      toast.success(`HighLevel connected${locationName ? ` — ${locationName}` : ''}`, {
        id: pending,
      })
    } catch (e) {
      const code = e instanceof ApiError ? e.code : ''
      toast.error(REASONS[code] ?? (e as Error).message, { id: pending, duration: 10_000 })
    }
    return
  }

  // Kept for a callback that fails before it has anything to hand over.
  if (result === 'connected') {
    toast.success('HighLevel connected')
    return
  }
  toast.error(REASONS[reason] ?? REASONS.exchange_failed, { duration: 10_000 })
}
