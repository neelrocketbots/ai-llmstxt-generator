import { useState, useCallback } from 'react';
import { UrlProgress } from '@/lib/types';
import { MAX_URLS_TO_PROCESS } from '@/lib/constants';

export function useCrawlProgress() {
  const [urlProgressMap, setUrlProgressMap] = useState<Record<string, UrlProgress>>({});
  const [processedUrls, setProcessedUrls] = useState<number>(0);
  const [totalUrlsToProcess, setTotalUrlsToProcess] = useState<number>(0);
  const [aiProcessedCount, setAiProcessedCount] = useState<number>(0);
  const [detailedStatusMessage, setDetailedStatusMessage] = useState<string>("");

  const handleProgressUpdate = useCallback((progressData: UrlProgress) => {
    console.log('[Client] Received Progress Update:', progressData);
    
    setUrlProgressMap(prevMap => {
      const url = progressData.metaData?.currentUrl;
      if (!url) return prevMap;

      const progress = typeof progressData.progress === 'number' ? progressData.progress : 0;
      
      const updatedProgress = {
        status: progressData.status || 'loading',
        progress: progress,
        metaData: {
          attempted: progressData.metaData?.attempted || 0,
          successful: progressData.metaData?.successful || 0,
          total: progressData.metaData?.total || MAX_URLS_TO_PROCESS,
          currentUrl: url,
          status: progressData.metaData?.status || 'loading',
          message: progressData.metaData?.message || 'Processing...'
        }
      };

      return {
        ...prevMap,
        [url]: updatedProgress
      };
    });

    if (progressData.metaData?.message) {
      setDetailedStatusMessage(progressData.metaData.message);
    }
  }, []);

  const resetProgress = useCallback(() => {
    setUrlProgressMap({});
    setProcessedUrls(0);
    setTotalUrlsToProcess(0);
    setAiProcessedCount(0);
    setDetailedStatusMessage("");
  }, []);

  return {
    urlProgressMap,
    processedUrls,
    totalUrlsToProcess,
    aiProcessedCount,
    detailedStatusMessage,
    handleProgressUpdate,
    resetProgress,
    setProcessedUrls,
    setTotalUrlsToProcess,
    setAiProcessedCount,
  };
} 