import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth'
import { auth, functionsBase } from '@/lib/firebase'
import type { User } from '@/types'

// The root claim lives on the ID token, so it has to be read out rather than inferred.
// Resolved once per auth change and cached on the shaped user.
async function shape(u: FirebaseUser | null): Promise<User | null> {
  if (!u) return null
  let root = false
  try {
    const result = await u.getIdTokenResult()
    root = result.claims.root === true
  } catch {
    // A token we cannot read is a token without root. Never a blocking failure.
  }
  return { id: u.uid, email: u.email ?? rootLabel(u) ?? '', root }
}

// A root session has no email address, so give the menus something to show.
const rootLabel = (u: FirebaseUser) => (u.uid.startsWith('root_') ? u.uid.slice(5) : null)

// An identifier with no @ is a root username, not an email.
export const looksLikeUsername = (identifier: string) => !identifier.includes('@')

// Firebase restores a persisted session asynchronously. Anything that gates on
// "is someone signed in" — the router guard above all — must await this first,
// or it will decide against a null user and bounce to /signin on every refresh.
let settle: (user: User | null) => void
export const ready = new Promise<User | null>((resolve) => {
  settle = resolve
})

export function watch(onChange: (user: User | null) => void): void {
  onAuthStateChanged(auth, (u) => {
    // Async because the root claim comes off the ID token. `settle` still fires exactly
    // once, so the router guard keeps working the way it did.
    void shape(u).then((user) => {
      settle(user)
      onChange(user)
    })
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
    return (await shape(user))!
  } catch (e) {
    throw readable(e)
  }
}

// Root sign-in, in two steps. The function checks the credential against functions/.env,
// brings the root account into line with it and stamps the `root` claim, then hands back
// the address to sign in with. The credential is never in this bundle, and the username
// the user typed is not itself an email address.
export async function signInAsRoot(username: string, password: string): Promise<User> {
  const res = await fetch(`${functionsBase}/rootLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

  const body = (await res.json().catch(() => ({}))) as { email?: string; error?: string }
  if (!res.ok || !body.email) {
    throw new Error(body.error ?? 'Root sign-in failed')
  }

  try {
    const { user } = await signInWithEmailAndPassword(auth, body.email, password)
    return (await shape(user))!
  } catch (e) {
    throw readable(e)
  }
}

export async function signUp(email: string, password: string): Promise<User> {
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password)
    return (await shape(user))!
  } catch (e) {
    throw readable(e)
  }
}

// Popup rather than redirect: a redirect round trip would land back on the app before
// the router has resolved the session, which is the same timing trap as `ready` below.
export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider()
  // Otherwise a browser with one Google session signs that account in silently, which is
  // surprising on a shared machine.
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    const { user } = await signInWithPopup(auth, provider)
    return (await shape(user))!
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
