// Re-validated server-side: an unchecked model id from the browser is an unbounded bill.
export const ALLOWED_MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'] as const

export function resolveModel(requested: unknown, fallback: string): string {
  const id = typeof requested === 'string' ? requested.trim() : ''
  return (ALLOWED_MODELS as readonly string[]).includes(id) ? id : fallback
}

// Haiku 4.5 predates adaptive thinking and rejects output_config.effort with a 400.
export const supportsAdaptiveThinking = (model: string) => !/haiku/i.test(model)
