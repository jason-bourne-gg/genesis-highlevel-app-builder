export class HlError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502,
  ) {
    super(message)
  }
}

export function isHlError(e: unknown): e is HlError {
  return e instanceof HlError
}
