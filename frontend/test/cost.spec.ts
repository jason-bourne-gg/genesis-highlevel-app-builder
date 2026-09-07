import { describe, expect, it } from 'vitest'
import { formatCost, formatTokens } from '@/lib/cost'

// A generation costs fractions of a cent, so two decimal places would show every one of
// them as $0.00 — which reads as "this is free" rather than "this is cheap".
describe('formatCost', () => {
  it('shows four places for a sub-cent cost', () => {
    expect(formatCost(0.0009)).toBe('$0.0009')
    expect(formatCost(0.009)).toBe('$0.0090')
  })

  it('shows two places once there is a cent to show', () => {
    expect(formatCost(0.09)).toBe('$0.09')
    expect(formatCost(1.5)).toBe('$1.50')
  })

  it('shows plain $0 for nothing, rather than $0.0000', () => {
    expect(formatCost(0)).toBe('$0')
    expect(formatCost(-1)).toBe('$0')
  })

  it('does not round a real cost away to zero', () => {
    expect(formatCost(0.00012)).not.toBe('$0')
  })
})

describe('formatTokens', () => {
  it('shows small counts exactly', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
  })

  it('switches to thousands at 1000', () => {
    expect(formatTokens(1000)).toBe('1.0k')
    expect(formatTokens(7300)).toBe('7.3k')
    expect(formatTokens(32000)).toBe('32.0k')
  })
})
