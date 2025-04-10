import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isValidUrl(url: string): boolean {
  try {
    // If URL doesn't have a protocol, add https://
    let parsedUrl: URL;
    if (!url.match(/^[a-zA-Z]+:\/\//)) {
      parsedUrl = new URL(`https://${url}`);
    } else {
      parsedUrl = new URL(url);
    }
    
    // Validate protocol
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return false;
    }
    
    // Validate hostname
    const hostname = parsedUrl.hostname;
    
    // Check for valid domain structure
    // 1. Must have at least one dot
    if (!hostname.includes('.')) {
      return false;
    }
    
    // 2. Check domain structure (more flexible approach instead of hardcoded TLDs)
    const parts = hostname.split('.');
    
    // Domains must have at least 2 parts and the TLD shouldn't be just digits
    if (parts.length < 2 || /^\d+$/.test(parts[parts.length - 1])) {
      return false;
    }
    
    // Check that TLD is reasonable length (most are 2-6 chars)
    const tld = parts[parts.length - 1];
    if (tld.length < 2 || tld.length > 12) {
      return false;
    }
    
    // 3. Check that domain name contains valid characters
    if (!/^[a-zA-Z0-9-]+$/.test(parts[0])) {
      return false;
    }
    
    // 4. Additional sanity checks
    // Domain shouldn't start with a hyphen
    if (hostname.startsWith('-')) {
      return false;
    }
    
    // Domain shouldn't have double hyphens except for punycode
    if (hostname.includes('--') && !hostname.includes('xn--')) {
      return false;
    }
    
    return true;
  } catch (e) {
    return false;
  }
}

export function normalizeUrl(url: string): string {
  try {
    // If URL doesn't have a protocol, add https://
    if (!url.match(/^[a-zA-Z]+:\/\//)) {
      url = `https://${url}`;
    }
    
    const parsedUrl = new URL(url);
    return parsedUrl.origin + parsedUrl.pathname.replace(/\/$/, '');
  } catch (e) {
    return url;
  }
}

export function filterContentUrls(urls: string[]): string[] {
  // Regex patterns for excludable URLs
  const fileExtensionPattern = /\.(png|jpg|jpeg|gif|svg|css|js|woff2?|eot|ttf|otf|pdf|mp4|webm|zip|ico)$/i;
  const queryParamPattern = /(\?|&)(utm_|sessionid|sid)/i;
  const pathSegmentPattern = /\/cdn-cgi\//i;
  
  return urls.filter(url => {
    return !fileExtensionPattern.test(url) && 
           !queryParamPattern.test(url) && 
           !pathSegmentPattern.test(url);
  });
}

// Types for saved crawler state
export interface SavedCrawlerState {
  formData: any;
  results: any[];
  currentStep: string;
  progress: number;
  urlProgressMap: Record<string, any>;
  processedUrls: number;
  totalUrlsToProcess: number;
  aiProcessedCount: number;
  detailedStatusMessage: string;
  outputMarkdown: string;
  timestamp: number;
}

// Save crawler state to localStorage
export function saveCrawlerState(state: SavedCrawlerState): void {
  try {
    localStorage.setItem('crawlerState', JSON.stringify({
      ...state,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.error('Failed to save crawler state:', error);
  }
}

// Load crawler state from localStorage
export function loadCrawlerState(): SavedCrawlerState | null {
  try {
    const savedState = localStorage.getItem('crawlerState');
    if (!savedState) return null;
    
    const parsedState = JSON.parse(savedState);
    
    // Return null if the saved state is older than 24 hours
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    if (Date.now() - parsedState.timestamp > ONE_DAY_MS) {
      localStorage.removeItem('crawlerState');
      return null;
    }
    
    return parsedState;
  } catch (error) {
    console.error('Failed to load crawler state:', error);
    return null;
  }
}

// Clear crawler state from localStorage
export function clearCrawlerState(): void {
  try {
    localStorage.removeItem('crawlerState');
  } catch (error) {
    console.error('Failed to clear crawler state:', error);
  }
}

export function extractDomain(url: string): string {
  try {
    const parsedUrl = new URL(url);
    // Remove 'www.' prefix if present
    return parsedUrl.hostname.replace(/^www\./, '');
  } catch (e) {
    return url.replace(/^www\./, '');
  }
}

export function groupUrlsByDomain<T extends string | { url: string }>(
  items: T[]
): { [domain: string]: T[] } {
  const groups: { [domain: string]: T[] } = {};
  
  for (const item of items) {
    const url = typeof item === 'string' ? item : item.url;
    const domain = extractDomain(url);
    
    if (!groups[domain]) {
      groups[domain] = [];
    }
    groups[domain].push(item);
  }
  
  return groups;
} 