export interface ConfigPayload {
  hideDuplicateReports: boolean;
  showHomeWelcomeCard: boolean;
  disabledFeeds: string[];
  country: string;
  currency: string;
}

export const CONFIG_STORAGE_KEY = 'deckVerified.pageConfig'

export const DEFAULT_COUNTRY = 'US'
export const DEFAULT_CURRENCY = 'USD'
