'use client';

import { Button } from '../../components/ui/button';
import { PlusIcon, TrashIcon } from '@radix-ui/react-icons';
import { WebsiteInput } from '../../lib/types';

interface SavedWebsitesListProps {
  websites: WebsiteInput[];
  onWebsiteSelect: (website: WebsiteInput) => void;
  onWebsiteDelete: (index: number) => void;
}

export function SavedWebsitesList({
  websites,
  onWebsiteSelect,
  onWebsiteDelete,
}: SavedWebsitesListProps) {
  if (websites.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No saved websites yet. Save a website for quick access later.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {websites.map((website, index) => (
        <div
          key={index}
          className="flex items-center justify-between p-3  rounded-lg border border-gray-200"
        >
          <div className="flex-1 min-w-0 mr-4">
            <p className="font-medium  truncate">
              {website.siteName}
            </p>
            <p className="text-sm text-gray-500 truncate">{website.url}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onWebsiteSelect(website)}
              className="h-8 w-8"
              title="Crawl this website now"
            >
              <PlusIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onWebsiteDelete(index)}
              className="h-8 w-8 text-red-500 hover:text-red-600"
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default SavedWebsitesList; 