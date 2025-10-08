import type { RouteRecordRaw } from 'vue-router'

const getLayout = () => {
  return globalThis.isMobile
    ? import('layouts/MobileLayout.vue')
    : import('layouts/MainLayout.vue')
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: getLayout,
    children: [{
      path: '',
      name: 'home',
      component: () => globalThis.isMobile
        ? import('pages/IndexMobilePage.vue')
        : import('pages/IndexPage.vue'),
    }],
  },
  {
    path: '/steam-deck-settings',
    component: getLayout,
    children: [{ path: '', name: 'steam-deck-settings', component: () => import('pages/GamesWithReports.vue') }],
  },
  {
    path: '/games-with-reports',
    component: getLayout,
    children: [{ path: '', name: 'games-with-reports', component: () => import('pages/GamesWithReports.vue') }],
  },
  {
    path: '/site-stats',
    component: getLayout,
    children: [{ path: '', name: 'site-stats', component: () => import('pages/SiteStatsPage.vue') }],
  },
  {
    path: '/about',
    component: getLayout,
    children: [{ path: '', name: 'about', component: () => import('pages/AboutPage.vue') }],
  },
  {
    path: '/privacy-policy',
    component: getLayout,
    children: [{ path: '', name: 'privacy-policy', component: () => import('pages/PrivacyPolicyPage.vue') }],
  },
  {
    path: '/terms-of-service',
    component: getLayout,
    children: [{ path: '', name: 'terms-of-service', component: () => import('pages/TermsOfServicePage.vue') }],
  },
  {
    path: '/decky-plugin',
    component: getLayout,
    children: [{ path: '', name: 'decky-plugin', component: () => import('pages/DeckyPluginPage.vue') }],
  },
  {
    path: '/app/:appId',
    component: getLayout,
    children: [{ path: '', name: 'game-page-by-app-id', component: () => import('pages/GamePage.vue') }],
  },
  {
    path: '/game/:gameName',
    component: getLayout,
    children: [{ path: '', name: 'game-page-by-game-name', component: () => import('pages/GamePage.vue') }],
  },
  {
    path: '/auth/complete',
    component: getLayout,
    children: [{ path: '', name: 'auth-complete', component: () => import('pages/AuthCompletePage.vue') }],
  },
  {
    path: '/user/reports',
    component: getLayout,
    children: [{ path: '', name: 'user-reports', component: () => import('pages/UserReportsPage.vue') }],
  },
  {
    path: '/reports/:type',
    component: getLayout,
    children: [{ path: '', name: 'reports-page', component: () => import('pages/ReportsPage.vue') }],
  },
  {
    path: '/submit-report',
    component: getLayout,
    children: [{ path: '', name: 'submit-report', component: () => import('pages/SubmitReportPage.vue') }],
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
]

export default routes
