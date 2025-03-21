export interface HardwareInfo {
  name: string;
  battery_size_wh: number;
  max_display_resolution: string;
  max_refresh_rate: number;
  supports_vrr: boolean;
  max_tdp_w: number;
}

export interface GameImages {
  poster: string | null;
  hero: string | null;
  banner: string | null;
  background: string | null;
}

export type GameMetadata = GameImages

export interface GameSearchCache {
  name: string;
  appId: string | null;
  banner: string | null;
  poster: string | null;
  reportCount: number | null;
}

export interface GameSearchResult {
  gameName: string;
  appId: number;
  metadata: GameMetadata;
  reportCount: number;
}

export interface GameReport {
  id: number;
  title: string;
  html_url: string;
  data: GameReportData;
  metadata: GameMetadata;
  reactions: GameReportReactions;
  labels: {
    name: string;
    color: string;
    description: string;
  }[];
  user: GameReportUser;
  created_at: string; // ISO 8601 formatted date string
  updated_at: string; // ISO 8601 formatted date string
}

export interface GameReportReactions {
  reactions_thumbs_up: number;
  reactions_thumbs_down: number;
}

export interface GameReportData {
  summary: string;
  game_name: string;
  app_id: number;
  launcher: string;
  target_framerate: string;
  average_battery_power_draw: string | null;
  calculated_battery_life_minutes: number | null;
  device: string;
  os_version: string;
  undervolt_applied: string | null;
  steam_play_compatibility_tool_used: string;
  compatibility_tool_version: string;
  game_resolution: string;
  custom_launch_options: string | null;
  frame_limit: number | null;
  disable_frame_limit: string;
  enable_vrr: string;
  allow_tearing: string;
  half_rate_shading: string;
  tdp_limit: number | null;
  manual_gpu_clock: number | null;
  scaling_mode: string;
  scaling_filter: string;
  game_display_settings: string;
  game_graphics_settings: string;
  additional_notes: string;
}

export interface GameReportUser extends GitHubUser {
  report_count: number | null;
}

export interface GameReportForm {
  template: GitHubIssueTemplate;
  hardware: HardwareInfo[];
  schema: GitHubReportIssueBodySchema;
}

export interface GameDetails {
  gameName: string;
  appId: number | null;
  projectNumber: number | null;
  metadata: GameMetadata;
  reports: GameReport[];
  external_reviews: ExternalGameReview[];
}

export interface GitHubProjectGameDetails extends Omit<GameDetails, 'external_reviews'> {
  projectNumber: number;
  shortDescription: string;
  readme: string;
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
  $schema: string;
  $id: string;
  title: string;
  description: string;
  type: 'object';
  properties: {
    [key: string]: GitHubReportIssueBodySchemaProperty;
  };
  required?: string[];
}

export interface GitHubReportIssueBodySchemaProperty {
  description: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  minLength?: number;
  maxLength?: number;
  enum?: string[];
  exclusiveMinimum?: number;
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
}

export interface GitHubProjectDetails {
  title: string;
  number: number;
  shortDescription: string;
  readme: string;
  metadata: GameMetadata;
  issues: GitHubIssue[];
}

export interface GitHubIssueTemplate {
  name: string;
  description: string;
  title: string;
  body: GitHubIssueTemplateBody[];
}

export type GitHubIssueTemplateBody =
  GitHubIssueTemplateBodyMarkdown
  | GitHubIssueTemplateBodyInput
  | GitHubIssueTemplateBodyDropdown
  | GitHubIssueTemplateBodyTextarea;


interface GitHubIssueTemplateBodyMarkdown {
  type: 'markdown';
  attributes: {
    value: string;
  };
}

interface GitHubIssueTemplateBodyInput {
  type: 'input';
  id: string;
  attributes: {
    label: string;
    description: string;
    value?: string;
  };
  validations?: {
    required?: boolean;
  };
}

interface GitHubIssueTemplateBodyDropdown {
  type: 'dropdown';
  id: string;
  attributes: {
    label: string;
    description: string;
    options: string[];
    default?: number;
  };
  validations?: {
    required?: boolean;
  };
}

interface GitHubIssueTemplateBodyTextarea {
  type: 'textarea';
  id: string;
  attributes: {
    label: string;
    description: string;
  };
  validations?: {
    required?: boolean;
  };
}

export interface GitHubIssue {
  id: number;
  title: string;
  html_url: string;
  body: string;
  reactions: {
    '+1': number;
    '-1': number;
  };
  labels: GitHubIssueLabel[];
  user: GitHubUser;
  created_at: string;
  updated_at: string;
}

// TODO: Fix the items for this. They should be a different interface
export interface GithubIssuesSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: GithubIssuesSearchResultItems[]
}

export interface GithubIssuesSearchResultItems {
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
  labels: GitHubIssueLabel[];
  state: string;
  locked: boolean;
  assignee: null; // Could be typed if details provided
  assignees: any[]; // Array of objects if details provided
  milestone: null; // Could be typed if details provided
  comments: number;
  created_at: string; // ISO date string
  updated_at: string; // ISO date string
  closed_at: string | null; // ISO date string or null
  author_association: string;
  active_lock_reason: string | null;
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
  performed_via_github_app: null; // Could be typed if details provided
  state_reason: string | null;
  score: number;
}

export interface YouTubeOEmbedMetadata {
  title: string;
  author_name: string;
  author_url: string;
  height: number;
  width: number;
  version: string;
  thumbnail_height: number;
  thumbnail_width: number;
  thumbnail_url: string;
  html: string;
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

export interface SDHQReview {
  id: number;
  date: string;
  modified: string;
  link: string;
  title: {
    rendered: string;
  };
  excerpt: {
    rendered: string;
  };
  acf: {
    optimized_and_recommended_settings: {
      steamos_settings: {
        fps_cap?: string;
        fps_refresh_rate?: string;
        half_rate_shading?: string;
        tdp_limit?: string;
        scaling_filter?: string;
        gpu_clock_frequency?: string;
      }
      proton_version: string;
      game_settings: string;
      projected_battery_usage_and_temperature: {
        wattage: string;
        temperatures: string;
        gameplay_time: string;
      }
    }
    sdhq_rating_categories: {
      performance?: number;
      visuals?: number;
      stability?: number;
      controls?: number;
      battery?: number;
      score_breakdown?: string;
    }
  };
}

export interface SDGVideoReview {
  appId: number;
  title: string;
  videoURL: string;
  publishedDateUnix: number;
  puiblishDateTime: string;
}

export interface ExternalGameReview {
  id: number;
  title: string;
  html_url: string;
  data: ExternalGameReviewReportData;
  source: {
    name: string;
    avatar_url: string;
    report_count: number | null;
  };
  created_at: string; // ISO 8601 formatted date string
  updated_at: string; // ISO 8601 formatted date string
}

export interface ExternalGameReviewReportData {
  summary?: string | null;
  game_name?: string | null;
  app_id?: number | null;
  launcher?: string | null;
  average_battery_power_draw?: string | null;
  calculated_battery_life_minutes?: number | null;
  device: string;
  steam_play_compatibility_tool_used?: string | null;
  compatibility_tool_version?: string | null;
  game_resolution?: string | null;
  custom_launch_options?: string | null;
  frame_limit?: number | null;
  disable_frame_limit?: string | null;
  enable_vrr?: string | null;
  allow_tearing?: string | null;
  half_rate_shading?: string | null;
  tdp_limit?: number | null;
  manual_gpu_clock?: number | null;
  scaling_mode?: string | null;
  scaling_filter?: string | null;
  game_display_settings?: string | null;
  game_graphics_settings?: string | null;
  additional_notes?: string | null;
}

export interface AggregateMetricResponse {
  metric: string;
  days: number;
  results: GameDetailsRequestMetricResult[];
}

export interface GameDetailsRequestMetricResult {
  app_id: number | null;
  game_name: string | null;
  count: number;
  metadata?: GameMetadata;
  report_count?: number;
}
