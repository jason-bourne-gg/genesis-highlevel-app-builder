const prefix = 'genesis:'

// Only ever used for UI preferences. Nothing here is authoritative — the app's
// state lives in Firestore.
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
    // Quota or private mode. The app stays usable, the preference just won't stick.
  }
}
