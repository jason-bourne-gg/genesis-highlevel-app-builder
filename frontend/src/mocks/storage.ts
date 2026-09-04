const prefix = 'genesis:'

export function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(prefix + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function write(key: string, value: unknown) {
  try {
    localStorage.setItem(prefix + key, JSON.stringify(value))
  } catch {
    // quota or private mode — the app stays usable, it just won't survive a refresh
  }
}

export function drop(key: string) {
  localStorage.removeItem(prefix + key)
}

export function uid(scope: string) {
  return `${scope}_${Math.random().toString(36).slice(2, 10)}`
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
