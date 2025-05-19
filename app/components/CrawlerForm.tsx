"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useForm, Controller } from "react-hook-form"; // Keep Controller, remove useFieldArray
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Alert, AlertDescription } from "../components/ui/alert";
import { toast, Toaster } from 'sonner';
import { ExclamationTriangleIcon, InfoCircledIcon, CheckCircledIcon, CrossCircledIcon, TrashIcon, Pencil1Icon, BookmarkIcon, PlusIcon, UpdateIcon, GearIcon, ChevronDownIcon, ReloadIcon } from "@radix-ui/react-icons";
import { MAX_URLS_TO_PROCESS } from "../lib/constants";
import { saveAs } from 'file-saver';
import { 
  normalizeUrl, 
  isValidUrl, 
  extractDomain, 
  cn,
  saveCrawlerState, 
  loadCrawlerState, 
  clearCrawlerState,
  groupUrlsByDomain
} from '../lib/utils';
import { 
  CrawlResult, 
  WebsiteInput, 
  CrawlReport, 
  CrawlAttempt, 
  UrlProgress
} from '../lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "../../components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "../../components/ui/tooltip";
import { 
  CrawlQueueStatus 
} from './crawler/CrawlQueueStatus';
import { createPortal } from 'react-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { TestModeToggle } from "../components/crawler/TestModeToggle";
import { SavedWebsitesList } from './crawler/SavedWebsitesList';
import { WebsiteInputContainer } from './crawler/WebsiteInput/WebsiteInputContainer';

// Restore test mode constants that were accidentally removed
const DEFAULT_TEST_MODE = false; // Always default to Full Mode
const TEST_MODE_MAX_URLS = 5; // Test mode limit
const FULL_MODE_MAX_URLS = Infinity; // No limit for full mode

// Use a simple checkbox implementation for now
const Checkbox = ({ id, checked, onCheckedChange, className }: { 
  id: string; 
  checked?: boolean; 
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
}) => {
  return (
    <div className={`flex h-4 w-4 items-center justify-center rounded-sm border border-primary shadow ${checked ? "bg-primary text-primary-foreground" : "bg-background"} ${className}`}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        className="opacity-0 absolute h-4 w-4 cursor-pointer"
      />
      {checked && (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4 stroke-white">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  );
};

// Add form validation schema for website
const websiteSchema = z.object({
  url: z.string().min(1, "URL is required").refine(
    isValidUrl,
    "Please enter a valid URL"
  ),
  siteName: z.string().min(1, "Site name is required"),
    description: z.string().optional()
});

// Test mode constants for testing
const testUrls = [
  'https://example.com/',
  'https://example.com/about',
  'https://example.com/contact',
  'https://example.com/products',
  'https://example.com/services',
];

// Form validation schema
const formSchema = z.object({
  website: websiteSchema,
  includeScreenshots: z.boolean().default(false),
});

type FormSchemaType = z.infer<typeof formSchema>;

// Check if two domains are the same for duplication checking
function domainsMatch(domain1: string, domain2: string): boolean {
  // Remove www. prefix if present
  const cleanDomain1 = domain1.replace(/^www\./, '');
  const cleanDomain2 = domain2.replace(/^www\./, '');
  
  // Compare the cleaned domains
  return cleanDomain1 === cleanDomain2;
}

function formatTimestamp(timestamp: string | undefined): string {
  if (!timestamp) return "N/A";
  
  try {
    const date = new Date(timestamp);
    
    // Format date: DD/MM/YYYY
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    // Format time: HH:MM:SS
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  } catch (error) {
    console.error("Error formatting timestamp:", error);
    return "Invalid date";
  }
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 0) return "N/A";
  
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes === 0) {
    return `${seconds} sec`;
  }
  
  return `${minutes} min ${remainingSeconds} sec`;
}

// Helper function to calculate crawl duration
function calculateCrawlDuration(startTime?: string, endTime?: string): string {
  if (!startTime || !endTime) return "N/A";
  
  try {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const durationMs = end - start;
    
    return formatDuration(durationMs);
  } catch (error) {
    console.error("Error calculating crawl duration:", error);
    return "N/A";
  }
}

// Initial state for a temporary website input
const initialTempWebsiteState: WebsiteInput = {
  url: '',
  siteName: ''
};

// Checks if domains are same or related (subdomain)
function areDomainsSameOrRelated(domain1: string, domain2: string): boolean {
  // Remove www. prefix if present
  const cleanDomain1 = domain1.replace(/^www\./, '');
  const cleanDomain2 = domain2.replace(/^www\./, '');
  
  // Only return true if domains are exactly the same
  return cleanDomain1 === cleanDomain2;
}

// Group websites by domain relationship
function groupWebsitesByDomainLocal(websites: { url: string }[]): { url: string }[][] {
  const groups: { url: string }[][] = [];
  
  for (const website of websites) {
    const domain = extractDomain(website.url);
    
    // Find if we already have a group this domain should belong to
    const existingGroupIndex = groups.findIndex(group => {
      const groupDomain = extractDomain(group[0].url);
      return areDomainsSameOrRelated(domain, groupDomain);
    });
    
    if (existingGroupIndex >= 0) {
      // Add to existing group
      groups[existingGroupIndex].push(website);
    } else {
      // Create new group
      groups.push([website]);
    }
  }
  
  return groups;
}

// Function to request notification permission with feedback
async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    console.log("This browser does not support notifications");
    toast.error("Your browser doesn't support notifications");
    return false;
  }
  
  if (Notification.permission === "granted") {
    return true;
  }
  
  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      toast.success("Notifications enabled successfully!");
      return true;
    } else {
      toast.error("Notification permission denied. You won't receive alerts when processing completes.");
      return false;
    }
  }
  
  if (Notification.permission === "denied") {
    toast.error("Notifications are blocked. Please enable them in your browser settings for better experience.");
  }
  
  return false;
}

// Function to send system notification
function sendSystemNotification(title: string, options: NotificationOptions = {}) {
  if (Notification.permission === "granted") {
    const notification = new Notification(title, {
      icon: '/favicon.ico',
      ...options
    });
    
    notification.onclick = function() {
      window.focus();
      this.close();
    };
    
    return true;
  }
  return false;
}

// Function to show in-app toast notification
function showNotification(status: 'success' | 'error', message: string) {
  if (status === 'success') {
    toast.success(message, {
      duration: 5000,
      position: 'top-right',
    });
  } else {
    toast.error(message, {
      duration: 5000,
      position: 'top-right',
    });
  }
}

// Replace the existing UrlReviewList component with this enhanced version
const UrlReviewList = ({ 
  attempts,
  onRemoveUrl,
  onReaddUrl,
  onRecrawlUrl,
  removedUrls,
  crawlStartTime,
  crawlEndTime
}: { 
  attempts: CrawlAttempt[];
  onRemoveUrl: (url: string) => void;
  onReaddUrl: (url: string) => void;
  onRecrawlUrl: (url: string) => void;
  removedUrls: Map<string, CrawlAttempt>;
  crawlStartTime?: string;
  crawlEndTime?: string;
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showRemoved, setShowRemoved] = useState(false);
  const [showFailedOnly, setShowFailedOnly] = useState(false); // State for failed filter
  const itemsPerPage = 20;

  // Group attempts by domain for filtering
  const attemptsByDomain = useMemo(() => {
    const domains = new Map<string, {count: number, uniqueUrls: Set<string>}>();
    
    attempts.forEach(attempt => {
      try {
        const domain = new URL(attempt.url).hostname;
        if (!domains.has(domain)) {
          domains.set(domain, {count: 0, uniqueUrls: new Set()});
        }
        // Only count unique URLs per domain
        if (!domains.get(domain)!.uniqueUrls.has(attempt.url)) {
          domains.get(domain)!.count++;
          domains.get(domain)!.uniqueUrls.add(attempt.url);
        }
      } catch {
        // If URL parsing fails, add to "Other" category
        const domain = "Other";
        if (!domains.has(domain)) {
          domains.set(domain, {count: 0, uniqueUrls: new Set()});
        }
        if (!domains.get(domain)!.uniqueUrls.has(attempt.url)) {
          domains.get(domain)!.count++;
          domains.get(domain)!.uniqueUrls.add(attempt.url);
        }
      }
    });
    
    return domains;
  }, [attempts]);

  // Get unique domains for filter dropdown
  const domains = useMemo(() => Array.from(attemptsByDomain.keys()), [attemptsByDomain]);

  // Create latest attempts map (deduplicate by URL)
  const latestAttemptsMap = useMemo(() => {
    const map = new Map<string, CrawlAttempt>();
    attempts.forEach(attempt => {
      if (!map.has(attempt.url) || new Date(map.get(attempt.url)!.timestamp) < new Date(attempt.timestamp)) {
        map.set(attempt.url, attempt);
      }
    });
    return map;
  }, [attempts]);

  // Get removed attempts that were previously successful
  const removedAttemptsArray = useMemo(() => {
    return Array.from(removedUrls.values()).filter(attempt => 
      attempt.status === 'success' || 
      (latestAttemptsMap.has(attempt.url) && latestAttemptsMap.get(attempt.url)!.status === 'error' && 
       latestAttemptsMap.get(attempt.url)!.error === 'Manually removed by user')
    );
  }, [removedUrls, latestAttemptsMap]);

  // Filter and sort attempts based on filters
  const filteredAttempts = useMemo(() => {
    let results = Array.from(latestAttemptsMap.values());
    
    // Apply status filters
    if (showFailedOnly) {
      // Show only errors (excluding manually removed unless showRemoved is also checked)
      results = results.filter(attempt => 
        attempt.status === 'error' && (showRemoved || attempt.error !== 'Manually removed by user')
      );
    } else if (showRemoved) {
      // Show only manually removed errors
      results = results.filter(attempt => 
        attempt.status === 'error' && attempt.error === 'Manually removed by user'
      );
    } else {
      // Default: Hide manually removed errors
      results = results.filter(attempt => 
        !(attempt.status === 'error' && attempt.error === 'Manually removed by user')
      );
    }
    
    // Apply domain filter if selected
    if (selectedDomain) {
      results = results.filter(attempt => {
        try {
          return new URL(attempt.url).hostname === selectedDomain;
        } catch {
          return selectedDomain === "Other";
        }
      });
    }
    
    // Apply search filter if present
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      results = results.filter(attempt => 
        attempt.url.toLowerCase().includes(searchLower)
      );
    }
    
    // Sort by URL for consistency
    return results.sort((a, b) => a.url.localeCompare(b.url));
  }, [latestAttemptsMap, selectedDomain, searchTerm, showRemoved, showFailedOnly]);

  // Paginate results
  const paginatedAttempts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAttempts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAttempts, currentPage, itemsPerPage]);

  // Calculate total pages
  const totalPages = Math.max(1, Math.ceil(filteredAttempts.length / itemsPerPage));

  // Handle page navigation
  const nextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));
  const prevPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));
  const goToPage = (page: number) => setCurrentPage(Math.max(1, Math.min(page, totalPages)));

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDomain, searchTerm, showRemoved, showFailedOnly]); // Add showFailedOnly dependency

  // Calculate stats
  const totalUrls = latestAttemptsMap.size;
  const successfulUrls = Array.from(latestAttemptsMap.values()).filter(a => a.status === 'success').length;
  const removedUrlsCount = Array.from(latestAttemptsMap.values()).filter(a => 
    a.status === 'error' && a.error === 'Manually removed by user'
  ).length;
  const successRate = totalUrls > 0 ? Math.round((successfulUrls / totalUrls) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="flex items-center justify-between mb-4 p-3  rounded-lg">
        <div className="text-sm">
          <span className="font-medium">{totalUrls}</span> total URLs 
          <span className="mx-2">•</span>
          <span className="text-green-600 font-medium">{successfulUrls}</span> successful
          {removedUrlsCount > 0 && (
            <>
              <span className="mx-2">•</span>
              <span className="text-red-600 font-medium">{removedUrlsCount}</span> removed
            </>
          )}
          <span className="mx-2">•</span>
          <span className={`font-medium ${successRate > 80 ? 'text-green-600' : successRate > 50 ? 'text-amber-600' : 'text-red-600'}`}>
            {successRate}% success rate
          </span>
        </div>
        {crawlEndTime && crawlStartTime && (
          <div className="text-xs text-gray-500">
            Crawl completed in {Math.round((new Date(crawlEndTime).getTime() - new Date(crawlStartTime).getTime()) / 1000)}s at {new Date(crawlEndTime).toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Filters - Two Row Layout */}
      <div className="space-y-3 mb-4">
        {/* Row 1: Search and Domain */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Give search more width */}
          <div className="w-full sm:w-2/3">
            <div className="relative rounded-md shadow-sm">
              <input
                type="text"
                placeholder="Search URLs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-3 pr-10 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>
          {/* Give dropdown less width */}
          <div className="w-full sm:w-1/3">
            <select
              value={selectedDomain || ''}
              onChange={(e) => setSelectedDomain(e.target.value || null)}
              className="block w-full pl-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Domains ({totalUrls})</option>
              {domains.map(domain => {
                const count = attemptsByDomain.get(domain)?.count || 0;
                return (
                  <option key={domain} value={domain}>
                    {domain} ({count})
                  </option>
                );
              })}
            </select>
          </div>
        </div>
        {/* Row 2: Checkboxes and Count */}
        <div className="flex justify-between items-center">
          {/* Group checkboxes together */} 
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="show-removed"
                checked={showRemoved}
                onChange={(e) => setShowRemoved(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="show-removed" className="ml-2 text-sm text-gray-700">
                Show removed
              </label>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="show-failed"
                checked={showFailedOnly}
                onChange={(e) => setShowFailedOnly(e.target.checked)}
                className="h-4 w-4 text-red-600 focus:ring-red-500"
                disabled={showRemoved} // Disable if showing removed only
              />
              <label 
                htmlFor="show-failed" 
                className={`ml-2 text-sm ${showRemoved ? 'text-gray-400' : 'text-gray-700'}`}
              >
                Show failed only
              </label>
            </div>
          </div>
          {/* Count text aligned right */} 
          <span className="text-sm text-gray-500 text-right">
            Showing {paginatedAttempts.length} of {filteredAttempts.length} URLs
          </span>
        </div>
      </div>

      {/* URL Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                URL
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                Status
              </th>
              <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {paginatedAttempts.length > 0 ? (
              paginatedAttempts.map((attempt) => (
                <tr key={attempt.url} className="hover:">
                  <td className="px-4 py-2">
                    <div className="text-sm font-medium  truncate max-w-md" title={attempt.url}>
                      {attempt.url}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      attempt.status === 'success' ? 'bg-green-100 text-green-800' : 
                      attempt.status === 'error' && attempt.error === 'Manually removed by user' ? 'bg-yellow-100 text-yellow-800' :
                      attempt.status === 'error' ? 'bg-red-100 text-red-800' : 
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {attempt.status === 'error' && attempt.error === 'Manually removed by user' ? 'removed' : attempt.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    {attempt.status === 'success' ? (
                      <button
                        onClick={() => onRemoveUrl(attempt.url)}
                        className="text-red-600 hover:text-red-900 text-sm"
                      >
                        Remove
                      </button>
                    ) : attempt.status === 'error' && attempt.error === 'Manually removed by user' ? (
                      <button
                        onClick={() => onReaddUrl(attempt.url)}
                        className="text-green-600 hover:text-green-900 text-sm"
                      >
                        Re-add
                      </button>
                    ) : attempt.status === 'error' ? (
                      <button
                        onClick={() => onRecrawlUrl(attempt.url)} 
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Retry
                      </button>
                    ) : (
                      <span className="text-gray-400 text-sm">No action</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="px-4 py-4 text-center text-sm text-gray-500">
                  {showRemoved ? "No removed URLs found" : "No URLs found matching your filters"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border rounded-lg">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={prevPage}
              disabled={currentPage === 1}
              className={`relative inline-flex items-center px-4 py-2 text-sm font-medium rounded-md ${
                currentPage === 1 ? 'text-gray-300 ' : 'text-gray-700 hover:'
              }`}
            >
              Previous
            </button>
            <button
              onClick={nextPage}
              disabled={currentPage === totalPages}
              className={`ml-3 relative inline-flex items-center px-4 py-2 text-sm font-medium rounded-md ${
                currentPage === totalPages ? 'text-gray-300 ' : 'text-gray-700 hover:'
              }`}
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{((currentPage - 1) * itemsPerPage) + 1}</span> to{' '}
                <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredAttempts.length)}</span> of{' '}
                <span className="font-medium">{filteredAttempts.length}</span> results
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  onClick={prevPage}
                  disabled={currentPage === 1}
                  className={`relative inline-flex items-center px-2 py-2 rounded-l-md text-sm font-medium ${
                    currentPage === 1 ? 'text-gray-300 ' : 'text-gray-500 hover:'
                  }`}
                >
                  <span className="sr-only">Previous</span>
                  &#8592;
                </button>
                
                {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                  // Logic to show pages around current page
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => goToPage(pageNum)}
                      className={`relative inline-flex items-center px-4 py-2 text-sm font-medium ${
                        currentPage === pageNum 
                          ? 'z-10 bg-blue-50 border-blue-500 text-blue-600' 
                          : 'text-gray-500 hover:'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                
                <button
                  onClick={nextPage}
                  disabled={currentPage === totalPages}
                  className={`relative inline-flex items-center px-2 py-2 rounded-r-md text-sm font-medium ${
                    currentPage === totalPages ? 'text-gray-300 ' : 'text-gray-500 hover:'
                  }`}
                >
                  <span className="sr-only">Next</span>
                  &#8594;
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Add type for API response
interface ApiResponse {
  output_text: string;
  description: string;
  metadata: {
    url: string;
    title: string;
    existingDescription: string;
  };
}

// Add timeout and retry configuration
const CRAWL_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;

// Update CurrentStep type to remove 'batch-processing'
export type CurrentStep = 
  | 'idle' 
  | 'crawling' 
  | 'generating' 
  | 'reviewing' 
  // | 'batch-processing' // Removed batch-processing step
  | 'error' 
  | 'initial' 
  | 'complete';

// Add interface for API response
interface GenerationResponse {
  output_text: string;
  metadata: {
    url: string;
    title: string;
    existingDescription: string;
  };
}

// Add a function to get user-friendly error messages based on technical errors
const getUserFriendlyErrorMessage = (error: Error | string): { message: string; details?: string } => {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorStack = error instanceof Error ? error.stack : '';
  
  // Navigation timeout error
  if (errorMessage.includes('Navigation timeout') || errorMessage.includes('timeout')) {
    return {
      message: "Connection timed out while trying to access the website.",
      details: "This could be because the site is slow to respond or is blocking automated access. Try again later or check if the site is accessible in your browser."
    };
  }
  
  // Network error
  if (errorMessage.includes('net::ERR') || errorMessage.includes('fetch failed')) {
    return {
      message: "Unable to connect to the website.",
      details: "There might be network connectivity issues, or the website may be down. Please check if you can access the site in your browser and try again."
    };
  }
  
  // Access denied error
  if (errorMessage.includes('403') || errorMessage.includes('Forbidden') || errorMessage.includes('Access denied')) {
    return {
      message: "Access to this website was denied.",
      details: "The website might be blocking automated access or crawlers. Some websites have security measures that prevent tools like this from accessing their content."
    };
  }
  
  // CORS error
  if (errorMessage.includes('CORS') || errorMessage.includes('cross-origin')) {
    return {
      message: "The website has content security restrictions.",
      details: "This website has cross-origin restrictions that prevent our tool from accessing its content."
    };
  }
  
  // Invalid URL
  if (errorMessage.includes('Invalid URL') || errorMessage.includes('URL parsing failed')) {
    return {
      message: "The URL entered appears to be invalid.",
      details: "Please check that you've entered a complete and correct website address including the 'https://' part."
    };
  }
  
  // No pages processed
  if (errorMessage.includes('no pages could be successfully processed')) {
    return {
      message: "No pages could be successfully processed.",
      details: "This could be due to the website blocking crawlers, using JavaScript that our tool can't process, or having content protection measures in place. Try with a different website or check if the site is publicly accessible."
    };
  }
  
  // Fallback for unknown errors
  return {
    message: "An error occurred while processing the website.",
    details: "There was a problem crawling this website. This could be due to the site's structure, security measures, or temporary issues. Please try again later."
  };
};

// Add this function before the CrawlerForm component definition
// Function to format time difference in a human-readable format
function formatTimeDifference(endTime: Date, startTime: Date): string {
  const diffInMs = endTime.getTime() - startTime.getTime();
  const seconds = Math.floor(diffInMs / 1000);
  
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
}

export default function CrawlerForm() {
  // Replace the website array state with a single website object
  const [website, setWebsite] = useState<WebsiteInput>({ url: '', siteName: '', description: '' });
  const [savedWebsites, setSavedWebsites] = useState<WebsiteInput[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [testModeContainer, setTestModeContainer] = useState<HTMLElement | null>(null);

  // State variable for test mode toggle
  const [isTestMode, setIsTestMode] = useState(DEFAULT_TEST_MODE);

  // Add useEffect to load saved websites from localStorage
  useEffect(() => {
    try {
      const savedItems = localStorage.getItem('savedWebsites');
      if (savedItems) {
        const parsedItems = JSON.parse(savedItems);
        if (Array.isArray(parsedItems)) {
          setSavedWebsites(parsedItems);
          console.log('Loaded saved websites from localStorage:', parsedItems);
        } else {
          console.error('Saved websites data is not an array:', parsedItems);
        }
      }
    } catch (error) {
      console.error('Error loading saved websites from localStorage:', error);
    }
  }, []);

  // Add useEffect to save websites to localStorage when they change
  useEffect(() => {
    try {
      if (savedWebsites.length > 0) {
        localStorage.setItem('savedWebsites', JSON.stringify(savedWebsites));
        console.log('Saved websites to localStorage:', savedWebsites);
      } else {
        // Clear localStorage when there are no saved websites
        localStorage.removeItem('savedWebsites');
        console.log('Cleared saved websites from localStorage');
      }
    } catch (error) {
      console.error('Error saving websites to localStorage:', error);
    }
  }, [savedWebsites]);

  // Add useEffect to handle the test mode container
  useEffect(() => {
    const testModeContainer = document.getElementById('test-mode-container');
    if (testModeContainer) {
      setTestModeContainer(testModeContainer);
    }
    
    // This processingModeContainer code can be safely removed as it's legacy code
    // const processingModeContainer = document.getElementById('processing-mode-container');
    // if (processingModeContainer) {
    //   setPortalContainer(processingModeContainer);
    // }
    
    // Load saved test mode preference from localStorage
    try {
    const savedTestMode = localStorage.getItem('crawlerTestMode');
    if (savedTestMode !== null) {
      setIsTestMode(JSON.parse(savedTestMode));
      }
    } catch (e) {
      console.error('Error loading test mode from localStorage:', e);
    }
  }, []);

  // Keep the persistence effect
  useEffect(() => {
    localStorage.setItem('crawlerTestMode', JSON.stringify(isTestMode));
  }, [isTestMode]);

  // Effect to set the portal containers
  useEffect(() => {
    const processingModeContainer = document.getElementById('processing-mode-container');
    if (processingModeContainer) {
      setPortalContainer(processingModeContainer);
    }
    
    const testModeElem = document.getElementById('test-mode-container');
    if (testModeElem) {
      setTestModeContainer(testModeElem);
    }
  }, []);

  const handleAddWebsite = (website: WebsiteInput) => {
    if (savedWebsites.length >= 3) {
      toast.error("You can only save up to 3 websites at a time.");
      return;
    }
    
    const normalizedUrlToAdd = normalizeUrl(website.url);
    const isDuplicate = savedWebsites.some(existingWebsite => normalizeUrl(existingWebsite.url) === normalizedUrlToAdd);

    if (isDuplicate) {
      toast.error("This website URL is already in the queue.");
      return;
    }

    setSavedWebsites([...savedWebsites, website]);
  };

  // Add function to save a website
  const handleSaveWebsite = (website: WebsiteInput) => {
    // Make sure we're using a normalized version of the website object
    const normalizedWebsite = {
      siteName: website.siteName.trim(),
      url: website.url.trim(),
      description: website.description?.trim() || ''
    };
    
    // Check if website with same URL already exists
    const existingIndex = savedWebsites.findIndex(
      (saved) => saved.url === normalizedWebsite.url
    );
    
    if (existingIndex >= 0) {
      // Update existing website
      const updatedWebsites = [...savedWebsites];
      updatedWebsites[existingIndex] = normalizedWebsite;
      setSavedWebsites(updatedWebsites);
      toast.success('Website updated in saved list');
    } else {
      // Add new website
      setSavedWebsites([...savedWebsites, normalizedWebsite]);
      toast.success('Website saved for future use');
    }
  };

  const handleRemoveWebsite = (index: number) => {
    setSavedWebsites(savedWebsites.filter((_, i) => i !== index));
  };

  const handleWebsiteSelect = (website: WebsiteInput) => {
    if (isProcessing) {
      toast.error("Please wait until the current crawl completes.");
      return;
    }
    
    // Use the handleDirectCrawl function to immediately crawl the selected website
    handleDirectCrawl(website);
  };

  const handleWebsiteDelete = (index: number) => {
    setSavedWebsites(savedWebsites.filter((_, i) => i !== index));
  };

  const handleStartCrawl = async () => {
    setIsProcessing(true);
    try {
      // Get current form values
      const values = {
        website,
        includeScreenshots: false,
      };
      
      // Call onSubmit with the form values
      await onSubmit(values);
    } catch (error) {
      console.error('Error starting crawl:', error);
      toast.error('Failed to start crawl', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<CurrentStep>("idle");
  const [results, setResults] = useState<CrawlResult[]>([]);
  const [outputMarkdown, setOutputMarkdown] = useState("");
  const [formData, setFormData] = useState<z.infer<typeof formSchema> | null>(null);
  const [currentlyCrawling, setCurrentlyCrawling] = useState<string | null>(null);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      website: { url: '', siteName: '', description: '' },
      includeScreenshots: false,
    },
  });
  
  // Enhanced progress tracking with updated type
  const [urlProgressMap, setUrlProgressMap] = useState<Record<string, UrlProgress>>({});
  const [processedUrls, setProcessedUrls] = useState<number>(0);
  const [totalUrlsToProcess, setTotalUrlsToProcess] = useState<number>(0);
  const [aiProcessedCount, setAiProcessedCount] = useState<number>(0);
  const [detailedStatusMessage, setDetailedStatusMessage] = useState<string>("");
  
  // State restoration tracking
  const [stateRestored, setStateRestored] = useState(false);

  // Add state for temporary input values
  const [tempWebsite, setTempWebsite] = useState<WebsiteInput>(initialTempWebsiteState);
  
  // Track if we're editing an existing website
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Add AbortController refs
  const crawlAbortController = useRef<AbortController | null>(null);
  const generateAbortController = useRef<AbortController | null>(null);

  // Add state for URL validation error
  const [urlError, setUrlError] = useState<string | null>(null);

  // Add state for including screenshots
  const [includeScreenshots, setIncludeScreenshots] = useState(false);

  // Add to the existing state declarations
  const [crawlReport, setCrawlReport] = useState<CrawlReport>({
    startTime: '',
    endTime: undefined,
    totalAttempts: 0,
    successfulAttempts: 0,
    failedAttempts: 0,
    attempts: []
  });

  const [generatedFiles, setGeneratedFiles] = useState<{ markdown: string; json: string } | null>(null);
  const [processingMessage, setProcessingMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // First, let's fix the removedUrls state declaration (keep only one, inside the component)
  const [removedUrls, setRemovedUrls] = useState<Map<string, CrawlAttempt>>(new Map());

  // Replace the existing handleRemoveUrl function with the updated version
  const handleRemoveUrl = (url: string) => {
    // Find the attempt being removed to save its original data
    const attemptBeingRemoved = crawlReport.attempts.find(a => a.url === url);
    
    if (attemptBeingRemoved) {
      // Save the original attempt data in the removedUrls Map
      setRemovedUrls(prev => {
        const newMap = new Map(prev);
        newMap.set(url, attemptBeingRemoved);
        return newMap;
      });
    }
    
    // Filter out the URL from results
    setResults(prevResults => prevResults.filter(result => result.url !== url));
    
    // Update the crawl report
    setCrawlReport(prev => {
      const newAttempts = prev.attempts.map(attempt => 
        attempt.url === url 
          ? { ...attempt, status: 'error' as const, error: 'Manually removed by user' }
          : attempt
      );
      
      // Recalculate success counts
      const successfulAttempts = newAttempts.filter(a => a.status === 'success').length;
      
      return {
        ...prev,
        successfulAttempts,
        failedAttempts: prev.totalAttempts - successfulAttempts,
        attempts: newAttempts
      };
    });
    
    toast.success(`Removed ${url} from results`);
  };

  // Add the new handleReaddUrl function
  const handleReaddUrl = (url: string) => {
    // Get the original attempt data from the removedUrls Map
    const originalAttempt = removedUrls.get(url);
    
    if (!originalAttempt) return;
    
    // Remove from removedUrls Map
    setRemovedUrls(prev => {
      const newMap = new Map(prev);
      newMap.delete(url);
      return newMap;
    });
    
    // Re-add to results if it was a successful crawl
    if (originalAttempt.status === 'success') {
      // Find the result in the original data
      const originalResult = results.find(r => r.url === url);
      if (originalResult) {
        setResults(prev => [...prev, originalResult]);
      }
    }
    
    // Update the crawl report
    setCrawlReport(prev => {
      const newAttempts = prev.attempts.map(attempt => 
        attempt.url === url 
          ? { ...originalAttempt, error: undefined } // Restore original status
          : attempt
      );
      
      // Recalculate success counts
      const successfulAttempts = newAttempts.filter(a => a.status === 'success').length;
      
      return {
        ...prev,
        successfulAttempts,
        failedAttempts: prev.totalAttempts - successfulAttempts,
        attempts: newAttempts
      };
    });
    
    toast.success(`Re-added ${url} to results`);
  };

  // Add state for tracking completed URLs
  const [completedUrls, setCompletedUrls] = useState<string[]>([]);

  // Progress update handler
  const handleProgressUpdate = useCallback((progressData: UrlProgress) => {
    console.log('[Client] Received Progress Update:', progressData);
    
    // Update URL-specific progress - MERGE instead of replace
    setUrlProgressMap(prevMap => {
      const url = progressData.metaData?.currentUrl; // This tracks the *page* being processed
      if (!url) return prevMap;

      const progress = typeof progressData.progress === 'number' ? progressData.progress : 0;
      
      const updatedProgress = {
        status: progressData.status || 'loading',
        progress: progress,
        metaData: {
          attempted: progressData.metaData?.attempted || 0,
          successful: progressData.metaData?.successful || 0,
          total: progressData.metaData?.total || progressData.metaData?.attempted || 0,
          currentUrl: url,
          status: progressData.metaData?.status || 'loading',
          message: progressData.metaData?.message || 'Processing...'
        }
      };

      // Store progress based on the specific URL being processed (might be sub-page)
      return {
        ...prevMap, // Merge with previous state
        [url]: updatedProgress
      };
    });

    // Update overall progress
    setProgress(progressData.progress || 0);
    
    if (progressData.metaData?.message) {
      setDetailedStatusMessage(progressData.metaData.message); 
    }
  }, []);

  // Ensure renderDetailedProgress uses the imported UrlProgress type
  const renderDetailedProgress = (progress: UrlProgress) => {
    if (!progress.metaData || !progress.metaData.currentUrl) {
      return <div className="mt-2 text-sm text-gray-500">Initializing...</div>;
    }

    const { currentUrl, status, attempted, successful, total } = progress.metaData;
    const isUnlimited = total >= Number.MAX_SAFE_INTEGER;
    const progressValue = isUnlimited ? -1 : (total > 0 ? Math.round((attempted / total) * 100) : 0); // Calculate % only if limited
    const successRate = attempted ? Math.round((successful / attempted) * 100) : 0;

    return (
      <div className="mt-2 space-y-3">
        {/* Main Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <div className="font-medium">Overall Progress</div>
            {/* Show percentage only if not unlimited */}
            {!isUnlimited && (
              <div className="text-gray-500">{progressValue}%</div>
            )}
          </div>
          {/* Use indeterminate bar if unlimited, otherwise percentage */}
          {isUnlimited ? (
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full animate-pulse ${status === 'error' ? 'bg-red-300' : status === 'success' ? 'bg-green-300' : 'bg-blue-300'}`}
                style={{ width: '100%' }}
              />
            </div>
          ) : (
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ease-in-out ${
                  status === 'error' ? 'text-red-500' :
                  status === 'success' ? 'text-green-500' :
                  'bg-blue-500'
                }`}
                style={{ width: `${progressValue}%` }}
              />
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div>
            {/* Show "X of Y" only if limited */}
            {isUnlimited ? (
              <span className="font-medium">{successful}</span>
            ) : (
              <><span className="font-medium">{successful}</span> of <span className="font-medium">{total}</span></>
            )}
             pages processed
          </div>
          <div>
            Success Rate: <span className="font-medium">{successRate}%</span>
          </div>
        </div>

        {/* Current URL - Only show if still processing */}
        {status !== 'success' && (
          <div className="flex items-center space-x-2 text-sm">
            <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <div className="truncate text-gray-600">
              Processing: <span className="font-medium">{currentUrl}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Add a new component for the completed URLs list
  const CompletedUrlsList = ({ urls }: { urls: string[] }) => {
    // Only show the last 3 completed URLs
    const recentUrls = urls.slice(-3);
    
    return (
      <div className="mt-4 space-y-2">
        <div className="text-sm font-medium text-gray-600">Recently Completed:</div>
        <div className="space-y-1">
          {recentUrls.map((url, index) => (
            <div 
              key={url} 
              className="text-sm text-gray-500 flex items-center space-x-2"
            >
              <CheckCircledIcon className="h-4 w-4 text-green-500" />
              <span className="truncate">{url}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Add cancel handler
  const handleCancelCrawl = useCallback(() => {
    console.log("Cancel button clicked, crawl abort controller:", !!crawlAbortController.current);
    
    if (crawlAbortController.current) {
      console.log("Aborting crawl...");
      
      // First, abort the controller to trigger any abort event listeners
      crawlAbortController.current.abort();
      
      // Set UI states to show the crawl is done
      setIsProcessing(false);
      setCurrentlyCrawling(null);
      setCurrentStep('idle');
      setProcessingMessage("Crawl cancelled");
      
      // Show toast notification
      toast.info('Crawling cancelled');
      
      // Record cancellation in the crawl report
      setCrawlReport(prev => ({
        ...prev,
        endTime: new Date().toISOString()
      }));
      
      // Reset the abort controller
      crawlAbortController.current = null;
    } else {
      console.log("No active crawlAbortController found");
      // If no abort controller, still reset the UI
      setIsProcessing(false);
      setCurrentlyCrawling(null);
      setCurrentStep('idle');
      toast.info('No active crawl to cancel');
    }
  }, []);

  // Function to crawl the website
  const crawlWebsite = async (websiteUrl: string): Promise<CrawlResult[]> => {
    return new Promise(async (resolve, reject) => {
    try {
        // Create a new AbortController for this crawl
      crawlAbortController.current = new AbortController();
      
        // Add an event listener to handle the abort event
        crawlAbortController.current.signal.addEventListener('abort', () => {
          console.log("Crawl aborted via AbortController signal");
        });

        // Log testMode status for debugging
        console.log(`[FRONTEND] Starting crawl with settings:`, {
          url: websiteUrl,
          testMode: isTestMode,
          maxUrls: isTestMode ? 'TEST_MODE_MAX_URLS (5)' : 'unlimited'
        });

        // Add testMode parameter to URL based on isTestMode state
        const crawlParams = new URLSearchParams({
          url: websiteUrl,
          testMode: isTestMode.toString(),
        });
        
        console.log(`[FRONTEND] Starting crawl with params:`, {
          url: websiteUrl,
          testMode: isTestMode,
          testModeString: isTestMode.toString(),
          maxUrls: isTestMode ? 5 : 'unlimited'
        });
        
        // Add error handling for AbortController
        crawlAbortController.current = new AbortController();
        const signal = crawlAbortController.current.signal;
        
        // Reset the crawl state
        const uniqueUrls = new Set<string>();
      let results: CrawlResult[] = [];
        let completedPages: string[] = [];
        
        // Create the EventSource for SSE connection
        const params = new URLSearchParams({
          url: websiteUrl,
          testMode: isTestMode.toString(), // Make sure this is present and correct
          maxPages: isTestMode ? TEST_MODE_MAX_URLS.toString() : '0',  // 0 means use server-side default
          includeScreenshots: 'false',
          includeLinks: 'true',
          depth: '2'
        });
        
        console.log(`[FRONTEND] Creating EventSource with params:`, Object.fromEntries(params.entries()));
        const eventSource = new EventSource(`/api/crawl?${params.toString()}`);
        
        // Listen for abort event to close EventSource
        crawlAbortController.current.signal.addEventListener('abort', () => {
          console.log("Closing EventSource due to abort signal");
          eventSource.close();
          reject(new Error("Crawl was cancelled"));
        });
        
        // Listen for messages from the server
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('SSE event:', data.type, data);
            
            if (data.type === "progress") {
              // Update progress information
              setProcessedUrls(data.attempted || 0);
              setProgress(data.progress || 0);
              
              if (data.currentUrl) {
                setCurrentlyCrawling(data.currentUrl);
                setProcessingMessage(`Processing: ${data.currentUrl}`);
              }
            } 
            else if (data.type === "result" && data.result) {
              // A page was successfully crawled
              const url = data.result.url;
              
              if (url && !uniqueUrls.has(url)) {
                uniqueUrls.add(url);
                completedPages.push(url);
                setCompletedUrls([...completedPages]);
                
                // Add to results array if not already there
                const newResult: CrawlResult = {
                  url: url,
                  title: data.result.title || url,
                  metaData: data.result.metaData || {},
                  links: data.result.links || []
                };
                
                results = [...results, newResult];
                setResults(results);
                
                // Update the crawl report
                setCrawlReport(prev => {
                  const newAttempt: CrawlAttempt = {
                    url: url,
                    timestamp: new Date().toISOString(),
                    status: 'success',
                    duration: 0,
                    linksFound: data.result?.links?.length || 0
                  };
                  
                  return {
                    ...prev,
                    totalAttempts: prev.totalAttempts + 1,
                    successfulAttempts: prev.successfulAttempts + 1,
                    attempts: [...prev.attempts, newAttempt]
                  };
                });
              }
            } 
            else if (data.type === "error") {
              // A page had an error during crawling
                  setCrawlReport(prev => {
                const newAttempt: CrawlAttempt = {
                  url: data.url || "unknown",
                  timestamp: new Date().toISOString(),
                  status: 'error',
                  duration: 0,
                  error: data.message || "Unknown error"
                };
                    
                    return {
                ...prev,
                  totalAttempts: prev.totalAttempts + 1,
                  failedAttempts: prev.failedAttempts + 1,
                  attempts: [...prev.attempts, newAttempt]
                    };
                  });
                }
            else if (data.type === "complete") {
              // Crawling is complete
              setProgress(100);
              setProcessingMessage("Crawl completed");
              setCurrentlyCrawling(null);
              
              // Record end time in the report
      setCrawlReport(prev => ({
        ...prev,
                endTime: new Date().toISOString()
              }));
              
              // If we have results data from the complete event, use it
              if (data.results && Array.isArray(data.results) && data.results.length > 0) {
                console.log(`Using ${data.results.length} results from complete event`);
                
                // Map the server results to our client-side format
                const completeResults = data.results.map((result: any) => ({
                  url: result.url,
                  title: result.title || result.url.split('/').pop() || 'Page',
                  metaData: result.metaData || {},
                  links: result.links || []
                }));
                
                results = completeResults;
                setResults(completeResults);
              }
              // Otherwise, if we got crawledUrls in the complete event, use them to fill in results
              else if (data.crawledUrls && Array.isArray(data.crawledUrls) && data.crawledUrls.length > 0 && results.length === 0) {
                console.log("Using crawledUrls from complete event to create results", data.crawledUrls);
                
                // Create simple results for each crawled URL
                const placeholderResults = data.crawledUrls.map((url: string) => ({
                  url,
                  title: url.split('/').pop() || 'Page',
                  metaData: { description: "Successfully crawled page." },
                  links: []
                }));
                
                results = placeholderResults;
                setResults(placeholderResults);
              }
              
              // Close the connection and resolve with results
              eventSource.close();
              console.log(`Crawl complete, returning ${results.length} results`);
              resolve(results);
            }
    } catch (error) {
              console.error("Error parsing SSE message:", error);
            }
          };

          // Handle connection open
          eventSource.onopen = () => {
            console.log("SSE connection established");
          };

          // Handle errors
          eventSource.onerror = (error) => {
            console.error("SSE Error:", error);
            eventSource.close();
            
            // If we have results already, resolve with them
            if (results.length > 0) {
              resolve(results);
    } else {
              reject(new Error("Error during crawling process"));
            }
          };
        } catch (error) {
          console.error("Crawl error:", error);
          reject(error);
        }
      });
    };

  // Handler to download generated files
  const handleDownload = () => {
    if (generatedFiles) {
      const blob = new Blob([generatedFiles.markdown], { type: 'text/markdown' });
      saveAs(blob, "llms.txt");
    }
  };

  // Add at the beginning of the component function, with other state declarations
  const [activeTab, setActiveTab] = useState<string>("status");
  const tabsRef = useRef<React.ElementRef<typeof Tabs>>(null);

  // Add these functions before the return statement
  const handleStartOver = () => {
    // First, cancel any active crawl process
    if (crawlAbortController.current) {
      console.log("Start Over: Cancelling active crawl");
      handleCancelCrawl();
    }

    // Then reset all the UI state
    setCurrentStep("idle");
    setError(null);
    setProgress(0);
    setProcessedUrls(0);
    setCurrentlyCrawling(null);
    setUrlProgressMap({});
    setGeneratedFiles(null);
    setProcessingMessage("");
    setResults([]);
    setCompletedUrls([]);
    setRemovedUrls(new Map());
    setIsProcessing(false);
    setActiveTab("status");
  };

  const handleDirectCrawl = async (websiteToAdd: WebsiteInput) => {
    // First, validate the URL before proceeding
    if (!isValidUrl(websiteToAdd.url)) {
      toast.error('Invalid URL format', {
        description: 'Please enter a valid website URL with a proper domain name (e.g., example.com)'
      });
        return;
      }

    // Update the current website state with the provided website
    setWebsite(websiteToAdd);
    
    // Only add to savedWebsites if the "Save to List" checkbox was checked
    // We'll detect this by checking if the website was already in the input field
    // before the crawl button was pressed
    const normalizedUrlToAdd = normalizeUrl(websiteToAdd.url);
    const isDuplicate = savedWebsites.some(existingWebsite => 
      normalizeUrl(existingWebsite.url) === normalizedUrlToAdd
    );
    
    // Notice we're NOT adding to savedWebsites here anymore - we only save when
    // the user explicitly uses the Save to List feature
    
    // Start crawling immediately
    try {
      setIsProcessing(true);
      // Get current form values
      const values = {
        website: websiteToAdd,
        includeScreenshots: false,
      };
      
      // Submit form
      await onSubmit(values);
    } catch (error) {
      console.error('Error starting crawl:', error);
      toast.error('Failed to start crawl', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      });
      
      // Make sure to reset UI state if error occurs
      setIsProcessing(false);
      setCurrentlyCrawling(null);
    }
  };

  const handleProceedToGeneration = async () => {
    // If generation is already complete, don't proceed
    if (currentStep === "complete") {
      toast.info("File has already been generated");
      return;
    }
    
    try {
      setCurrentStep("generating");
      setActiveTab("files");
      setProcessingMessage("Generating llms.txt file...");
      setProgress(0);
      
      // Call API to generate files
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          results,
          siteName: formData?.website?.siteName || 'Website'
          // siteDescription removed as it's no longer needed
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate file: ${response.statusText}`);
      }

      const data = await response.json();
      setGeneratedFiles({
        markdown: data.markdown,
        json: data.json
      });
      
      setCurrentStep("complete");
      setProgress(100);
    } catch (error) {
      console.error("Error generating files:", error);
      setError(error instanceof Error ? error.message : "Failed to generate files");
      setCurrentStep("error");
    }
  };

  const handleRecrawlUrl = async (url: string) => {
    try {
      // Find the original attempt to get the full URL
      const originalAttempt = crawlReport.attempts.find(attempt => attempt.url === url);
      
      if (!originalAttempt) {
        throw new Error(`Could not find original attempt for URL: ${url}`);
      }
      
      // Set the UI state to show we're crawling
      setProcessingMessage(`Recrawling ${url}...`);
      setIsProcessing(true);
      setCurrentlyCrawling(url);
      
      // Update the crawl report - only mark as loading instead of removing
        setCrawlReport(prev => {
        const updatedAttempts = prev.attempts.map(attempt => 
          attempt.url === url ? 
            { ...attempt, status: 'loading' as const } : 
            attempt
        );
          
          return {
            ...prev,
          attempts: updatedAttempts
          };
        });
        
      // Remove the URL from results if it exists
      setResults(prevResults => prevResults.filter(result => result.url !== url));
        
      // Make sure we pass the full URL (not just "unknown") to the crawl function
      // If the original URL had issues, log a warning but proceed with the retry
      if (!url || url === "unknown") {
        console.warn("Invalid URL detected, cannot recrawl:", url);
        throw new Error("Invalid URL format. Please use a valid URL with http:// or https:// prefix.");
      }
      
      console.log(`Retrying crawl for specific URL: ${url}`);
      const singleResult = await crawlWebsite(url);
      
      // Update the UI to show we're done
      setCurrentlyCrawling(null);
      setIsProcessing(false);
      setProcessingMessage("Recrawl complete");
      
      toast.success(`Recrawled ${url} successfully`);
    } catch (error) {
      console.error(`Error recrawling ${url}:`, error);
      
      // Restore the original attempt in the crawl report since the recrawl failed
      setCrawlReport(prev => {
        const updatedAttempts = prev.attempts.map(attempt => 
          attempt.url === url ? 
            { ...attempt, status: 'error' as const, error: `Failed to recrawl: ${error instanceof Error ? error.message : 'Unknown error'}` } : 
            attempt
        );
          
        return {
          ...prev,
          attempts: updatedAttempts
        };
      });
      
      setCurrentlyCrawling(null);
      setIsProcessing(false);
      toast.error(`Failed to recrawl ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Add the onSubmit function
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    console.log("Form submitted:", values);
    
    // Reset state for new crawl
    setFormData(values);
    setCurrentStep("crawling");
    setError(null);
    setProgress(0);
    setProcessedUrls(0);
    setCurrentlyCrawling(values.website.url);
    setUrlProgressMap({});
    setGeneratedFiles(null);
    setProcessingMessage("Starting crawl...");
    setResults([]);
    setCompletedUrls([]);
    setRemovedUrls(new Map());
    setIsProcessing(true);

    // Initialize the main crawl report state
    setCrawlReport({
      startTime: new Date().toISOString(),
      endTime: undefined,
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      attempts: []
    });

    try {
      // Start the crawl
      console.log(`Starting crawl for ${values.website.url}`);
      const results = await crawlWebsite(values.website.url);
      
      // Log the results we got back
      console.log(`Crawl completed with ${results.length} results`);
      
      // We have results, set them and transition to review step
      if (results && Array.isArray(results) && results.length > 0) {
        setResults(results);
        setCurrentStep("reviewing");
        setProgress(100);
        
        // Automatically switch to review tab
        setActiveTab("review");
      } else {
        // No results but check crawl report for successful attempts
        const successfulAttempts = crawlReport.attempts.filter(a => a.status === 'success');
        
        if (successfulAttempts.length > 0) {
          // Create placeholder results from successful attempts
          const placeholderResults = successfulAttempts.map(attempt => ({
            url: attempt.url,
            title: `Page: ${attempt.url.split('/').pop() || 'Home'}`,
            links: [],
            metaData: {
              description: "Successfully crawled page."
            }
          }));
          
          console.log(`Created ${placeholderResults.length} placeholder results from successful attempts`);
          
          // Update the results state with placeholders
          setResults(placeholderResults);
          setCurrentStep("reviewing");
          setProgress(100);
          
          // Automatically switch to review tab
          setActiveTab("review");
        } else {
          // No successful crawls, show user-friendly error
          const friendlyError = getUserFriendlyErrorMessage("Crawling completed, but no pages could be successfully processed.");
          setError(`${friendlyError.message} ${friendlyError.details}`);
          setCurrentStep("error");
        }
      }
    } catch (error) {
      console.error("Error during crawling:", error);
      // Use the new function to get a user-friendly error message
      const friendlyError = getUserFriendlyErrorMessage(error instanceof Error ? error : String(error));
      setError(`${friendlyError.message} ${friendlyError.details}`);
      setCurrentStep("error");
    } finally {
      // Always reset the processing state
      setCurrentlyCrawling(null);
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    // Update local storage when crawlReport changes, if it has data
    if (crawlReport.startTime) {
      localStorage.setItem('crawlReport', JSON.stringify(crawlReport));
    }
  }, [crawlReport]);

  // Function to clear local storage of cached report, results, and batch jobs
  const clearStoredState = () => {
    localStorage.removeItem('crawlerState');
    localStorage.removeItem('savedWebsites');
  };

  // Function to handle the "Resume" button click
  const handleResume = () => {
    // Get the cached data
    const cachedCrawlReport = localStorage.getItem('crawlReport');
    const cachedResults = localStorage.getItem('crawlResults');
    
    if (cachedCrawlReport && cachedResults) {
      try {
        // Parse the cached data
        const parsedReport = JSON.parse(cachedCrawlReport);
        const parsedResults = JSON.parse(cachedResults);
        
        // Update the state with the cached data
        setCrawlReport(parsedReport);
        setResults(parsedResults);
        
        // Set the current step to 'reviewing' to show the results
        setCurrentStep('reviewing');
        
        // Show a notification for the successful resume
        showNotification('success', 'Successfully resumed from the previous session.');
    } catch (error) {
        console.error('Failed to parse cached data:', error);
        showNotification('error', 'Failed to resume from previous session.');
      }
    } else {
      showNotification('error', 'No previous session found to resume.');
    }
  };

  return (
    <div className="space-y-6">
      {testModeContainer && createPortal(
        <TestModeToggle 
          isTestMode={isTestMode} 
          setIsTestMode={setIsTestMode} 
        />,
        testModeContainer
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-6">
          <div>
            <h2 className="text-lg font-medium">Website to Crawl</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Enter a website URL for AI-powered llms.txt generation
            </p>
          </div>
          <WebsiteInputContainer
            website={website}
            onUpdateWebsite={setWebsite}
            onSaveWebsite={handleSaveWebsite}
            onCrawlWebsite={handleDirectCrawl}
            disabled={isProcessing}
          />
        </div>
          
        <div className="rounded-lg border bg-card p-6">
          <div>
            <h2 className="text-lg font-medium">Saved Websites</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Quick access to your saved websites
            </p>
          </div>
          <SavedWebsitesList
            websites={savedWebsites}
            onWebsiteSelect={handleWebsiteSelect}
            onWebsiteDelete={handleWebsiteDelete}
            key={`saved-websites-${savedWebsites.length}`}
          />
        </div>
      </div>
          
      {/* Combined tabbed interface for Crawl Queue, Status and URL Review */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">llms.txt Generation Workflow</h2>
          {/* Show buttons during processing, reviewing, or completion */} 
          {(isProcessing || currentStep === 'reviewing' || currentStep === 'complete') && (
            <div className="flex items-center space-x-2">
              {/* Show Start Over during processing, reviewing, or completion */} 
              <Button 
                variant="outline"
                onClick={handleStartOver}
                className="h-10 px-4 shadow-sm hover:bg-gray-800 "
              >
                Start Over
              </Button>
            </div>
          )}
        </div>

        <Tabs 
          value={activeTab} 
          onValueChange={setActiveTab}
          ref={tabsRef} 
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger 
              value="review"
              disabled={currentStep !== 'reviewing' && !crawlReport.endTime}
            >
              1. Review
            </TabsTrigger>
            <TabsTrigger 
              value="files"
              disabled={!generatedFiles}
            >
              2. Download
            </TabsTrigger>
          </TabsList>
          
          {/* Show crawling progress outside tabs when crawling is in progress */}
          {currentStep === 'crawling' && (
            <div className="pt-4 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-md font-medium">Crawling in Progress</h3>
              <p className="text-sm text-muted-foreground">
                    Crawling website: {formData?.website?.siteName || 'Website'}
                  </p>
                </div>
                <Button 
                  onClick={handleCancelCrawl}
                  variant="destructive"
                  className="h-10 px-4 shadow-sm"
                  type="button"
                >
                  Cancel
                </Button>
              </div>
              
              {/* Progress Display */}
              <div className="space-y-4 p-4 border rounded-lg ">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex flex-col p-3 rounded border">
                    <span className="text-muted-foreground">Pages Attempted</span>
                    <span className="text-xl font-medium">{crawlReport.totalAttempts || 0}</span>
                  </div>
                  <div className="flex flex-col p-3 rounded border">
                    <span className="text-muted-foreground">Successful</span>
                    <span className="text-xl font-medium text-green-600">{crawlReport.successfulAttempts || 0}</span>
                  </div>
                </div>
                
                {/* Current Processing URL */}
                {currentlyCrawling && (
                  <div className="p-3 rounded border">
                    <div className="flex items-center">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Currently Processing:</p>
                        <div className="flex items-center space-x-2">
                          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></div>
                          <p className="text-sm font-medium truncate">{currentlyCrawling}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Processing Message - Only show if not redundant with currentlyCrawling */}
                {processingMessage && !processingMessage.startsWith('Processing:') && (
                  <p className="text-sm text-muted-foreground italic">{processingMessage}</p>
                )}
              </div>
              
              {/* Recent Attempts */}
              {crawlReport.attempts.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Recent Pages</h4>
                  <div className="max-h-[300px] overflow-y-auto space-y-2">
                    {crawlReport.attempts.slice().reverse().map((attempt, i) => (
                      <div 
                        key={i} 
                        className={`flex items-center justify-between p-2 text-sm rounded border ${
                          attempt.status === 'success' ? 'text-green-600 border-green-100' : 
                          attempt.status === 'error' ? 'text-red-600 border-red-100' : 
                          'text-blue-600 border-gray-100'
                        }`}
                      >
                        <div className="truncate flex-1 pr-2">
                          <span className="block truncate">{attempt.url}</span>
                        </div>
                        <div className="flex items-center">
                          {attempt.status === 'success' ? (
                            <span className="flex items-center text-green-600 text-xs">
                              <CheckCircledIcon className="h-3 w-3 mr-1" />
                              Success
                            </span>
                          ) : attempt.status === 'error' ? (
                            <span className="flex items-center text-red-600 text-xs">
                              <CrossCircledIcon className="h-3 w-3 mr-1" />
                              Failed
                            </span>
                          ) : (
                            <span className="flex items-center text-blue-600 text-xs">
                              <UpdateIcon className="h-3 w-3 mr-1 animate-spin" />
                              Processing
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              </div>
            )}

          {/* Show placeholder message if not crawling and no websites */}
          {currentStep !== 'crawling' && savedWebsites.length === 0 && currentStep !== 'reviewing' && !crawlReport.endTime && (
            <div className="pt-4">
              <p className="text-sm text-muted-foreground text-center py-8">
                No websites in queue. Add a website to get started.
              </p>
              </div>
            )}

          <TabsContent value="review" className="pt-4">
            {currentStep === 'reviewing' || (crawlReport.endTime && results.length > 0) ? (
              <>
                <div className="flex items-center justify-between mb-6">
            <div>
                    <h3 className="text-md font-medium">Review Crawled URLs</h3>
                    <p className="text-sm text-muted-foreground">
                      Review the crawled URLs and remove any you don't want to include in the final output.
                    </p>
                            </div>
                  <Button 
                    onClick={handleProceedToGeneration}
                    disabled={currentStep === "complete"}
                    className={`h-10 px-6 shadow-sm ${
                      currentStep === "complete" 
                        ? "bg-blue-400 cursor-not-allowed" 
                        : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  >
                    {currentStep === "complete" ? "Already Generated" : "Proceed to Generation"}
                                  </Button>
                               </div>

                {/* Wrap UrlReviewList in a scrollable container with border/background */}
                <div className="max-h-[600px] overflow-y-auto pr-2 space-y-4 border rounded-md p-4 shadow-inner">
                  <UrlReviewList 
                    attempts={crawlReport.attempts}
                    onRemoveUrl={handleRemoveUrl}
                    onReaddUrl={handleReaddUrl}
                    onRecrawlUrl={handleRecrawlUrl}
                    removedUrls={removedUrls}
                    crawlStartTime={crawlReport.startTime}
                    crawlEndTime={crawlReport.endTime}
                  />
                </div>
              </>
            ) : (
              <div className="p-6 text-center">
                <p className="text-muted-foreground">Complete a crawl to review URLs.</p>
            </div>
          )}
          </TabsContent>
          
          <TabsContent value="files" className="pt-4">
            {currentStep === 'generating' ? (
              <div className="p-6 text-center space-y-4">
                <div className="inline-block mx-auto">
                  <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  </div>
                <p className="text-blue-600 font-medium">Generating your llms.txt file...</p>
                <p className="text-muted-foreground">This may take a few moments.</p>
                <div className="max-w-md mx-auto h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${progress}%` }}></div>
            </div>
                    </div>
            ) : generatedFiles ? (
              <>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-md font-medium">Generated llms.txt</h3>
                      <p className="text-sm text-muted-foreground">
                      Your generated llms.txt file is ready for download.
                      </p>
                    </div>
                  <Button 
                    onClick={handleDownload} 
                    className="bg-green-600 hover:bg-green-700 h-10 px-6 shadow-sm flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download llms.txt
                  </Button>
              </div>

              <div className="space-y-4">
                  <div className="max-h-[500px] overflow-y-auto p-4 rounded  text-sm font-mono whitespace-pre-wrap border">
                    {generatedFiles.markdown}
                </div>
              </div>
              </>
            ) : (
              <div className="p-6 text-center">
                <p className="text-muted-foreground">
                  Complete the crawling and reviewing process to generate your llms.txt file.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
              </div>

      {/* Show error state if something went wrong */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <div className="flex items-center text-red-700 mb-2">
            <ExclamationTriangleIcon className="h-5 w-5 mr-2" />
            <h2 className="text-lg font-medium">Error</h2>
            </div>
          <p className="text-sm text-red-600 mb-2">{error}</p>
          <div className="mt-3 flex justify-end">
            <Button
              onClick={handleStartOver}
              variant="outline" 
              size="sm"
              className="text-sm"
            >
              Try Another Website
            </Button>
          </div>
        </div>
      )}
    </div>
  );
} 