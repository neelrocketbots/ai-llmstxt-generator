import Navigation from "../components/ui/Navigation";
import Footer from "../components/ui/Footer";

export default function SetupPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Navigation Bar */}
      <Navigation />

      {/* Main Content */}
      <section className="py-8">
        <div className="container max-w-4xl mx-auto px-4">
          <h1 className="text-3xl font-bold  mb-6">Setup Instructions</h1>
          
          <div className="bg-blue-50 rounded-lg border border-blue-200 p-8 mb-8">
            <h2 className="text-2xl font-bold  mb-4">API Setup Required</h2>
            <div className="text-gray-700">
              <p className="mb-4">
                This open-source tool requires your own OpenAI API key to function:
              </p>
              <ol className="list-decimal pl-6 space-y-4">
                <li className="text-base">Clone the repository to your local machine</li>
                <li className="text-base">Create a <code className="bg-blue-100 px-2 py-1 rounded">.env</code> file with <code className="bg-blue-100 px-2 py-1 rounded">OPENAI_API_KEY=your_api_key_here</code></li>
                <li className="text-base">Ensure you have <a href="https://platform.openai.com/account/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">sufficient API credits</a> in your OpenAI account</li>
                <li className="text-base">Run the application locally using <code className="bg-blue-100 px-2 py-1 rounded">npm run dev</code></li>
              </ol>
              <p className="mt-5 text-gray-600">
                Note: Your API key is never sent to any third-party servers and is used exclusively on your local machine for generating content descriptions.
              </p>
            </div>
          </div>

          <div className="shadow-sm rounded-lg border border-gray-200 p-6 mb-8">
            <h2 className="text-xl font-bold  mb-4">Detailed Setup Instructions</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">1. Clone the Repository</h3>
                <div className=" p-3 rounded-md font-mono text-sm">
                  git clone https://github.com/rdyplayerB/ai-llmstxt-generator.git<br />
                  cd ai-llmstxt-generator
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-2">2. Install Dependencies</h3>
                <div className=" p-3 rounded-md font-mono text-sm">
                  npm install
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-2">3. Create Environment File</h3>
                <p className="mb-2">Create a file named <code>.env.local</code> in the root directory with your OpenAI API key:</p>
                <div className=" p-3 rounded-md font-mono text-sm">
                  OPENAI_API_KEY=your_api_key_here
                </div>
                <p className="mt-2 text-sm text-gray-600">You can get your API key from the <a href="https://platform.openai.com/account/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">OpenAI platform</a>.</p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-2">4. Start the Development Server</h3>
                <div className=" p-3 rounded-md font-mono text-sm">
                  npm run dev
                </div>
                <p className="mt-2 text-sm text-gray-600">The application will be available at <code>http://localhost:3000</code>.</p>
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