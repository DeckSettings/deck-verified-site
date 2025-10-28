import itadIconUrl from 'src/assets/icons/itad-icon.svg?url'

export interface AppFeedDefinition {
  key: string;
  url: string;
  title: string;
  subtitle?: string;
  logo?: string | null;
}

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
