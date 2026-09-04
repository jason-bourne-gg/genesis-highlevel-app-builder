export interface GenerationUsage {
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number
}

// USD per million tokens. Cache reads bill at a tenth of the input rate and cache
// writes at 1.25x, per Anthropic's pricing.
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}

interface RawUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

export function priceUsage(model: string, input: RawUsage, output: RawUsage): GenerationUsage {
  const inputTokens = input.input_tokens ?? 0
  const cacheReadTokens = input.cache_read_input_tokens ?? 0
  const cacheWriteTokens = input.cache_creation_input_tokens ?? 0
  const outputTokens = output.output_tokens ?? 0

  // An unknown model costs nothing rather than throwing. A wrong number here must
  // never be the reason a finished generation fails to save.
  const rate = PRICES[model]
  const costUsd = rate
    ? (inputTokens * rate.input +
        cacheReadTokens * rate.input * 0.1 +
        cacheWriteTokens * rate.input * 1.25 +
        outputTokens * rate.output) /
      1_000_000
    : 0

  return {
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsd: Number(costUsd.toFixed(6)),
  }
}
