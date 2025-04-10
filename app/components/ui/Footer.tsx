export default function Footer() {
  return (
    <footer className="border-t border-gray-200 py-4">
      <div className="container max-w-6xl mx-auto px-4 flex items-center justify-between">
        <div className="flex items-center text-xs text-gray-500">
          <span>© 2025</span>
          <span className="mx-1.5">•</span>
          <span>AI-Powered llms.txt Generator</span>
          <span className="mx-1.5">•</span>
          <span>MIT License</span>
        </div>
        
        <div className="flex items-center text-xs text-gray-500">
          <span>Built with positive vibes by</span>
          <a 
            href="https://x.com/rdyplayerB" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-blue-500 hover:text-blue-600 mx-1.5"
          >
            @rdyplayerB
          </a>
          <span>🤙</span>
        </div>
      </div>
    </footer>
  );
} 