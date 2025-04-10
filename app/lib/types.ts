// Remove AI_MODELS constant and AIModelKey type as there's no selection
/*
export const AI_MODELS = { ... } as const;
export type AIModelKey = keyof typeof AI_MODELS;
*/

// Form Values - Remove model selection
export interface WebsiteInput {
  url: string;
  siteName: string;
  description?: string;
}

export interface FormValues {
  websites: WebsiteInput[];
  includeScreenshots: boolean;
}

// Crawling Results and Progress
export interface CrawlMetaData {
  description?: string;
  keywords?: string[];
  headers?: string[];
  language?: string;
  structuredData?: any;
  type?: string;
  category?: string;
}

export interface CrawlResult {
  url: string;
  title: string;
  metaData: {
    description?: string;
    keywords?: string[];
    links?: Array<{ url: string; text?: string }>;
  };
  links?: string[];
}

export type CrawlStatus = 'loading' | 'crawling' | 'extracting' | 'success' | 'error' | 'canceled' | 'timeout';

export interface ProgressMetadata {
  currentUrl?: string;
  attempted: number;
  successful: number;
  total: number;
  status?: string;
  message?: string;
}

export interface UrlProgress {
  status: CrawlStatus;
  progress: number;
  metaData?: ProgressMetadata;
}

// Crawl Reporting
export interface CrawlAttempt {
  url: string;
  timestamp: string;
  status: 'success' | 'error' | 'timeout' | 'canceled' | 'loading';
  duration: number;
  error?: string;
  linksFound?: number;
}

export interface CrawlReport {
  startTime: string;
  endTime?: string;
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  attempts: CrawlAttempt[];
}

// Saved Websites
export interface SavedWebsite {
  url: string;
  siteName: string;
  description?: string;
  savedAt: string;
}

// General utility types if needed
export type CurrentStep = 
  | 'idle' 
  | 'crawling' 
  | 'generating' 
  | 'reviewing' 
  | 'error' 
  | 'initial' 
  | 'complete'; 