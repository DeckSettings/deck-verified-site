// Provide a list of feature flags
export const featureFlags = {
  enableLogin: import.meta.env.VITE_ENABLE_LOGIN !== 'false',
  enableHelpOverlay: import.meta.env.VITE_ENABLE_HELP_OVERLAY === 'true',
  enableMobileAppLink: import.meta.env.VITE_MOBILE_APP_LINK === 'true',
}

export const useFeatureFlags = () => featureFlags
