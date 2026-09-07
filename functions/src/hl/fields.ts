import { HlError } from '../errors'

// Write bodies come from code an LLM wrote, so fields are allowlisted rather than
// forwarded: an unexpected field on a CRM record is a silent data change.
export type Body = Record<string, unknown>

export const text = (v: unknown, max = 500): string | undefined => {
  if (v == null) return undefined
  const s = String(v).trim()
  if (!s) return undefined
  if (s.length > max) throw new HlError('invalid_write', `Value longer than ${max} characters`, 400)
  return s
}

export const required = (v: unknown, name: string, max = 500): string => {
  const s = text(v, max)
  if (!s) throw new HlError('invalid_write', `${name} is required`, 400)
  return s
}

export const iso = (v: unknown, name: string): string => {
  const s = required(v, name, 40)
  if (Number.isNaN(Date.parse(s))) {
    throw new HlError('invalid_write', `${name} must be an ISO date-time`, 400)
  }
  return s
}

export const tags = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined
  const out = v.map((t) => String(t).trim()).filter(Boolean).slice(0, 20)
  return out.length ? out : undefined
}

// Drops keys whose value came back undefined, so a partial body never sends nulls that
// would blank a field on the HighLevel record.
export const compact = (o: Body): Body =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

export const contactFields = (body: Body): Body =>
  compact({
    firstName: text(body.firstName, 100),
    lastName: text(body.lastName, 100),
    email: text(body.email, 200),
    phone: text(body.phone, 40),
    tags: tags(body.tags),
  })
