export type ParseEvent =
  | { type: 'text'; text: string }
  | { type: 'file'; path: string }
  | { type: 'token'; path: string; text: string }
  | { type: 'close'; path: string }

const OPEN = /<file\s+path="([^"]+)"\s*>/
const CLOSE = '</file>'

// How much of the tail could still turn out to be the front of `needle`.
function partialSuffix(buffer: string, needle: string): number {
  const max = Math.min(needle.length - 1, buffer.length)
  for (let k = max; k > 0; k--) {
    if (buffer.endsWith(needle.slice(0, k))) return k
  }
  return 0
}

// Outside a file, anything from an unclosed `<` onwards might be an opening tag.
function heldProse(buffer: string): number {
  const last = buffer.lastIndexOf('<')
  if (last === -1) return 0
  return buffer.indexOf('>', last) === -1 ? buffer.length - last : 0
}

/**
 * Splits one continuous model stream into prose and per-file token events.
 *
 * The only hard part is that a delimiter can straddle a chunk boundary — `</fi`
 * arriving at the end of one delta and `le>` at the start of the next. So the
 * parser never emits a tail that could still grow into a delimiter; it holds it
 * back until the next chunk proves otherwise. The result is identical whether the
 * model's output arrives in one piece or one character at a time.
 */
export class FileStreamParser {
  private buffer = ''
  private current: string | null = null
  // The newline after an opening tag is layout, not file content — but it may not
  // arrive in the same chunk as the tag, so it is stripped here rather than in the
  // regex, where it would depend on where the chunk happened to land.
  private atFileStart = false
  // Likewise, whitespace between one `</file>` and the next `<file>` is separator,
  // not prose. Without this the chat fills with blank lines mid-generation.
  private betweenFiles = false

  get openPath(): string | null {
    return this.current
  }

  private prose(raw: string): ParseEvent[] {
    let text = raw
    if (this.betweenFiles) {
      text = text.replace(/^\s+/, '')
      if (!text) return []
      this.betweenFiles = false
    }
    return text ? [{ type: 'text', text }] : []
  }

  private body(raw: string): ParseEvent[] {
    // Guard first: an empty slice must not consume the pending newline strip, or a
    // chunk that ends exactly on the opening tag's `>` leaves a stray blank line.
    if (!raw) return []
    let text = raw
    if (this.atFileStart) {
      text = text.replace(/^\r?\n/, '')
      this.atFileStart = false
    }
    return text ? [{ type: 'token', path: this.current as string, text }] : []
  }

  push(chunk: string): ParseEvent[] {
    this.buffer += chunk
    const events: ParseEvent[] = []

    for (;;) {
      if (this.current === null) {
        const match = OPEN.exec(this.buffer)
        if (match) {
          events.push(...this.prose(this.buffer.slice(0, match.index)))
          this.current = match[1]
          this.atFileStart = true
          this.buffer = this.buffer.slice(match.index + match[0].length)
          events.push({ type: 'file', path: this.current })
          continue
        }

        const hold = heldProse(this.buffer)
        events.push(...this.prose(this.buffer.slice(0, this.buffer.length - hold)))
        this.buffer = this.buffer.slice(this.buffer.length - hold)
        return events
      }

      const close = this.buffer.indexOf(CLOSE)
      if (close !== -1) {
        events.push(...this.body(this.buffer.slice(0, close)))
        events.push({ type: 'close', path: this.current })
        this.current = null
        this.atFileStart = false
        this.betweenFiles = true
        this.buffer = this.buffer.slice(close + CLOSE.length)
        continue
      }

      const hold = partialSuffix(this.buffer, CLOSE)
      events.push(...this.body(this.buffer.slice(0, this.buffer.length - hold)))
      this.buffer = this.buffer.slice(this.buffer.length - hold)
      return events
    }
  }

  // Whatever is left when the model stops. An unclosed file stays unclosed —
  // the caller decides that a file without its closing tag was never finished.
  end(): ParseEvent[] {
    const rest = this.buffer
    this.buffer = ''
    if (!rest) return []
    return this.current === null ? this.prose(rest) : this.body(rest)
  }
}
