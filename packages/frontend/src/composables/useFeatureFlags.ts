// Provide a list of feature flags
export const featureFlags = {
  enableLogin: import.meta.env.VITE_ENABLE_LOGIN !== 'false',
  enableHelpOverlay: import.meta.env.VITE_ENABLE_HELP_OVERLAY === 'true',
}

export const useFeatureFlags = () => featureFlags
