// Provide a list of feature flags
export const featureFlags = {
  enableLogin: import.meta.env.VITE_ENABLE_LOGIN === 'true',
}

export const useFeatureFlags = () => featureFlags
