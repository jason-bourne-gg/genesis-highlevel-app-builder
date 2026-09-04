/**
 * The models a request is allowed to name.
 *
 * The picker lives in the browser, so the model id arrives from the client — and
 * the client is the one thing that cannot be trusted with it. An unchecked value
 * here is an unbounded bill on someone else's key, so anything not on this list is
 * ignored and the configured default is used instead.
 *
 * Mirrored for labels and pricing in frontend/src/composables/useModel.ts. This
 * list is the one that decides.
 */
export const ALLOWED_MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'] as const

export function resolveModel(requested: unknown, fallback: string): string {
  const id = typeof requested === 'string' ? requested.trim() : ''
  return (ALLOWED_MODELS as readonly string[]).includes(id) ? id : fallback
}

// Haiku 4.5 predates adaptive thinking and rejects output_config.effort with a 400,
// so the request shape has to follow the model rather than being fixed.
export const supportsAdaptiveThinking = (model: string) => !/haiku/i.test(model)
