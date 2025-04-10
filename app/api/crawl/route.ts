import { NextRequest, NextResponse } from 'next/server';
import type { Page } from 'puppeteer';
import puppeteer from "puppeteer";
import { filterContentUrls, normalizeUrl } from "../../lib/utils";
import { parseStringPromise } from "xml2js";
import { JSDOM } from 'jsdom';
import { UrlProgress, CrawlResult as ClientCrawlResult, ProgressMetadata } from '../../lib/types'; // Use alias for CrawlResult if needed

// Import robots-parser with a more accurate type declaration
import robotsParser from "robots-parser";

// Type for robots parser result
interface RobotsParser {
  isAllowed: (url: string, userAgent?: string) => boolean | undefined;
}

// Type for link objects
interface LinkObject {
  href: string;
  text: string;
}

export const maxDuration = 120; // Extend max duration to 120 seconds

// Maximum number of URLs to process per domain
const MAX_URLS_TO_PROCESS = Infinity; // No limit for full mode
const TEST_MODE_MAX_URLS = 5; // Strict limit for test mode - will not process more than this
const CONCURRENT_TABS = 3; // Max number of pages to process in parallel
const PAGE_TIMEOUT = 30000; // 30 seconds timeout for page load

// Type for crawled pages
interface CrawledPage {
  url: string;
  title: string;
  metaData?: {
    description?: string;
    keywords?: string[];
    language?: string;
    canonical?: string;
    ogImage?: string;
    publishDate?: string;
  };
}

// Cache for robots.txt and sitemap data
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
interface CacheEntry<T> {
  data: T | null;
  timestamp: number;
  attempted: boolean; // Track if we've already attempted to fetch this robots.txt
}

// Use a more persistent cache with domain-level tracking
const robotsCache = new Map<string, CacheEntry<RobotsParser>>();

function getCachedRobotsParser(domain: string): { parser: RobotsParser | null, shouldFetch: boolean } {
  const entry = robotsCache.get(domain);
  
  // If no entry exists, we need to fetch
  if (!entry) {
    return { parser: null, shouldFetch: true };
  }
  
  // Check if cache is expired
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    // Delete expired entry and fetch again
    robotsCache.delete(domain);
    return { parser: null, shouldFetch: true };
  }
  
  // If we've already attempted to fetch but got null, don't try again
  if (entry.attempted && entry.data === null) {
    console.log(`[ROBOTS] Previously attempted to fetch robots.txt for ${domain} with no success, skipping`);
    return { parser: null, shouldFetch: false };
  }
  
  // Return cached parser
  return { parser: entry.data, shouldFetch: false };
}

function setCachedRobotsParser(domain: string, parser: RobotsParser | null): void {
  robotsCache.set(domain, { 
    data: parser, 
    timestamp: Date.now(),
    attempted: true
  });
}

// Improved URL normalization beyond what's in utils.ts
function enhancedNormalizeUrl(url: string): string {
  try {
    // Use base normalize function
    let normalized = normalizeUrl(url);
    
    // Remove UTM and other tracking parameters
    const urlObj = new URL(normalized);
    const searchParams = urlObj.searchParams;
    
    // Parameters to remove
    const paramsToRemove = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', 'ref', 'source', 'mc_cid', 'mc_eid'
    ];
    
    paramsToRemove.forEach(param => {
      if (searchParams.has(param)) {
        searchParams.delete(param);
      }
    });
    
    // Reconstruct URL without tracking params
    let cleanUrl = urlObj.origin + urlObj.pathname;
    const newSearch = searchParams.toString();
    if (newSearch) {
      cleanUrl += '?' + newSearch;
    }
    
    // Handle common SPA hash routes by converting them to proper paths for deduplication
    // e.g., example.com/#/path -> example.com/path for comparison purposes
    if (urlObj.hash && urlObj.hash.startsWith('#/')) {
      const hashPath = urlObj.hash.substring(1); // Remove the # character
      // For deduplication purposes, treat hash paths like real paths
      cleanUrl = urlObj.origin + hashPath;
    }
    
    return cleanUrl;
  } catch (e) {
    return url;
  }
}

// Content quality scoring weights
const QUALITY_SIGNALS = {
  hasStructuredData: 10,
  hasMetaDescription: 5,
  hasCanonical: 5,
  contentLength: 0.01, // per character
  headerStructure: 8,
  codeBlocks: 15,
  technicalTerms: 2,
  documentation: 20,
  reference: 15,
  article: 10,
  product: 5
};

// Technical terms that indicate high-value content
const TECHNICAL_TERMS = [
  'api', 'documentation', 'reference', 'implementation', 'example',
  'guide', 'tutorial', 'sdk', 'library', 'framework', 'integration',
  'specification', 'standard', 'protocol', 'architecture', 'interface'
];

// Type for structured documentation output
interface DocumentationSection {
  title: string;
  description: string;
  links: Array<{
    url: string;
    title: string;
    description: string;
  }>;
}

interface LLMsContent {
  mainTitle: string;
  mainDescription: string;
  sections: DocumentationSection[];
}

// Content categories for better organization
const CONTENT_CATEGORIES = {
  DEVELOPMENT: ['api', 'function', 'development', 'cli', 'debug', 'deploy'],
  FRAMEWORK: ['framework', 'next.js', 'react', 'vue', 'angular', 'gatsby'],
  BUILD: ['build', 'configuration', 'environment', 'plugin', 'dependency'],
  DATA: ['data', 'storage', 'database', 'content', 'graphql'],
  FORMS: ['form', 'input', 'submission', 'spam', 'notification'],
  DOMAIN: ['domain', 'dns', 'https', 'ssl', 'subdomain'],
  TEAM: ['team', 'account', 'user', 'permission', 'role'],
  BILLING: ['billing', 'usage', 'price', 'plan', 'payment']
} as const;

// Helper function to categorize content
function categorizeContent(url: string, title: string, content: string): keyof typeof CONTENT_CATEGORIES {
  const lowerContent = (url + ' ' + title + ' ' + content).toLowerCase();
  
  for (const [category, keywords] of Object.entries(CONTENT_CATEGORIES)) {
    if (keywords.some(keyword => lowerContent.includes(keyword))) {
      return category as keyof typeof CONTENT_CATEGORIES;
    }
  }
  
  return 'DEVELOPMENT'; // Default category
}

// Function to generate a concise description
function generateDescription(content: string, maxLength: number = 150): string {
  // Remove markdown formatting
  content = content.replace(/[#*`_]/g, '');
  
  // Get first sentence or paragraph
  const firstSentence = content.split(/[.!?][\s\n]/)[0];
  const description = firstSentence.length > maxLength 
    ? firstSentence.slice(0, maxLength - 3) + '...'
    : firstSentence;
    
  return description.trim() + '.';
}

// Type Definitions
type ProgressStatus = 'loading' | 'extracting' | 'success' | 'error' | 'canceled';

type ProgressUpdate = {
  type: 'progress';
  status: ProgressStatus;
  attempted: number;
  successful: number;
  progress: number;
  currentUrl?: string;
  message: string;
  linksFound?: number;
};

type CompleteUpdate = {
  type: 'complete';
  status: 'success' | 'canceled' | 'error';
  attempted: number;
  successful: number;
  progress: number;
  message: string;
  duration?: number;
  crawledUrls?: string[]; // Array of URLs that were successfully crawled
  results?: InternalCrawlResult[]; // Full array of crawl results
};

type ErrorUpdate = {
  type: 'error';
  message: string;
};

// Define the new type for individual results
type ResultUpdate = {
  type: 'result';
  result: InternalCrawlResult;
};

// Add ResultUpdate to the union type
type ProgressUpdateEvent = ProgressUpdate | CompleteUpdate | ErrorUpdate | ResultUpdate;

type ProgressUpdateFunction = (data: ProgressUpdateEvent) => void;

// Internal result type for crawl functions before sending to client
interface InternalCrawlResult {
  url: string;
  title: string;
  metaData: {
    description?: string;
    keywords?: string[];
    links?: string[]; // Add links to allowed properties
  };
  links: string[];
}

// Checks if a URL should be ignored - now checks exact hostname
function shouldIgnoreUrl(url: string, startHostname: string): boolean {
    try {
        const urlObj = new URL(url);
        if (!urlObj.protocol.startsWith('http')) return true;
        // Strict hostname check
        if (urlObj.hostname !== startHostname) return true; 
        // Add more skip patterns if needed
        const skipPatterns = [/\.(jpg|jpeg|png|gif|ico|css|js|pdf|xml|rss|svg|woff|woff2|ttf|eot)$/i];
        return skipPatterns.some(pattern => pattern.test(urlObj.pathname));
    } catch { return true; }
}

// Extracts links from HTML
function extractLinks(document: Document, baseUrl: string): string[] {
    return Array.from(document.querySelectorAll('a[href]'))
        .map((a: Element) => {
            const href = a.getAttribute('href');
            if (!href) return '';
            try { return new URL(href, baseUrl).toString(); } catch { return ''; }
        })
        .filter(Boolean);
}

// Function to fetch and parse robots.txt file for a given domain
async function getRobotsParser(domain: string): Promise<RobotsParser | null> {
  const { parser, shouldFetch } = getCachedRobotsParser(domain);
  
  // Return cached result or null if we shouldn't fetch
  if (parser || !shouldFetch) {
    if (parser) {
      console.log(`[ROBOTS] Using cached robots.txt for ${domain}`);
    }
    return parser;
  }
  
  try {
    const robotsUrl = `https://${domain}/robots.txt`;
    console.log(`[ROBOTS] Fetching robots.txt from ${robotsUrl}`);
    
    const response = await fetch(robotsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; llmstxt-generator/1.0)'
      },
      // Add a timeout to prevent long waits
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      console.log(`[ROBOTS] No robots.txt found or error fetching for ${domain}: ${response.status}`);
      // Cache the null result to avoid repeatedly fetching a non-existent robots.txt
      setCachedRobotsParser(domain, null);
      return null;
    }
    
    const robotsTxt = await response.text();
    const parser = robotsParser(robotsUrl, robotsTxt);
    
    // Cache the parser
    setCachedRobotsParser(domain, parser);
    console.log(`[ROBOTS] Successfully parsed and cached robots.txt for ${domain}`);
    
    return parser;
  } catch (error) {
    console.error(`[ROBOTS] Error fetching robots.txt for ${domain}:`, error);
    // Cache the failed attempt
    setCachedRobotsParser(domain, null);
    return null;
  }
}

// Keep the original cache for other data types
const cache = new Map<string, CacheEntry<any>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { 
    data, 
    timestamp: Date.now(),
    attempted: false 
  });
}

// Function to check if a URL is allowed to be crawled according to robots.txt
async function isUrlAllowed(url: string): Promise<boolean> {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    const parser = await getRobotsParser(domain);
    
    // If we couldn't get a parser, assume crawling is allowed
    if (!parser) {
      return true;
    }
    
    // Check if the URL is allowed for our user agent
    const userAgent = 'llmstxt-generator';
    const isAllowed = parser.isAllowed(url, userAgent);
    
    // If isAllowed is undefined, assume it's allowed
    if (isAllowed === undefined) {
      return true;
    }
    
    if (!isAllowed) {
      console.log(`[ROBOTS] URL ${url} is disallowed by robots.txt`);
    }
    
    return isAllowed;
  } catch (error) {
    console.error(`[ROBOTS] Error checking if URL is allowed:`, error);
    // If there's an error in checking, assume crawling is allowed
    return true;
  }
}

// Function to crawl a single page
async function crawlSinglePage(
  url: string,
  signal: AbortSignal,
  sendUpdate: ProgressUpdateFunction,
  stats: { attempted: number; successful: number; total: number },
  startHostname: string
): Promise<InternalCrawlResult | null> {
  const normalizedUrl = enhancedNormalizeUrl(url);
  let browser = null;
  
  console.log(`[DEBUG:ENTRY] crawlSinglePage starting for ${normalizedUrl}. Current stats:`, {
    attempted: stats.attempted,
    successful: stats.successful,
    total: stats.total,
    isTestMode: stats.total === TEST_MODE_MAX_URLS
  });
  
  // Check if this URL is allowed by robots.txt
  const isAllowed = await isUrlAllowed(normalizedUrl);
  if (!isAllowed) {
    console.log(`[ROBOTS] Skipping ${normalizedUrl} - Disallowed by robots.txt`);
    // Don't increment attempted count since we're respecting robots.txt
    return null;
  }
  
  // Strict enforcement of page limit - check before processing
  if (stats.attempted >= stats.total) {
    console.log(`[CRAWL LIMIT] Strict check - Already at limit: attempted=${stats.attempted}, total=${stats.total} - Skipping ${normalizedUrl}`);
    return null;
  }
  
  // Increment counter since we're processing this URL
  stats.attempted++;
  console.log(`[COUNT-INCREMENT] Processing URL #${stats.attempted}/${stats.total}: ${normalizedUrl}`);
  
  try {
    if (signal.aborted) {
      console.log(`[ABORT] Signal aborted before processing ${normalizedUrl}, decreasing attempt count`);
      stats.attempted--;
      return null;
    }

    // Try Puppeteer first
    try {
      console.log(`[BROWSER] Launching browser for: ${normalizedUrl}`);
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      // Store the initial hostname for domain parking detection
      const startUrl = new URL(normalizedUrl);
      const startHostname = startUrl.hostname;
      console.log(`[CRAWL] Starting crawl of ${normalizedUrl} with hostname ${startHostname}`);

      const page = await browser.newPage();
      
      // Set viewport and user agent
      await page.setViewport({
        width: 1280,
        height: 800,
      });
      
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36');
      
      // Set a timeout for navigation to handle slow or hanging pages
      await page.setDefaultNavigationTimeout(30000);
      
      // Navigate to the URL
      await page.goto(normalizedUrl, {
        waitUntil: 'networkidle2',
      });

      // Check current URL to detect redirects that might indicate domain parking
      const currentUrl = page.url();
      const currentHostname = new URL(currentUrl).hostname;
      
      // Check if we've been redirected to a different domain
      if (currentHostname !== startHostname) {
        console.log(`[DOMAIN-REDIRECT] Redirected from ${startHostname} to ${currentHostname}`);
      }
      
      // Get page content
      const content = await page.content();
      const bodyText = await page.evaluate(() => document.body.innerText);
      const title = await page.title();

      // Extract links
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
          .map(a => a.href)
          .filter(href => href && href.startsWith('http'));
      });

      // Check for domain parking signals in Puppeteer method
      const domainParkingSignals = await page.evaluate(() => {
        const content = document.body.innerText.toLowerCase();
        const title = document.title.toLowerCase();
        const links = Array.from(document.querySelectorAll('a'));
        
        return {
          hasDomainForSale: content.includes('domain for sale') || 
                           content.includes('buy this domain') ||
                           content.includes('domain may be for sale'),
          hasParkedDomain: content.includes('parked domain') ||
                           content.includes('domain parking'),
          hasDomainAdvertisement: content.includes('domain is for sale') ||
                                content.includes('purchase this domain'),
          hasTrafficMonetization: content.includes('traffic monetization') ||
                                  content.includes('domain monetization'),
          // Check for ad-related links
          adLinkCount: links.filter(a => 
            a.href && (a.href.includes('ads') || a.href.includes('click') || a.href.includes('domain-for-sale'))
          ).length,
          hasAdIframes: document.querySelectorAll('iframe[src*="ad"], iframe[src*="ads"], iframe[id*="ad-"]').length > 0,
          titleIndicator: title.includes('domain for sale') || 
                          title.includes('buy this domain') ||
                          title.includes('is for sale')
        };
      });
      
      console.log(`[PUPPETEER] Evaluation results for ${normalizedUrl}:`, {
        currentUrl,
        hasTitle: !!title,
        contentLength: bodyText.length,
        linkCount: links.length,
        domainParkingSignals
      });
      
      // Check for domain parking/squatting pages
      const isDomainParking = 
        domainParkingSignals.hasDomainForSale || 
        domainParkingSignals.hasParkedDomain ||
        domainParkingSignals.hasDomainAdvertisement ||
        domainParkingSignals.hasTrafficMonetization ||
        domainParkingSignals.adLinkCount > 10 ||
        domainParkingSignals.hasAdIframes ||
        domainParkingSignals.titleIndicator ||
        // Current URL doesn't match original domain (possible redirect to parking page)
        currentHostname !== startHostname;

      if (isDomainParking) {
        console.log(`[DOMAIN-PARKING] Detected domain parking page for ${normalizedUrl} with Puppeteer method`);
        throw new Error('Domain parking or squatting page detected. This is likely not a real website.');
      }

      // Add to results if we successfully got content
      if (title || content) {
        stats.successful++;
        
        await sendUpdate({
          type: 'progress',
          status: 'success',
          attempted: stats.attempted,
          successful: stats.successful,
          progress: Math.round((stats.attempted / stats.total) * 100),
          message: `Successfully crawled page`
        });
        
        console.log(`[SUCCESS] Successfully crawled: ${normalizedUrl}`);

        // Return all valid links - filtering will be handled by crawlSite
        const validLinks = links.filter(link => {
          try {
            const linkUrl = new URL(link);
            return linkUrl.hostname === startHostname && !shouldIgnoreUrl(link, startHostname);
          } catch {
            return false;
          }
        });

        // Create the result
        const result = {
          url: normalizedUrl,
          title: title,
          metaData: {
            description: content,
            links: validLinks
          },
          links: validLinks
        };

        // Send a result event to the client
        await sendUpdate({
          type: 'result',
          result: result
        });

        await browser.close();
        console.log(`[BROWSER] Closed browser for: ${normalizedUrl}`);

        return result;
      } else {
        console.log(`[CONTENT] No valid content found for ${normalizedUrl}`, {
          title: title,
          contentLength: content?.length || 0
        });
        await browser.close();
        throw new Error('No valid content found on page');
      }
    } catch (puppeteerError: any) {
      // Close browser if it's open
      if (browser) {
        try {
          await browser.close();
          console.log(`[BROWSER] Closed browser after error for: ${normalizedUrl}`);
        } catch (e) {
          console.error(`[BROWSER] Error closing browser for ${normalizedUrl}:`, e);
        }
      }
      
      console.log(`[FALLBACK] Puppeteer failed, trying fetch+JSDOM fallback for: ${normalizedUrl}`, {
        error: puppeteerError.message
      });

      // Fallback to fetch + JSDOM
      const response = await fetch(normalizedUrl, {
        signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Fetch failed with status ${response.status}`);
      }
      
      const html = await response.text();
      const dom = new JSDOM(html, { url: normalizedUrl });
      const { document } = dom.window;
      
      const title = document.querySelector('title')?.textContent || '';
      const content = document.body?.textContent || '';
      
      // Extract links
      const links = Array.from(document.querySelectorAll('a'))
        .map(a => a.href)
        .filter(href => href && href.startsWith('http'));
      
      // Check for domain parking signals in the fallback method
      const domainParkingSignals = {
        hasDomainForSale: content.toLowerCase().includes('domain for sale') || 
                         content.toLowerCase().includes('buy this domain') ||
                         content.toLowerCase().includes('domain may be for sale'),
        hasParkedDomain: content.toLowerCase().includes('parked domain') ||
                         content.toLowerCase().includes('domain parking'),
        hasDomainAdvertisement: content.toLowerCase().includes('domain is for sale') ||
                              content.toLowerCase().includes('purchase this domain'),
        hasTrafficMonetization: content.toLowerCase().includes('traffic monetization') ||
                                content.toLowerCase().includes('domain monetization'),
        // Check for ad-related links
        adLinkCount: links.filter(link => 
          link.includes('ads') || link.includes('click') || link.includes('domain-for-sale')
        ).length
      };
      
      console.log(`[FALLBACK] JSDOM evaluation results for ${normalizedUrl}:`, {
        hasTitle: !!title,
        contentLength: content.length,
        linkCount: links.length,
        domainParkingSignals
      });
      
      // Check for domain parking/squatting pages
      const isDomainParking = 
        domainParkingSignals.hasDomainForSale || 
        domainParkingSignals.hasParkedDomain ||
        domainParkingSignals.hasDomainAdvertisement ||
        domainParkingSignals.hasTrafficMonetization ||
        domainParkingSignals.adLinkCount > 10 ||
        // Common domain parking page titles
        title.includes('Domain For Sale') ||
        title.includes('Buy this domain') ||
        title.includes('is for sale') ||
        // Current URL doesn't match original domain
        !normalizedUrl.includes(startHostname);

      if (isDomainParking) {
        console.log(`[DOMAIN-PARKING] Detected domain parking page for ${normalizedUrl} with fallback method`);
        throw new Error('Domain parking or squatting page detected. This is likely not a real website.');
      }
      
      if (title || content) {
        stats.successful++;
        
        await sendUpdate({
          type: 'progress',
          status: 'success',
          attempted: stats.attempted,
          successful: stats.successful,
          progress: Math.round((stats.attempted / stats.total) * 100),
          message: `Successfully crawled page (fallback method)`
        });
        
        console.log(`[SUCCESS] Successfully crawled with fallback: ${normalizedUrl}`);
        
        // Filter links as before
        const validLinks = links.filter(link => {
          try {
            const linkUrl = new URL(link);
            return linkUrl.hostname === startHostname && !shouldIgnoreUrl(link, startHostname);
          } catch {
            return false;
          }
        });
        
        // Create the result
        const result = {
          url: normalizedUrl,
          title,
          metaData: {
            description: content,
            links: validLinks
          },
          links: validLinks
        };

        // Send a result event to the client
        await sendUpdate({
          type: 'result',
          result: result
        });
        
        return result;
      } else {
        throw new Error('No valid content found with fallback method');
      }
    }
  } catch (error: any) {
    console.log(`[ERROR-HANDLING] Error processing ${normalizedUrl}:`, {
      error: error.message,
      stack: error.stack,
      attempted: stats.attempted,
      successful: stats.successful,
    });
    stats.attempted--; // Decrement on error

    if (signal.aborted) {
      console.log(`[ABORT] Crawl aborted for ${normalizedUrl}`);
      await sendUpdate({
        type: 'complete',
        status: 'canceled',
        attempted: stats.attempted,
        successful: stats.successful,
        progress: 100,
        message: 'Crawl canceled'
      });
      return null;
    }
    
    await sendUpdate({
      type: 'error',
      message: `Error crawling ${normalizedUrl}: ${error.message}`
    });
    return null;
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log(`[BROWSER] Closed browser for: ${normalizedUrl}`);
      } catch (e) {
        console.error(`[BROWSER] Error closing browser for ${normalizedUrl}:`, e);
      }
    }
  }
}

// Function to crawl the entire site
async function crawlSite(
  startUrl: string,
  maxPages: number,
  signal: AbortSignal,
  sendUpdate: ProgressUpdateFunction
): Promise<InternalCrawlResult[]> {
  const startUrlObj = new URL(startUrl);
  const startHostname = startUrlObj.hostname;
  
  // Get robots.txt parser once for this domain to check permissions
  const robotsParser = await getRobotsParser(startHostname);
  console.log(`[ROBOTS] Initial robots.txt check for ${startHostname}`);
  
  const normalizedStartUrl = enhancedNormalizeUrl(startUrl);
  const urlQueue: string[] = [normalizedStartUrl];
  const discovered = new Set<string>([normalizedStartUrl]);
  const results: InternalCrawlResult[] = [];
  
  // Create a stats counter
  const stats = {
    attempted: 0,
    successful: 0,
    total: maxPages
  };
  
  console.log(`[CRAWL LIMIT] Setting max pages to ${maxPages} (is TEST_MODE_MAX_URLS: ${maxPages === TEST_MODE_MAX_URLS})`);
  
  // Initial progress report
  await sendUpdate({
    type: 'progress',
    status: 'loading',
    attempted: 0,
    successful: 0,
    progress: 0,
    message: 'Starting crawl...',
    currentUrl: normalizedStartUrl
  });
  
  // Process URLs until we hit the limit or run out of URLs
  while (urlQueue.length > 0 && stats.attempted < maxPages && !signal.aborted) {
    // Enforce strict limit on TEST_MODE - don't let maxPages exceed what was set
    // This includes pages we've already discovered but haven't processed yet
    const remainingPages = maxPages - stats.attempted;
    if (remainingPages <= 0) {
      console.log(`[CRAWL LIMIT] Reached maximum page limit of ${maxPages}. Stopping crawl.`);
      break;
    }
    
    // Process at most CONCURRENT_TABS URLs at once, but never more than our remaining limit
    const batchSize = Math.min(CONCURRENT_TABS, urlQueue.length, remainingPages);
    
    if (batchSize <= 0) break;
    
    const batch = urlQueue.splice(0, batchSize);
    
    console.log(`[BATCH] Processing batch of ${batch.length} URLs. Queue size: ${urlQueue.length}, Attempted: ${stats.attempted}/${maxPages}, Remaining: ${remainingPages}`);
    
    await sendUpdate({
      type: 'progress',
      status: 'loading',
      attempted: stats.attempted,
      successful: stats.successful,
      progress: Math.round((stats.attempted / stats.total) * 100),
      message: `Crawling batch of ${batch.length} pages...`,
      currentUrl: batch[0]
    });
    
    const batchResults = await Promise.all(
      batch.map(url => 
        crawlSinglePage(url, signal, sendUpdate, stats, startHostname)
          .catch(err => {
            console.error(`[ERROR] Error crawling ${url}:`, err);
            return null;
          })
      )
    );
    
    // Filter out nulls and add to results
    const validResults = batchResults.filter(Boolean) as InternalCrawlResult[];
    results.push(...validResults);
    
    // Log stats after processing batch
    console.log(`[STATS AFTER BATCH] Attempted: ${stats.attempted}/${maxPages}, Successful: ${stats.successful}, Discovered URLs total: ${discovered.size}`);
    
    // Process newly discovered links only if we haven't hit our limit yet
    if (stats.attempted < maxPages) {
      for (const result of validResults) {
        if (result.links && result.links.length) {
          console.log(`[LINKS] Found ${result.links.length} links on ${result.url}`);
          
          // Check each link against robots.txt and only add if we're under limit
          for (const link of result.links) {
            // Stop adding links if we've hit or are about to exceed our limit
            if (discovered.size >= maxPages) {
              console.log(`[CRAWL LIMIT] Already discovered ${discovered.size} URLs, which is our max limit of ${maxPages}. Not adding more URLs to queue.`);
              break;
            }
            
            const normalizedLink = enhancedNormalizeUrl(link);
            
            // Skip if already discovered
            if (discovered.has(normalizedLink)) {
              continue;
            }
            
            // Check if this URL is allowed by robots.txt
            const isAllowed = await isUrlAllowed(normalizedLink);
            if (!isAllowed) {
              console.log(`[ROBOTS] Not adding ${normalizedLink} to queue - Disallowed by robots.txt`);
              continue;
            }
            
            // Add to queue and mark as discovered
            urlQueue.push(normalizedLink);
            discovered.add(normalizedLink);
            
            console.log(`[QUEUE] Added ${normalizedLink} to queue. Queue size: ${urlQueue.length}, Discovered total: ${discovered.size}/${maxPages}`);
          }
        }
        
        // Break early if we've discovered enough URLs
        if (discovered.size >= maxPages) {
          console.log(`[EARLY TERMINATION] Discovered URLs (${discovered.size}) has reached max limit (${maxPages}). Stopping discovery.`);
          break;
        }
      }
    } else {
      console.log(`[CRAWL LIMIT] Already processed ${stats.attempted} URLs, which is our max limit of ${maxPages}. Not adding more URLs to queue.`);
    }
    
    // Update progress
    const progress = Math.min(100, Math.round((stats.attempted / stats.total) * 100));
    
    await sendUpdate({
      type: 'progress',
      status: 'extracting',
      attempted: stats.attempted,
      successful: stats.successful,
      progress,
      message: `Processed ${stats.attempted} URLs, found ${results.length} valid pages`,
      linksFound: discovered.size
    });
  }
  
  // Final progress update
  await sendUpdate({
    type: 'complete',
    status: signal.aborted ? 'canceled' : 'success',
    attempted: stats.attempted,
    successful: stats.successful,
    progress: 100,
    message: signal.aborted 
      ? 'Crawl was canceled'
      : `Completed crawl with ${results.length} pages`,
    crawledUrls: results.map(r => r.url),
    results: results
  });
  
  return results;
}

// POST handler using ReadableStream for SSE
export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const { url, testMode = false } = await request.json();

  // First, check if URL is missing or invalid format
  if (!url || typeof url !== 'string' || url === 'unknown') {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid URL parameter. URL must be a valid web address.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate URL with more flexible TLD checking
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    // Additional validation to ensure URL has a valid format with hostname
    if (!parsedUrl.hostname || parsedUrl.hostname === 'unknown') {
      throw new Error('Invalid hostname in URL');
    }
    
    // Validate domain structure with flexible approach
    const parts = parsedUrl.hostname.split('.');
    
    // Domains must have at least 2 parts and the TLD shouldn't be just digits
    if (parts.length < 2 || /^\d+$/.test(parts[parts.length - 1])) {
      throw new Error('Invalid domain structure');
    }
    
    // Check that TLD is reasonable length (most are 2-6 chars)
    const tld = parts[parts.length - 1];
    if (tld.length < 2 || tld.length > 12) {
      throw new Error(`Suspicious TLD: .${tld}`);
    }
    
    // Domain shouldn't start with a hyphen
    if (parsedUrl.hostname.startsWith('-')) {
      throw new Error('Domain cannot start with a hyphen');
    }
    
    console.log(`[URL-VALIDATION] URL is valid:`, {
      url,
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname
    });
  } catch (error) {
    console.error(`[URL-VALIDATION] Invalid URL provided:`, { url, error });
    return new Response(
      JSON.stringify({ 
        error: 'Invalid URL format. Please provide a complete URL including protocol (http:// or https://) and a valid domain name.',
        details: error instanceof Error ? error.message : 'Unknown validation error'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate that the URL is reachable before starting a full crawl
  try {
    const testResponse = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; llmstxt-generator/1.0)'
      }
    });
    
    if (!testResponse.ok) {
      console.log(`[URL-CHECK] Failed to reach URL: ${url}, status: ${testResponse.status}`);
      return new Response(
        JSON.stringify({ 
          error: `Failed to reach the URL: ${url}`,
          details: `Server responded with status: ${testResponse.status}`
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[URL-CHECK] Successfully reached URL: ${url}`);
  } catch (error) {
    console.error(`[URL-CHECK] Error checking URL ${url}:`, error);
    return new Response(
      JSON.stringify({ 
        error: `Failed to reach the URL: ${url}`,
        details: error instanceof Error ? error.message : 'Unknown error during connection test'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Set limit based on testMode
  const effectiveMaxPages = testMode ? TEST_MODE_MAX_URLS : Number.MAX_SAFE_INTEGER; // 5 for test, effectively unlimited otherwise

  console.log(`[API /crawl] Starting crawl for: ${url}`, {
    testMode,
    effectiveMaxPages, // Log the effective limit
    targetUrl: url
  });

  // Create a new stream
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Function to send updates through the stream
  const sendUpdate = async (update: ProgressUpdateEvent) => {
    // Check if the client has disconnected before attempting to write
    if (request.signal.aborted) {
      console.log("[SSE Send] Client disconnected, skipping update:", update.type);
      // Optionally, ensure the writer is closed or aborted if not already
      try { writer.abort('Client disconnected'); } catch {} 
      return; 
    }
    
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(update)}\n\n`));
    } catch (error) {
      // Log the error but don't crash the server
      console.error("[SSE Send Error] Failed to write update, client likely disconnected:", error);
      // Attempt to close the writer gracefully on error
      try { writer.close(); } catch {} 
    }
  };

  // Start crawling in the background
  (async () => {
    try {
      console.log(`[API /crawl] Starting crawl of ${url}`);
      
      const results = await crawlSite(
        url,
        effectiveMaxPages, // Pass the limit to crawlSite
        request.signal,
        sendUpdate
      );

      console.log('>>> Crawl finished successfully, closing stream.');
      await writer.close();
    } catch (error) {
      console.error('Error during crawl:', error);
      await sendUpdate({
        type: 'error',
        message: error instanceof Error ? error.message : 'An unknown error occurred'
      });
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

// GET handler for direct URL-based crawl (legacy/alternative to POST)
export async function GET(request: NextRequest) {
  // Extract URL parameter from the search params
  const urlParam = request.nextUrl.searchParams.get('url');
  
  if (!urlParam) {
    return NextResponse.json(
      { error: 'URL parameter is missing' },
      { status: 400 }
    );
  }

  // Check test mode param - THIS IS THE KEY PARAMETER WE NEED TO VERIFY
  const testModeParam = request.nextUrl.searchParams.get('testMode');
  const isTestMode = testModeParam === 'true';
  
  console.log(`[API GET] Received crawler request with params:`, {
    url: urlParam,
    testMode: testModeParam,
    parsedTestMode: isTestMode,
    allParams: Object.fromEntries(request.nextUrl.searchParams.entries())
  });
  
  // Set limit based on test mode
  const effectiveMaxPages = isTestMode ? TEST_MODE_MAX_URLS : Number.MAX_SAFE_INTEGER;
  
  // Set headers for Server-Sent Events
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };

  // Create stream for sending updates
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  
  // Simple function to send a message to the client
  const sendUpdate = async (message: any) => {
    await writer.write(new TextEncoder().encode(`data: ${JSON.stringify(message)}\n\n`));
  };

  // Check if URL is reachable before starting the crawl
  try {
    console.log(`Checking if URL is reachable: ${urlParam}`);
    const headResponse = await fetch(urlParam, { method: 'HEAD' }).catch(() => null);
    
    if (!headResponse || !headResponse.ok) {
      console.error(`URL is not reachable: ${urlParam}`);
      await sendUpdate({
        type: 'error',
        message: `URL is not reachable: ${urlParam}. Please check if the URL is correct and accessible.`,
      });
      writer.close();
      return new Response(stream.readable, { headers });
    }
    
    console.log(`URL is reachable: ${urlParam}`);
  } catch (error) {
    console.error(`Error checking URL: ${urlParam}`, error);
    await sendUpdate({
      type: 'error',
      message: `Error checking URL: ${error instanceof Error ? error.message : String(error)}`,
    });
    writer.close();
    return new Response(stream.readable, { headers });
  }

  console.log(`Starting crawl for: ${urlParam} (test mode: ${isTestMode}, max pages: ${effectiveMaxPages})`);

  // Start crawling in the background
  crawlSite(urlParam, effectiveMaxPages, new AbortController().signal, sendUpdate)
    .then(async (results) => {
      console.log('>>> GET: Crawl finished successfully, closing stream.');
      await writer.close();
    })
    .catch(async (error) => {
      console.error('Error during crawl:', error);
      await sendUpdate({
        type: 'error',
        message: error instanceof Error ? error.message : 'An unknown error occurred'
      });
      await writer.close();
    });

  return new Response(stream.readable, { headers });
} 