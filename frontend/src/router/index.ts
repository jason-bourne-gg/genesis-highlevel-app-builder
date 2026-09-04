import { createRouter, createWebHistory } from 'vue-router'
import { authReady, useAuth } from '@/composables/useAuth'
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
    { path: '/:rest(.*)', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  await authReady
  const { signedIn } = useAuth()
  if (to.meta.guest) return signedIn.value ? { name: 'dashboard' } : true
  return signedIn.value ? true : { name: 'signin' }
})

export default router
