import { defineRouter } from '#q-app/wrappers'
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router'
import routes from './routes'

const INTERNAL_NAVIGATION_SESSION_KEY = 'dv.session.has-internal-navigation.v1'

/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Router instance.
 */

export default defineRouter(function(/* { store, ssrContext } */) {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : (process.env.VUE_ROUTER_MODE === 'history' ? createWebHistory : createWebHashHistory)

  const Router = createRouter({
    scrollBehavior: (to, from, savedPosition) => {
      if (savedPosition) {
        return savedPosition
      }

      if (to.fullPath === from.fullPath) {
        return false
      }

      return { left: 0, top: 0 }
    },
    routes,

    // Leave this as is and make changes in quasar.conf.js instead!
    // quasar.conf.js -> build -> vueRouterMode
    // quasar.conf.js -> build -> publicPath
    history: createHistory(process.env.VUE_ROUTER_BASE),
  })

  if (!process.env.SERVER) {
    Router.afterEach((to, from) => {
      if (typeof window === 'undefined') return
      if (!from.name || to.fullPath === from.fullPath) return

      try {
        window.sessionStorage.setItem(INTERNAL_NAVIGATION_SESSION_KEY, 'true')
      } catch {
        // Ignore browsers that block sessionStorage access.
      }
    })
  }

  return Router
})
