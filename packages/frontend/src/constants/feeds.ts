import itadIconUrl from 'src/assets/icons/itad-icon.svg?url'

export interface AppFeedDefinition {
  key: string;
  title: string;
  subtitle?: string;
  logo?: string | null;
  icon?: string;
  url?: string;
}

export const HOME_WIDGETS: AppFeedDefinition[] = [
  {
    key: 'homepage-recent-games',
    title: 'Newly Added Games',
    subtitle: 'Swipe through the newest games that have just received community reports',
    logo: null,
    icon: 'new_releases',
  },
  {
    key: 'homepage-top-contributors',
    title: 'Top Contributors',
    subtitle: 'Swipe through the community members publishing the most report activity',
    logo: null,
    icon: 'workspace_premium',
  },
  {
    key: 'homepage-new-contributors',
    title: 'New Contributors',
    subtitle: 'Swipe through the latest contributors who have started submitting reports',
    logo: null,
    icon: 'celebration',
  },
]

export const APP_FEEDS: AppFeedDefinition[] = [
  {
    key: 'sdhq-game-reviews',
    url: 'https://steamdeckhq.com/feed/?post_type=game-reviews',
    title: 'Game Settings Reviews',
    subtitle: 'Updates on the latest SDHQ Game Settings guides',
    logo: 'https://steamdeckhq.com/wp-content/uploads/2022/06/cropped-sdhq-icon-32x32.png',
  },
  {
    key: 'sdhq-tips-and-guides',
    url: 'https://steamdeckhq.com/tips-and-guides/feed/',
    title: 'Game Tips and Guides',
    subtitle: 'Latest how-to articles, tips, and guides for Steam Deck and handheld gaming',
    logo: 'https://steamdeckhq.com/wp-content/uploads/2022/06/cropped-sdhq-icon-32x32.png',
  },
  {
    key: 'sdhq-news',
    url: 'https://steamdeckhq.com/feed/',
    title: 'Handheld Gaming News',
    subtitle: 'The latest Steam Deck updates, game patches, deals, device reviews, and community highlights',
    logo: 'https://steamdeckhq.com/wp-content/uploads/2022/06/cropped-sdhq-icon-32x32.png',
  },
  {
    key: 'itad-giveaways',
    url: 'https://isthereanydeal.com/feeds/{country}/giveaways.rss',
    title: 'PC Game Giveaways',
    subtitle: 'Latest free PC game giveaways and offers',
    logo: itadIconUrl,
  },
]
