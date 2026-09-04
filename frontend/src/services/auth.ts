import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import type { User } from '@/types'

const shape = (u: FirebaseUser | null): User | null =>
  u ? { id: u.uid, email: u.email ?? '' } : null

// Firebase restores a persisted session asynchronously. Anything that gates on
// "is someone signed in" — the router guard above all — must await this first,
// or it will decide against a null user and bounce to /signin on every refresh.
let settle: (user: User | null) => void
export const ready = new Promise<User | null>((resolve) => {
  settle = resolve
})

export function watch(onChange: (user: User | null) => void): void {
  onAuthStateChanged(auth, (u) => {
    const user = shape(u)
    settle(user)
    onChange(user)
  })
}

const messages: Record<string, string> = {
  'auth/email-already-in-use': 'That email already has an account. Try signing in.',
  'auth/invalid-email': "That email address doesn't look right.",
  'auth/weak-password': 'Passwords need to be at least six characters.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/user-not-found': 'No account with that email.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/network-request-failed': 'Could not reach Firebase. Check your connection.',
}

function readable(e: unknown): Error {
  const code = (e as { code?: string })?.code ?? ''
  return new Error(messages[code] ?? 'Something went wrong. Try again.')
}

export async function signIn(email: string, password: string): Promise<User> {
  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password)
    return shape(user)!
  } catch (e) {
    throw readable(e)
  }
}

export async function signUp(email: string, password: string): Promise<User> {
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password)
    return shape(user)!
  } catch (e) {
    throw readable(e)
  }
}

export function signOut(): Promise<void> {
  return firebaseSignOut(auth)
}

export async function idToken(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')
  return user.getIdToken()
}
