import { CrawlAttempt, CrawlReport } from '../lib/types';

export const CrawlReportView = ({ report }: { report: CrawlReport }) => {
  const duration = report.endTime 
    ? Math.round((new Date(report.endTime).getTime() - new Date(report.startTime).getTime()) / 1000)
    : 0;
    
  // Process the attempts to get stats only
  const attemptsByUrl = new Map<string, CrawlAttempt>();
  
  report.attempts.forEach(attempt => {
    if (!attempt.url) return;
    
    // Normalize URL to handle trailing slashes consistently
    const normalizedUrl = attempt.url.endsWith('/') && attempt.url !== "https://burner.pro/" 
      ? attempt.url.slice(0, -1) 
      : attempt.url;
    
    if (!attemptsByUrl.has(normalizedUrl) || 
        new Date(attemptsByUrl.get(normalizedUrl)!.timestamp) < new Date(attempt.timestamp)) {
      attemptsByUrl.set(normalizedUrl, attempt);
    }
  });
  
  const uniqueAttempts = Array.from(attemptsByUrl.values());
  
  // Count stats
  const finalSuccessfulCount = uniqueAttempts.filter(a => a.status === 'success').length;
  const finalAttemptCount = uniqueAttempts.length;
  const finalSuccessPercentage = finalAttemptCount > 0 
      ? Math.round((finalSuccessfulCount / finalAttemptCount) * 100)
      : 0;
  
  return (
    <div className="mt-4 border border-gray-200 rounded-lg p-4 ">
      <h4 className="font-medium mb-2">Crawl Report Summary</h4>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Start Time:</span>
          <span>{new Date(report.startTime).toLocaleTimeString()}</span>
        </div>
        {report.endTime && (
          <>
            <div className="flex justify-between text-gray-600">
              <span>End Time:</span>
              <span>{new Date(report.endTime).toLocaleTimeString()}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Total Duration:</span>
              <span>{duration}s</span>
            </div>
          </>
        )}
        <div className="flex justify-between font-medium">
          <span>Final Success Rate:</span>
          <span className={finalSuccessfulCount === finalAttemptCount ? 'text-green-600' : 'text-yellow-600'}>
            {finalSuccessfulCount}/{finalAttemptCount} ({finalSuccessPercentage}%)
          </span>
        </div>

        {/* URL summary section removed, as it's redundant with the review screen */}
        <div className="text-xs text-gray-500 text-center mt-3">
          {finalSuccessfulCount} URLs successfully crawled. Click "Proceed to Review" to see details.
        </div>
      </div>
    </div>
  );
}; 