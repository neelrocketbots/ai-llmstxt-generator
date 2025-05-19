import CrawlerForm from "./components/CrawlerForm";
import Navigation from "./components/ui/Navigation";
import Footer from "./components/ui/Footer";

export default function Home() {
  return (
    <main className="min-h-screen ">
      {/* Navigation Bar */}
      <Navigation />

      {/* Main Content */}
      <section className="py-4 pt-8">
        <div className="container max-w-6xl mx-auto px-4">
          <div className="shadow-sm rounded-lg border border-gray-200 p-6 mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Create Your AI-Optimized llms.txt File</h2>
              <div className="flex items-center gap-6">
                <div id="test-mode-container" className="min-w-[180px]"></div>
              </div>
            </div>
            <CrawlerForm />
          </div>

          <h2 className="text-xl font-semibold  mb-6 mt-8">
            About llms.txt
          </h2>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="shadow-sm rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <h3 className="text-base font-medium  mb-3">What is llms.txt?</h3>
              <div className="text-sm text-gray-600">
                <p className="mb-2">
                  The llms.txt file is a new open standard that helps AI models better understand and interact with your website's content. Similar to how robots.txt guides search engines, llms.txt provides a curated index of your most important pages. Visit <a href="https://llmstxthub.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline">llmstxthub.com</a> to learn more about the standard.
                </p>
                <p className="mb-1">It solves common AI crawling challenges by:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Creating a clear content hierarchy</li>
                  <li>Ensuring consistent discovery across subdomains</li>
                  <li>Providing structured signals for valuable content</li>
                  <li>Defining AI interaction preferences</li>
                </ul>
              </div>
            </div>

            <div className="shadow-sm rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <h3 className="text-base font-medium  mb-3">Benefits</h3>
              <ul className="list-disc pl-4 text-sm text-gray-600 space-y-1">
                <li>Predictable AI Discovery - Find and prioritize key content</li>
                <li>Structured Content Signals - Clear training indicators</li>
                <li>Enhanced Content Understanding - Better documentation comprehension</li>
                <li>Consistent AI Interactions - Reliable interpretation</li>
              </ul>
            </div>

            <div className="shadow-sm rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <h3 className="text-base font-medium  mb-3">How the Generator Works</h3>
              <ol className="list-decimal pl-4 text-sm text-gray-600 space-y-1">
                <li>Input your website URL</li>
                <li>The tool crawls your content</li>
                <li>Content structure is analyzed</li>
                <li>AI generates page descriptions</li>
                <li>AI creates an overall site description</li>
                <li>Download the generated llms.txt file</li>
                <li>Add to your website's root directory (like robots.txt)</li>
              </ol>
              <div className="mt-4 pt-3 border-t border-gray-100">
                <p className="text-sm text-gray-600 font-medium">Before you start:</p>
                <p className="text-sm text-gray-600">Add your OpenAI API key to the .env file to enable AI-powered content analysis. <a href="/setup" className="text-blue-600 hover:underline">View setup instructions</a>.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </main>
  );
} 