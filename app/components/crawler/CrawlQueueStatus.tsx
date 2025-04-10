'use client';

import { Button } from '../../components/ui/button';
import { Pencil1Icon, TrashIcon, CheckCircledIcon, UpdateIcon, CrossCircledIcon, InfoCircledIcon } from '@radix-ui/react-icons';
import { WebsiteInput, UrlProgress } from '../../lib/types';
import { normalizeUrl } from '../../lib/utils';

interface CrawlProgressProps {
  progress: UrlProgress;
}

const CrawlProgress = ({ progress }: CrawlProgressProps) => {
  if (!progress.metaData || !progress.metaData.currentUrl) {
    return <div className="mt-2 text-sm text-gray-500">Initializing...</div>;
  }

  const { currentUrl, status, attempted, successful, total } = progress.metaData;
  const progressValue = typeof progress.progress === 'number' ? progress.progress : 0;
  const successRate = attempted ? Math.round((successful / attempted) * 100) : 0;

  return (
    <div className="mt-2 space-y-3">
      {/* Main Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <div className="font-medium">Overall Progress</div>
          <div className="text-gray-500">{progressValue}%</div>
        </div>
        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ease-in-out ${
              status === 'error' ? 'bg-red-500' :
              status === 'success' ? 'bg-green-500' :
              'bg-blue-500'
            }`}
            style={{ width: `${progressValue}%` }}
          />
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <div>
          <span className="font-medium">{successful}</span> of <span className="font-medium">{total}</span> pages processed
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

interface CrawlQueueStatusProps {
  websites: WebsiteInput[];
  onRemoveWebsite: (index: number) => void;
  isProcessing: boolean;
  onStartCrawl: () => void;
  currentlyCrawling: string | null;
  urlProgressMap: Record<string, UrlProgress>;
}

export function CrawlQueueStatus({
  websites,
  onRemoveWebsite,
  isProcessing,
  onStartCrawl,
  currentlyCrawling,
  urlProgressMap
}: CrawlQueueStatusProps) {
  return (
    <div className="space-y-4">
      {websites.map((website, index) => {
        const normalizedUrl = normalizeUrl(website.url);
        const progressData = urlProgressMap[normalizedUrl];
        let statusDisplay: React.ReactNode = null;

        if (isProcessing) {
          if (normalizedUrl === currentlyCrawling) {
            statusDisplay = (
              <span className="text-xs text-blue-600 flex items-center">
                <UpdateIcon className="h-3 w-3 mr-1 animate-spin" />
                Crawling...
              </span>
            );
          } else if (progressData?.status === 'success') {
            statusDisplay = (
              <span className="text-xs text-green-600 flex items-center">
                <CheckCircledIcon className="h-3 w-3 mr-1" />
                Completed
              </span>
            );
          } else if (progressData?.status === 'error') {
             statusDisplay = (
              <span className="text-xs text-red-600 flex items-center">
                <CrossCircledIcon className="h-3 w-3 mr-1" />
                Failed
              </span>
            );
          } else {
            statusDisplay = (
              <span className="text-xs text-gray-500 flex items-center">
                 <InfoCircledIcon className="h-3 w-3 mr-1" />
                Pending
              </span>
            );
          }
        }

        return (
          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex-1 min-w-0 mr-4">
              <p className="text-sm font-medium text-gray-900 truncate">
                {website.siteName}
              </p>
              <p className="text-xs text-gray-500 truncate">{normalizedUrl}</p>
            </div>
            {isProcessing ? (
              <div className="w-24 text-right">
                {statusDisplay}
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRemoveWebsite(index)}
                className="ml-2 h-8 px-3 text-xs flex items-center gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              >
                <TrashIcon className="h-3 w-3" />
                Remove
              </Button>
            )}
          </div>
        );
      })}

      {websites.length > 0 && !isProcessing && (
        <Button 
          onClick={onStartCrawl}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10 shadow-sm flex items-center justify-center gap-2"
          disabled={isProcessing}
        >
          <CheckCircledIcon className="h-4 w-4" />
          Crawl Now
        </Button>
      )}
    </div>
  );
} 