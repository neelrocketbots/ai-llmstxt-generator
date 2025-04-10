'use client';

import React, { useState, useEffect } from 'react';
import { WebsiteInput } from '../../../lib/types';
import { WebsiteInputFields } from './WebsiteInputFields';
import { Button } from '../../../components/ui/button';
import { BookmarkIcon, PlayIcon } from '@radix-ui/react-icons';
import { isValidUrl, normalizeUrl } from '../../../lib/utils';
import { toast } from 'sonner';

interface WebsiteInputContainerProps {
  website: WebsiteInput;
  onUpdateWebsite: (website: WebsiteInput) => void;
  onSaveWebsite: (website: WebsiteInput) => void;
  onCrawlWebsite: (website: WebsiteInput) => void;
  disabled?: boolean;
}

const DEFAULT_WEBSITE: WebsiteInput = {
  siteName: '',
  url: '',
  description: ''
};

export function WebsiteInputContainer({
  website,
  onUpdateWebsite,
  onSaveWebsite,
  onCrawlWebsite,
  disabled = false
}: WebsiteInputContainerProps) {
  const [tempWebsite, setTempWebsite] = useState<WebsiteInput>(website);
  const [saveToList, setSaveToList] = useState(false);
  const [urlError, setUrlError] = useState<string | undefined>();

  useEffect(() => {
    setTempWebsite(website);
  }, [website]);

  const handleWebsiteChange = (field: keyof WebsiteInput, value: string) => {
    if (field === 'url') {
      setUrlError(undefined);
    }
    
    setTempWebsite(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validateInput = (): boolean => {
    if (!tempWebsite.url.trim()) {
      setUrlError('URL is required');
      return false;
    }
    
    if (!isValidUrl(tempWebsite.url)) {
      setUrlError('Please enter a valid URL with a proper domain name (e.g., example.com)');
      return false;
    }
    
    if (!tempWebsite.siteName.trim()) {
      const url = new URL(tempWebsite.url.startsWith('http') ? tempWebsite.url : `https://${tempWebsite.url}`);
      const hostname = url.hostname.replace('www.', '');
      const siteName = hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1);
      
      setTempWebsite(prev => ({
        ...prev,
        siteName
      }));
    }
    
    return true;
  };

  const handleSave = () => {
    if (!validateInput()) return;
    
    onSaveWebsite(tempWebsite);
  };

  const handleCrawl = () => {
    if (!validateInput()) return;
    
    if (saveToList) {
      onSaveWebsite(tempWebsite);
    }
    
    onCrawlWebsite(tempWebsite);
  };

  return (
    <div className="space-y-6">
      <WebsiteInputFields
        website={tempWebsite}
        onChange={handleWebsiteChange}
        urlError={urlError}
        disabled={disabled}
      />
      
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={handleSave}
          disabled={disabled || !tempWebsite.siteName || !tempWebsite.url || !onSaveWebsite}
          title="Save website for future use"
          className="flex items-center gap-2"
        >
          <BookmarkIcon className="h-4 w-4" />
          Save to List
        </Button>
        
        <Button
          variant="default"
          onClick={handleCrawl}
          disabled={disabled || !tempWebsite.siteName || !tempWebsite.url || !onCrawlWebsite}
          className="ml-2 flex-1 bg-green-600 hover:bg-green-700"
          title="Start crawling this website immediately"
        >
          Crawl Now
          <PlayIcon className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
} 