import { createRouter, createWebHistory } from 'vue-router'
import { authReady, useAuth } from '@/composables/useAuth'
import AdminFlags from '@/views/AdminFlags.vue'
import Auth from '@/views/Auth.vue'
import Dashboard from '@/views/Dashboard.vue'
import Workspace from '@/views/Workspace.vue'

// Only same-origin paths. A protocol-relative value like //evil.com is a valid path to
// the browser and would make this an open redirect.
export function safeRedirect(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  return value
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/signin', name: 'signin', component: Auth, props: { mode: 'signin' }, meta: { guest: true } },
    { path: '/signup', name: 'signup', component: Auth, props: { mode: 'signup' }, meta: { guest: true } },
    { path: '/', name: 'dashboard', component: Dashboard },
    { path: '/project/:id', name: 'project', component: Workspace, props: true },
    // Any signed-in account can open this. The flags themselves stay hidden until the
    // root credential is entered on the page, and the server is what decides that.
    { path: '/admin/flags', name: 'flags', component: AdminFlags },
    { path: '/:rest(.*)', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  await authReady
  const { signedIn } = useAuth()

  if (to.meta.guest) {
    if (!signedIn.value) return true
    // Honour a pending destination, so signing in from a deep link lands there rather
    // than on the dashboard.
    return safeRedirect(to.query.redirect) ?? { name: 'dashboard' }
  }

  // Carried so sign-in can return the person to the page they asked for. Without it,
  // opening a deep link while signed out silently becomes "sign in, land on the
  // dashboard", which is indistinguishable from the link being broken.
  return signedIn.value ? true : { name: 'signin', query: { redirect: to.fullPath } }
})

export default router
