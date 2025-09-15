import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [{ path: '', name: 'home', component: () => import('pages/IndexPage.vue') }],
  },
  {
    path: '/steam-deck-settings',
    component: () => import('layouts/MainLayout.vue'),
    children: [{ path: '', name: 'steam-deck-settings', component: () => import('pages/GamesWithReports.vue') }],
  },
  {
    path: '/games-with-reports',
    component: () => import('layouts/MainLayout.vue'),
    children: [{ path: '', name: 'games-with-reports', component: () => import('pages/GamesWithReports.vue') }],
  },
  {
    path: '/site-stats',
    component: () => import('layouts/MainLayout.vue'),
    children: [{ path: '', name: 'site-stats', component: () => import('pages/SiteStatsPage.vue') }],
  },
  {
    path: '/about',
    component: () => import('layouts/MainLayout.vue'),
    children: [{ path: '', name: 'about', component: () => import('pages/AboutPage.vue') }],
  },
  {
    path: '/privacy-policy',
    component: () => import('layouts/MainLayout.vue'),
    children: [{ path: '', name: 'privacy-policy', component: () => import('pages/PrivacyPolicyPage.vue') }],
  },
  {
    path: '/terms-of-service',
    component: () => import('layouts/MainLayout.vue'),
    children: [{ path: '', name: 'terms-of-service', component: () => import('pages/TermsOfServicePage.vue') }],
  },
  {
    path: '/app/:appId',
    component: () => import('layouts/MainLayout.vue'),
    children: [{ path: '', name: 'game-page-by-app-id', component: () => import('pages/GamePage.vue') }],
  },
  {
    path: '/game/:gameName',
    component: () => import('layouts/MainLayout.vue'),
    children: [{ path: '', name: 'game-page-by-game-name', component: () => import('pages/GamePage.vue') }],
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
]

export default routes
