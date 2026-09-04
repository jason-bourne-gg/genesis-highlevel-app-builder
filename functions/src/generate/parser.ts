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

// Splits the stream into prose and file events, holding back any tail that could still
// grow into a delimiter — so a delimiter straddling a chunk boundary parses the same.
export class FileStreamParser {
  private buffer = ''
  private current: string | null = null
  // The newline after an opening tag is layout, not content, and may land in a later chunk.
  private atFileStart = false
  // Whitespace between one `</file>` and the next `<file>` is separator, not prose.
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
    // Guard first: an empty slice must not consume the pending newline strip.
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

  // An unclosed file stays unclosed; the caller treats a missing close tag as truncation.
  end(): ParseEvent[] {
    const rest = this.buffer
    this.buffer = ''
    if (!rest) return []
    return this.current === null ? this.prose(rest) : this.body(rest)
  }
}
