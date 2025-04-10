import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isValidUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch (e) {
    return false;
  }
}

export function normalizeUrl(url: string): string {
  try {
    // Remove trailing slash if present
    const normalizedUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    
    // Ensure it has a protocol
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      return `https://${normalizedUrl}`;
    }
    
    return normalizedUrl;
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