"use client";

import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";
import { Checkbox } from "../../components/ui/checkbox";
import { Label } from "../../components/ui/label";

interface TestModeToggleProps {
  isTestMode: boolean;
  setIsTestMode: (value: boolean) => void;
}

export function TestModeToggle({ isTestMode, setIsTestMode }: TestModeToggleProps) {
  return (
    <div className="flex items-center justify-end space-x-2">
      <div className="flex items-center space-x-2">
        <Checkbox 
          id="test-mode" 
          checked={isTestMode}
          onCheckedChange={(checked) => setIsTestMode(checked === true)}
        />
        <Label 
          htmlFor="test-mode" 
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Test Mode
        </Label>
      </div>
      
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <InfoIcon className="h-4 w-4 text-slate-500" />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Test Mode: Limits crawling to 100 URLs per website for testing purposes</p>
            <p>When unchecked (Full Mode): No crawl limit - crawls entire websites</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
} 