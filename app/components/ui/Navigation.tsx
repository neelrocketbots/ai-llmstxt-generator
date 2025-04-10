"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-200 py-4">
      <div className="container max-w-6xl mx-auto px-4">
        {/* Main Navigation Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="text-xl font-semibold">
              AI-Powered llms.txt Generator
            </Link>
          </div>
          
          <div className="flex items-center space-x-6">
            <Link 
              href="/setup" 
              className={pathname === "/setup" 
                ? "text-gray-900 font-medium" 
                : "text-gray-600 hover:text-gray-900"
              }
            >
              Setup
            </Link>
            <Link 
              href="https://github.com/rdyplayerB/ai-llmstxt-generator" 
              className="text-gray-600 hover:text-gray-900"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </Link>
          </div>
        </div>
        
        {/* Subtitle Row */}
        <div className="mt-1.5">
          <p className="text-xs text-gray-500 max-w-lg">
            Open-source tool that crawls your website and creates optimized llms.txt files for Large Language Models (LLMs) to better understand and interact with your content structure.
          </p>
        </div>
      </div>
    </nav>
  );
} 