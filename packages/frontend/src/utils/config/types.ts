export interface ConfigPayload {
  hideDuplicateReports: boolean;
  showHomeWelcomeCard: boolean;
  disabledFeeds: string[];
}

export const CONFIG_STORAGE_KEY = 'deckVerified.pageConfig'
