import { createRouter, createWebHistory } from 'vue-router'
import { authReady, useAuth } from '@/composables/useAuth'
import AdminFlags from '@/views/AdminFlags.vue'
import Auth from '@/views/Auth.vue'
import Dashboard from '@/views/Dashboard.vue'
import Workspace from '@/views/Workspace.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/signin', name: 'signin', component: Auth, props: { mode: 'signin' }, meta: { guest: true } },
    { path: '/signup', name: 'signup', component: Auth, props: { mode: 'signup' }, meta: { guest: true } },
    { path: '/', name: 'dashboard', component: Dashboard },
    { path: '/project/:id', name: 'project', component: Workspace, props: true },
    // The view itself re-checks with the server and renders its own "not your page"
    // state, so this guard is a redirect for convenience rather than the control.
    { path: '/admin/flags', name: 'flags', component: AdminFlags, meta: { root: true } },
    { path: '/:rest(.*)', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  await authReady
  const { signedIn, isRoot } = useAuth()
  if (to.meta.guest) {
    if (!signedIn.value) return true
    return isRoot.value ? { name: 'flags' } : { name: 'dashboard' }
  }
  if (!signedIn.value) return { name: 'signin' }
  if (to.meta.root && !isRoot.value) return { name: 'dashboard' }
  return true
})

export default router
