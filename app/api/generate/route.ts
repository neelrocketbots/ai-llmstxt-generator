import { NextResponse } from "next/server";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

// Define interface for the CrawlResult that matches what's actually coming from the CrawlerForm
interface CrawlResult {
  url: string;
  title: string;
  metaData: {
    description?: string;
    keywords?: string[];
    links?: string[];
  };
  links?: string[];
}

// Define interface for request from CrawlerForm
interface CrawlerFormRequest {
  results: CrawlResult[];
  siteName: string;
  siteDescription?: string; // Make description optional
}

interface GenerationRequest {
  model: string;
  input: ChatCompletionMessageParam[];
  metadata: {
    url: string;
    title: string;
    existingDescription: string;
  };
}

interface GenerationResponse {
  output_text: string;
  metadata: {
    url: string;
    title: string;
    existingDescription: string;
  };
}

interface CompletedResponse {
  responses: GenerationResponse[];
  meta: {
    total: number;
    processed: number;
    status: 'completed';
  };
  markdown: string; // Add markdown field for response
  results: any[]; // Add results field for response
}

interface RequestBody {
  requests: GenerationRequest[];
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to generate a custom instruction based on the website content and purpose
async function generateCustomInstruction(
  siteName: string,
  siteDescription: string | undefined,
  results: CrawlResult[],
  descriptions: Record<string, string>
): Promise<string> {
  try {
    // Prepare example descriptions from the crawled URLs
    const exampleDescriptions = Object.entries(descriptions)
      .slice(0, 5) // Only use a few examples to avoid token limits
      .map(([url, desc]) => `${url} - ${desc}`)
      .join('\n');
    
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: "You are an assistant that creates helpful instructions for AI models on how to use documentation information. Write in a concise, helpful style."
      },
      {
        role: "user",
        content: `Generate a one or two sentence instruction for AI models on how to use the content in an llms.txt file for the following website:
        
Site Name: ${siteName}
Site Description: ${siteDescription || "Not provided"}
Number of URLs: ${results.length}
Example content:
${exampleDescriptions}

The instruction should explain what this site is for and how the AI should use the documentation. 
Don't use phrases like "the following URLs" or "the following documentation". 
Focus on the specific purpose and content of this site.
Be concise but informative.
`
      }
    ];

    console.log(`[OpenAI] Generating custom instruction for ${siteName}`);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 1500,
      temperature: 0.7,
    });

    const customInstruction = response.choices[0]?.message?.content?.trim() || 
      "Use the following documentation to understand the available capabilities and content.";
    
    console.log(`[OpenAI] Generated custom instruction: ${customInstruction}`);
    
    return customInstruction;
  } catch (error) {
    console.error("Error generating custom instruction:", error);
    // Fallback to default instruction in case of error
    return "Use the following documentation to understand the available capabilities and content.";
  }
}

// Function to generate markdown from results and descriptions
function generateMarkdown(
  siteName: string, 
  siteDescription: string | undefined, 
  results: CrawlResult[], 
  descriptions: Record<string, string>,
  customInstruction: string
): string {
  let markdown = `# LLM documentation for ${siteName}\n\n`;
  if (siteDescription) {
    markdown += `${siteDescription}\n\n`;
  }
  markdown += `${customInstruction}\n\n`;
  
  // Group results by domain
  const domainGroups: Record<string, CrawlResult[]> = {};
  
  results.forEach(result => {
    try {
      const url = new URL(result.url);
      const domain = url.hostname;
      
      if (!domainGroups[domain]) {
        domainGroups[domain] = [];
      }
      
      domainGroups[domain].push(result);
    } catch (error) {
      console.error(`Invalid URL ${result.url}:`, error);
    }
  });
  
  // Generate markdown for each domain
  Object.entries(domainGroups).forEach(([domain, domainResults]) => {
    markdown += `## ${domain}\n\n`;
    
    domainResults.forEach(result => {
      const description = descriptions[result.url] || result.metaData?.description || "No description available";
      markdown += `- [${result.title || result.url}](${result.url}) — ${description}\n`;
    });
    
    markdown += '\n';
  });
  
  return markdown;
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    // First try to parse as CrawlerFormRequest
    const body = await req.json();
    
    // Check if it's the CrawlerForm format (check for results and siteName, ignore mode)
    if (body.results && Array.isArray(body.results) && body.siteName) {
      const { results, siteName, siteDescription } = body as CrawlerFormRequest; // Removed mode extraction
      
      // Validate input
      if (!results || !Array.isArray(results)) {
        return NextResponse.json(
          { error: "Invalid input: results must be an array" },
          { status: 400 }
        );
      }
      
      // Check if we have an API key
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json(
          { error: "OpenAI API key not configured" },
          { status: 500 }
        );
      }

      // Proceed directly with real-time processing
      const descriptions: Record<string, string> = {};
      
      // Create an array of promises for parallel execution
      const descriptionPromises = results.map(result => {
        const contentText = result.metaData?.description || '';
        const messages: ChatCompletionMessageParam[] = [
          {
            role: "system",
            content: "You are a helpful assistant that creates concise, informative descriptions of webpages for an llms.txt file. Keep descriptions factual, under 100 characters, and focus on the main purpose of the page."
          },
          {
            role: "user",
            content: `Generate a short description for this webpage: 
Title: ${result.title || 'Untitled'}
URL: ${result.url}
Content: ${contentText.substring(0, 1000) || 'No content available'}`
          }
        ];

        console.log(`[OpenAI] Requesting description for: ${result.url}`);
        const userPromptContent = messages[1]?.content;
        const promptLog = typeof userPromptContent === 'string' 
          ? `${userPromptContent.substring(0, 100)}...` 
          : '[Prompt content is not a simple string]';
        console.log(`[OpenAI] Prompt: ${promptLog}`);

        // Return the promise, attaching the original result for error handling/mapping
        return openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          max_tokens: 100,
          temperature: 0.7,
        }).then(response => ({
          status: 'fulfilled' as const,
          url: result.url,
          response: response,
          originalDescription: result.metaData?.description // Carry original description
        })).catch(error => ({
          status: 'rejected' as const,
          url: result.url,
          reason: error,
          originalDescription: result.metaData?.description // Carry original description
        }));
      });

      // Wait for all promises to settle
      const settledResults = await Promise.allSettled(descriptionPromises);

      // Process settled results
      settledResults.forEach(settledResult => {
        // Check if the promise itself resolved (it might contain a fulfilled or rejected status from our .then/.catch)
        if (settledResult.status === 'fulfilled') {
          const apiResult = settledResult.value;
          if (apiResult.status === 'fulfilled') {
            // OpenAI call succeeded
            const generatedDescription = apiResult.response.choices[0]?.message?.content?.trim() || "No description available";
            console.log(`[OpenAI] Response received for: ${apiResult.url}`);
            console.log(`[OpenAI] ID: ${apiResult.response.id}`);
            console.log(`[OpenAI] Model: ${apiResult.response.model}`);
            console.log(`[OpenAI] Usage: ${JSON.stringify(apiResult.response.usage)}`);
            console.log(`[OpenAI] Generated Description: ${generatedDescription}`);
            descriptions[apiResult.url] = generatedDescription;
          } else {
            // OpenAI call failed (caught in our .catch)
            console.error(`Error generating description for ${apiResult.url}:`, apiResult.reason);
            descriptions[apiResult.url] = apiResult.originalDescription || "Failed to generate description";
          }
        } else {
          // Promise itself rejected (less likely with the .then/.catch structure, but handle defensively)
          console.error(`Unexpected error processing promise:`, settledResult.reason);
          // We don't have the URL readily available here unless we restructure how promises are mapped
        }
      });
      
      // Generate custom instruction
      const customInstruction = await generateCustomInstruction(siteName, siteDescription, results, descriptions);
      
      // Generate markdown
      const markdown = generateMarkdown(siteName, siteDescription, results, descriptions, customInstruction);
      
      return NextResponse.json({ 
        responses: Object.entries(descriptions).map(([url, text]) => ({
          output_text: text,
          metadata: {
            url,
            title: results.find(r => r.url === url)?.title || 'Untitled',
            existingDescription: results.find(r => r.url === url)?.metaData?.description || ''
          }
        })),
        meta: {
          total: results.length,
          processed: Object.keys(descriptions).length,
          status: 'completed'
        },
        markdown,
        results
      });
    }
    
    // Legacy API format support - kept for backward compatibility
    const { requests } = body as RequestBody;
    
    // Validate input
    if (!requests || !Array.isArray(requests)) {
      return NextResponse.json(
        { error: "Invalid input: requests must be an array" },
        { status: 400 }
      );
    }
    
    // Check if we have an API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    // Proceed directly with real-time processing for the original format
    const batchSize = 5; // Number of parallel OpenAI API requests (for rate limiting, not related to batch processing feature)
    const responses: GenerationResponse[] = [];
    
    // Process requests in batches
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (request: GenerationRequest) => {
          try {
            // Generate description using OpenAI
            const response = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: request.input,
              max_tokens: 150,
              temperature: 0.7,
            });
            
            const description = response.choices[0]?.message?.content?.trim() || "";
            
            return {
              output_text: description,
              metadata: request.metadata
            };
          } catch (error) {
            console.error(`Error generating description for ${request.metadata.url}:`, error);
            // Return existing description or error message
            return {
              output_text: request.metadata.existingDescription || "Failed to generate description",
              metadata: request.metadata
            };
          }
        })
      );
      
      responses.push(...batchResults);
    }
    
    return NextResponse.json({ 
      responses,
      meta: {
        total: requests.length,
        processed: responses.length,
        status: 'completed'
      },
      markdown: '', // Add empty markdown 
      results: [] // Add empty results array
    });
  } catch (error) {
    console.error("Error in API route:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
} 