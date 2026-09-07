import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
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
  'auth/popup-closed-by-user': 'The Google window closed before sign-in finished.',
  'auth/cancelled-popup-request': 'The Google window closed before sign-in finished.',
  'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site.',
  // Same email, different provider. Firebase will not merge them on its own.
  'auth/account-exists-with-different-credential':
    'That email already has a password account. Sign in with your password instead.',
  'auth/operation-not-allowed': 'Google sign-in is not enabled on this Firebase project yet.',
  'auth/unauthorized-domain': "This domain is not on Firebase Auth's authorised list.",
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

// Popup rather than redirect: a redirect round trip lands back on the app before the
// router has resolved the session, which is the same timing trap `ready` above exists for.
export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider()
  // Otherwise a browser with one Google session signs that account in silently, which is
  // surprising on a shared machine.
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    const { user } = await signInWithPopup(auth, provider)
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
