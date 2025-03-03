import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [{ path: '', name: 'home', component: () => import('pages/IndexPage.vue') }]
  },
  {
    path: '/app/:appId',
    component: () => import('layouts/MainLayout.vue'),
    children: [{ path: '', name: 'game-page-by-app-id', component: () => import('pages/GamePage.vue') }]
  },
  {
    path: '/game/:gameName',
    component: () => import('layouts/MainLayout.vue'),
    children: [{ path: '', name: 'game-page-by-game-name', component: () => import('pages/GamePage.vue') }]
  },
  {
    path: '/games-with-reports',
    component: () => import('layouts/MainLayout.vue'),
    children: [{ path: '', name: 'games-with-reports', component: () => import('pages/GamesWithReports.vue') }]
  },
  {
    path: '/site-stats',
    component: () => import('layouts/MainLayout.vue'),
    children: [{ path: '', name: 'site-stats', component: () => import('pages/SiteStatsPage.vue') }]
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue')
  }
]

export default routes
