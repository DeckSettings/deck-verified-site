export interface GameData {
  appsearch: string;
  appname: string;
  appid: string;
  appbanner: string;
}

export interface GameMetadata {
  poster: string | null;
  hero: string | null;
  banner: string | null;
  background: string | null;
}

export interface GameSearchResult {
  name: string;
  appId: string | null;
  banner: string | null;
}

export interface GameReport {
  url: string;
  repository_url: string;
  labels_url: string;
  comments_url: string;
  events_url: string;
  html_url: string;
  id: number;
  node_id: string;
  number: number;
  title: string;
  user: {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    gravatar_id: string;
    url: string;
    html_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    starred_url: string;
    subscriptions_url: string;
    organizations_url: string;
    repos_url: string;
    events_url: string;
    received_events_url: string;
    type: string;
    user_view_type: string;
    site_admin: boolean;
  };
  labels: Array<{
    id: number;
    node_id: string;
    url: string;
    name: string;
    color: string;
    default: boolean;
    description: string;
  }>;
  state: string;
  locked: boolean;
  assignee: null;
  assignees: [];
  milestone: null;
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: null | string;
  author_association: string;
  active_lock_reason: null | string;
  body: string;
  reactions: {
    url: string;
    total_count: number;
    '+1': number;
    '-1': number;
    laugh: number;
    hooray: number;
    confused: number;
    heart: number;
    rocket: number;
    eyes: number;
  };
  timeline_url: string;
  performed_via_github_app: null | string;
  state_reason: null | string;
  score: number;
}

export interface GameDetails {
  gameName: string;
  appId: number | null;
  metadata: GameMetadata;
  reports: GitHubIssue[];
}

export interface GitHubIssueLabel {
  id: number;
  node_id: string;
  url: string;
  name: string;
  color: string;
  default: boolean;
  description: string | null;
}

export interface GitHubReportIssueBodySchema {
  [key: string]: any; // Define the exact schema if known
}

interface GitHubUser {
  login: string;
  avatar_url: string;
}

export interface GitHubProjectDetails {
  gameName: string;
  appId: number | null;
  projectNumber: number;
  shortDescription: string;
  readme: string;
  metadata: GameMetadata;
  issues: GitHubIssue[];
}

export interface GitHubIssue {
  id: number;
  title: string;
  html_url: string;
  body: string;
  // TODO: Create interface for parsed data
  parsed_data: Record<string, any>;
  reactions: {
    reactions_thumbs_up: number;
    reactions_thumbs_down: number;
  };
  labels: GitHubIssueLabel[];
  user: GitHubUser;
  created_at: string;
  updated_at: string;
}

export interface GithubIssuesSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: GameReport[]
}

export interface SteamStoreAppDetails {
  id: string;
  name: string;
  description?: string;
  genre?: string;
  developer?: string;
  publisher?: string;
  releaseDate?: string;

  [key: string]: any; // Add this if the structure is dynamic or has additional fields
}

export interface SteamSuggestApp {
  id: string;
  type: string;
  name: string;
}

export interface SteamGame {
  appId: string;
  name: string;
}

export interface ParsedGameReport {

}
