import axios from 'axios';
import { Analysis, Component, Party, RiskAssessment, Scenario } from '../store/negotiationSlice';
import { store } from '../store';

// OpenAI API configuration
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
// Access environment variables using Vite's approach
const OPENAI_API_KEY = (import.meta as any).env?.VITE_OPENAI_API_KEY || '';
const MODEL = 'gpt-4o'; // or 'gpt-3.5-turbo' for a more cost-effective option
const TEMPERATURE = 0;

// Rate limiting configuration
const RATE_LIMIT = {
  requests: 3,  // Number of requests allowed
  interval: 60000,  // Time window in milliseconds (1 minute)
  minDelay: 1000,  // Minimum delay between requests
};

// Request queue implementation
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private requestTimes: number[] = [];

  async add<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await this.executeWithRateLimit(request);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async executeWithRateLimit<T>(request: () => Promise<T>): Promise<T> {
    // Remove old request times
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter(time => now - time < RATE_LIMIT.interval);

    // If we've hit the rate limit, wait until we can make another request
    if (this.requestTimes.length >= RATE_LIMIT.requests) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = Math.max(
        RATE_LIMIT.interval - (now - oldestRequest),
        RATE_LIMIT.minDelay
      );
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Add current request time
    this.requestTimes.push(now);

    // Execute request
    return await request();
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (request) {
        await request();
        // Add minimum delay between requests
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT.minDelay));
      }
    }
    this.processing = false;
  }
}

// Create a single instance of the request queue
const requestQueue = new RequestQueue();

// Helper function to read prompt files
const readPromptFile = async (fileName: string): Promise<string> => {
  try {
    const response = await fetch(`/prompts/${fileName}`);
    if (!response.ok) {
      throw new Error(`Failed to load prompt file: ${fileName}`);
    }
    return await response.text();
  } catch (error) {
    console.error(`Error reading prompt file ${fileName}:`, error);
    throw new Error(`Failed to read prompt file: ${fileName}`);
  }
};

interface OpenAIError {
  response?: {
    status: number;
    data: any;
    headers: {
      'retry-after'?: string;
    };
  };
  message: string;
}

// Update the callOpenAI function to use the request queue
const callOpenAI = async (messages: any[], retryCount = 0, initialDelay = 1000): Promise<string | { rateLimited: true }> => {
  return requestQueue.add(async () => {
    const maxRetries = 3;
    
    try {
      if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API key is not set. Please check your .env file.');
      }

      const requestBody = {
        model: MODEL,
        messages,
        temperature: TEMPERATURE,
        max_tokens: 4000,
        response_format: { type: "json_object" }
      };

      console.log('OpenAI API request:', {
        model: requestBody.model,
        response_format: requestBody.response_format,
        temperature: requestBody.temperature,
        max_tokens: requestBody.max_tokens,
      });

      const response = await axios.post(
        OPENAI_API_URL,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          }
        }
      );
      
      if (response.data && 
          response.data.choices && 
          response.data.choices.length > 0 && 
          response.data.choices[0].message) {
        return response.data.choices[0].message.content;
      } else {
        console.error('Unexpected API response structure:', response.data);
        throw new Error('Unexpected API response structure');
      }
    } catch (error: unknown) {
      const err = error as OpenAIError;
      console.error('Error calling OpenAI API:', err);
      
      if (err.response && err.response.status === 429 && retryCount < maxRetries) {
        const retryAfter = err.response.headers['retry-after'];
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : initialDelay * Math.pow(2, retryCount);
        
        console.log(`Rate limit exceeded. Retrying in ${delay/1000} seconds... (Attempt ${retryCount + 1}/${maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return callOpenAI(messages, retryCount + 1, initialDelay);
      }
      
      if (err.response && err.response.status === 429) {
        console.log('Rate limit exceeded and max retries reached. Returning rate limited flag.');
        return { rateLimited: true };
      }
      
      if (err.response) {
        console.error('API error response:', err.response.data);
        throw new Error(`OpenAI API error: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
      }
      
      throw new Error('Failed to get response from OpenAI: ' + (err.message || 'Unknown error'));
    }
  });
};

// Helper function to make API calls to the language model with prompt files
const callLanguageModel = async (promptFile: string, inputs: Record<string, any>): Promise<any> => {
  try {
    // Read the prompt file
    const promptContent = await readPromptFile(promptFile);
    
    // Add instructions to return JSON
    const systemPrompt = `${promptContent}\n\nIMPORTANT: Your response MUST be valid JSON.`;
    
    // Prepare messages for OpenAI
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(inputs) }
    ];
    
    // Call OpenAI API
    const responseContent = await callOpenAI(messages);
    
    // Check if we got a rate limit flag
    if (typeof responseContent !== 'string' && responseContent.rateLimited) {
      return { rateLimited: true };
    }
    
    // Try to parse the response as JSON
    try {
      return JSON.parse(responseContent as string);
    } catch (e) {
      console.error('Error parsing JSON response:', e);
      // If parsing fails, return the raw content
      return { rawContent: responseContent };
    }
  } catch (error) {
    console.error('Error calling language model:', error);
    throw new Error('Failed to get response from language model');
  }
};

// Define schemas for different API responses
const partiesSchema = {
  type: "object",
  properties: {
    parties: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          isPrimary: { type: "boolean" }
        },
        required: ["name", "description", "isPrimary"]
      }
    }
  },
  required: ["parties"]
};

// Cache for API responses
const apiCache = {
  scenarios: new Map<string, Scenario[]>(),
  riskAssessments: new Map<string, RiskAssessment[]>(),
};

// Add request lock for analysis
let analysisInProgress: string | null = null;

export const api = {
  async analyzeCase(
    caseContent: string, 
    party1: Party, 
    party2: Party,
    onProgress?: (step: number, message: string, substep: number) => void
  ): Promise<Analysis | { rateLimited: true }> {
    const requestId = Date.now().toString();
    
    // Check if analysis is already in progress
    if (analysisInProgress) {
      console.log(`Analysis already in progress (${analysisInProgress}), skipping new request ${requestId}`);
      return { rateLimited: true };
    }
    
    analysisInProgress = requestId;
    console.log(`[${requestId}] Starting case analysis...`);
    
    try {
      // Call the language model for Island of Agreements
      console.log(`[${requestId}] Step 1: Island of Agreements analysis`);
      onProgress?.(1, 'Analyzing Island of Agreements...', 33);
      const ioaResponse = await callLanguageModel('islandOfAgreement.txt', {
        caseContent,
        party1Name: party1.name,
        party2Name: party2.name
      });
      
      // Check if we hit a rate limit
      if ('rateLimited' in ioaResponse && ioaResponse.rateLimited) {
        console.log(`[${requestId}] Rate limit hit during IoA analysis`);
        return { rateLimited: true };
      }
      
      // Call the language model for Iceberg Analysis
      console.log(`[${requestId}] Step 2: Iceberg analysis`);
      onProgress?.(2, 'Performing Iceberg Analysis...', 66);
      const icebergResponse = await callLanguageModel('iceberg.txt', {
        caseContent,
        party1Name: party1.name,
        party2Name: party2.name
      });
      
      // Check if we hit a rate limit
      if ('rateLimited' in icebergResponse && icebergResponse.rateLimited) {
        console.log(`[${requestId}] Rate limit hit during Iceberg analysis`);
        return { rateLimited: true };
      }
      
      // Call the language model for Components and Redline/Bottomline
      console.log(`[${requestId}] Step 3: Components analysis`);
      onProgress?.(3, 'Identifying Components and Boundaries...', 90);
      const componentsResponse = await callLanguageModel('redlinebottomlineRequirements.txt', {
        caseContent,
        party1Name: party1.name,
        party2Name: party2.name,
        ioa: ioaResponse.ioa || ioaResponse.rawContent || "",
        iceberg: icebergResponse.iceberg || icebergResponse.rawContent || ""
      });
      
      // Check if we hit a rate limit
      if ('rateLimited' in componentsResponse && componentsResponse.rateLimited) {
        console.log(`[${requestId}] Rate limit hit during Components analysis`);
        return { rateLimited: true };
      }
      
      console.log(`[${requestId}] Analysis complete`);
      onProgress?.(3, 'Analysis complete!', 100);
      
      // Parse the responses
      return {
        id: Date.now().toString(),
        ioa: ioaResponse.ioa || ioaResponse.rawContent || "# Island of Agreements\n\nNo islands of agreement identified yet.",
        iceberg: icebergResponse.iceberg || icebergResponse.rawContent || `# Iceberg Analysis\n\n## Party 1 (${party1.name})\n\n### Position (What)\n\n### Reasoning (How)\n\n### Motives (Why)\n\n## Party 2 (${party2.name})\n\n### Position (What)\n\n### Reasoning (How)\n\n### Motives (Why)`,
        components: componentsResponse.components || [],
        createdAt: new Date().toISOString(),
        version: 1
      };
    } catch (error) {
      console.error(`[${requestId}] Error analyzing case:`, error);
      
      // Fallback to basic structure if API call fails
      return {
        id: Date.now().toString(),
        ioa: `# Island of Agreements\n\n## Agreed Facts\n- Both parties acknowledge the need for discussion\n\n## Contested Facts\n- Details to be determined\n\n## Convergent Norms\n- Professional negotiation standards\n\n## Divergent Norms\n- Specific priorities of each party`,
        iceberg: `# Iceberg Analysis\n\n## Party 1 (${party1.name})\n\n### Position (What)\n- Initial position to be determined\n\n### Reasoning (How)\n- Reasoning to be analyzed\n\n### Motives (Why)\n- Underlying motives to be explored\n\n## Party 2 (${party2.name})\n\n### Position (What)\n- Initial position to be determined\n\n### Reasoning (How)\n- Reasoning to be analyzed\n\n### Motives (Why)\n- Underlying motives to be explored`,
        components: [
          {
            id: '1',
            name: 'Component 1',
            description: 'First negotiation component',
            redlineParty1: 'Party 1 redline',
            bottomlineParty1: 'Party 1 bottomline',
            redlineParty2: 'Party 2 redline',
            bottomlineParty2: 'Party 2 bottomline',
            priority: 1
          }
        ],
        createdAt: new Date().toISOString(),
        version: 1
      };
    } finally {
      // Clear the analysis lock
      if (analysisInProgress === requestId) {
        analysisInProgress = null;
      }
    }
  },
  
  async generateScenarios(componentId: string): Promise<Scenario[]> {
    console.log('Generating scenarios for component:', componentId);
    
    try {
      // Check cache first
      const cachedScenarios = apiCache.scenarios.get(componentId);
      if (cachedScenarios) {
        console.log('Using cached scenarios for component:', componentId);
        return cachedScenarios;
      }
      
      // Get the component details from the store
      const state = store.getState();
      const component = state.negotiation.currentCase?.analysis?.components.find(
        c => c.id === componentId
      );
      
      if (!component) {
        throw new Error(`Component with ID ${componentId} not found`);
      }
      
      // Get party names
      const party1Name = state.negotiation.currentCase?.party1?.name || 'Party 1';
      const party2Name = state.negotiation.currentCase?.party2?.name || 'Party 2';
      
      // Call the language model with the scenarios prompt and component details
      const result = await callLanguageModel('scenarios.txt', {
        componentId,
        componentName: component.name,
        componentDescription: component.description,
        redlineParty1: component.redlineParty1,
        bottomlineParty1: component.bottomlineParty1,
        redlineParty2: component.redlineParty2,
        bottomlineParty2: component.bottomlineParty2,
        party1Name,
        party2Name
      });
      
      // Check if we hit a rate limit
      if ('rateLimited' in result && result.rateLimited) {
        const error = new Error('Rate limit exceeded');
        error.message = 'rate limit exceeded';
        throw error;
      }
      
      // Parse the response and log it
      console.log('Received scenario response:', JSON.stringify(result, null, 2));
      const scenarios = result.scenarios || [];
      
      // Cache the result
      apiCache.scenarios.set(componentId, scenarios);
      
      return scenarios;
    } catch (error: any) {
      console.error('Error generating scenarios:', error);
      
      // If it's a rate limit error, propagate it
      if (error.message?.includes('rate limit')) {
        throw error;
      }
      
      // Fallback to basic scenarios if API call fails
      const fallbackScenarios: Scenario[] = [
        {
          id: `${componentId}-1`,
          componentId,
          type: 'redline_violated_p1',
          description: 'Party 1\'s redline is violated, creating a worst-case scenario for them. This would likely result in operational failure and potential withdrawal.',
        },
        {
          id: `${componentId}-2`,
          componentId,
          type: 'bottomline_violated_p1',
          description: 'Party 1\'s bottomline is violated, creating a challenging situation that may be workable but with significant compromises.',
        },
        {
          id: `${componentId}-3`,
          componentId,
          type: 'agreement_area',
          description: 'Both parties are operating within their acceptable ranges, creating a viable agreement area.',
        },
        {
          id: `${componentId}-4`,
          componentId,
          type: 'bottomline_violated_p2',
          description: 'Party 2\'s bottomline is violated, creating a challenging situation that may be workable but with significant compromises.',
        },
        {
          id: `${componentId}-5`,
          componentId,
          type: 'redline_violated_p2',
          description: 'Party 2\'s redline is violated, creating a worst-case scenario for them. This would likely result in operational failure and potential withdrawal.',
        }
      ];
      
      // Cache the fallback result
      apiCache.scenarios.set(componentId, fallbackScenarios);
      
      return fallbackScenarios;
    }
  },
  
  // Force regenerate scenarios (bypassing cache)
  async forceGenerateScenarios(componentId: string): Promise<Scenario[]> {
    console.log('Force regenerating scenarios for component:', componentId);
    
    // Clear cache for this component
    apiCache.scenarios.delete(componentId);
    
    // Generate new scenarios
    return this.generateScenarios(componentId);
  },
  
  async generateRiskAssessment(scenarioId: string): Promise<RiskAssessment> {
    console.log('Generating risk assessment with LLM for scenario:', scenarioId);
    
    try {
      // Call the language model with the risk assessment prompt
      const result = await callLanguageModel('riskAssessment.txt', {
        scenarioId
      });
      
      // Parse the response
      return {
        id: Date.now().toString(),
        scenarioId,
        category: result.category || 'Security of Field Teams',
        shortTermImpact: result.shortTermImpact || 'Increased exposure to checkpoints increases security risks for staff',
        shortTermMitigation: result.shortTermMitigation || 'Enhanced security protocols, reduced team size, increased communication',
        shortTermRiskAfter: result.shortTermRiskAfter || 'Medium',
        longTermImpact: result.longTermImpact || 'Potential for security incidents increases over time with repeated exposure',
        longTermMitigation: result.longTermMitigation || 'Rotation of staff, regular security assessments, contingency planning',
        longTermRiskAfter: result.longTermRiskAfter || 'Medium-High',
        overallAssessment: result.overallAssessment || 'The scenario presents significant but manageable security risks that require constant monitoring and adaptation',
      };
    } catch (error) {
      console.error('Error generating risk assessment:', error);
      
      // Fallback to basic risk assessment if API call fails
      return {
        id: Date.now().toString(),
        scenarioId,
        category: 'Security of Field Teams',
        shortTermImpact: 'Increased exposure to checkpoints increases security risks for staff',
        shortTermMitigation: 'Enhanced security protocols, reduced team size, increased communication',
        shortTermRiskAfter: 'Medium',
        longTermImpact: 'Potential for security incidents increases over time with repeated exposure',
        longTermMitigation: 'Rotation of staff, regular security assessments, contingency planning',
        longTermRiskAfter: 'Medium-High',
        overallAssessment: 'The scenario presents significant but manageable security risks that require constant monitoring and adaptation',
      };
    }
  },
  
  async recalculateBoundaries(analysis: Analysis): Promise<Component[]> {
    console.log('Recalculating boundaries with LLM...');
    
    try {
      // Call the language model with the recalculate boundaries prompt
      const result = await callLanguageModel('redlinebottomline.txt', {
        ioa: analysis.ioa,
        iceberg: analysis.iceberg,
        components: JSON.stringify(analysis.components)
      });
      
      // Parse the response
      return result.components || analysis.components;
    } catch (error) {
      console.error('Error recalculating boundaries:', error);
      
      // Return slightly modified components to simulate recalculation if API call fails
      return analysis.components.map(component => ({
        ...component,
        redlineParty1: `${component.redlineParty1} (recalculated)`,
        bottomlineParty1: `${component.bottomlineParty1} (recalculated)`,
        redlineParty2: `${component.redlineParty2} (recalculated)`,
        bottomlineParty2: `${component.bottomlineParty2} (recalculated)`,
      }));
    }
  },

  async identifyParties(caseContent: string): Promise<Array<{name: string, description: string, isPrimary: boolean}>> {
    console.log('Identifying parties from case content with LLM...');
    
    try {
      // Call the language model with the identify parties prompt
      const result = await callLanguageModel('identifyParties.txt', {
        caseContent
      });
      
      // The result should have a parties property containing the array
      if (result && result.parties && Array.isArray(result.parties)) {
        return result.parties;
      } else {
        console.warn('Unexpected response format from identifyParties:', result);
        return [];
      }
    } catch (error) {
      console.error('Error identifying parties:', error);
      
      // Return empty array if API call fails
      return [];
    }
  }
}; 