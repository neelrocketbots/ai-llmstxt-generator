'use client';

import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { WebsiteInput } from '../../../lib/types';
import { normalizeUrl } from '../../../lib/utils';

interface WebsiteInputFieldsProps {
  website: WebsiteInput;
  onChange: (field: keyof WebsiteInput, value: string) => void;
  urlError?: string;
  disabled?: boolean;
}

export function WebsiteInputFields({
  website,
  onChange,
  urlError,
  disabled = false,
}: WebsiteInputFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="grid w-full items-center gap-1.5">
        <Label htmlFor="siteName">Site Name</Label>
        <Input
          type="text"
          id="siteName"
          value={website.siteName}
          onChange={(e) => onChange('siteName', e.target.value)}
          placeholder="Enter site name"
          disabled={disabled}
        />
      </div>

      <div className="grid w-full items-center gap-1.5">
        <Label htmlFor="url">URL</Label>
        <Input
          type="url"
          id="url"
          value={website.url}
          onChange={(e) => onChange('url', e.target.value)}
          onBlur={(e) => {
            if (e.target.value) {
              onChange('url', normalizeUrl(e.target.value));
            }
          }}
          placeholder="https://example.com"
          className={urlError ? 'border-red-500' : ''}
          disabled={disabled}
        />
        {urlError && (
          <p className="text-sm text-red-500">{urlError}</p>
        )}
      </div>
    </div>
  );
} 