/**
 * AuroraNotes API - GenAI Client Factory
 * 
 * Centralized client creation for all GenAI operations (chat, embeddings, reranking).
 * Supports two authentication modes:
 * 
 *   GENAI_MODE=apikey (default):
 *     Uses GOOGLE_API_KEY or GEMINI_API_KEY environment variable
 *     Suitable for development and simple deployments
 * 
 *   GENAI_MODE=vertex:
 *     Uses Application Default Credentials (ADC) via service account
 *     Required for production Cloud Run deployments
 *     Requires GOOGLE_CLOUD_PROJECT to be set
 */

import { GoogleGenAI } from "@google/genai";
import { logInfo, logError } from "./utils";

// Singleton instances for each mode
let apiKeyClient: GoogleGenAI | null = null;
let vertexClient: GoogleGenAI | null = null;

// Configuration
const GENAI_MODE = process.env.GENAI_MODE || 'apikey';
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

/**
 * Supported GenAI modes
 */
export type GenAIMode = 'apikey' | 'vertex';

/**
 * Get the current GenAI mode
 */
export function getGenAIMode(): GenAIMode {
  if (GENAI_MODE === 'vertex') {
    return 'vertex';
  }
  return 'apikey';
}

/**
 * Check if GenAI client is available
 */
export function isGenAIAvailable(): boolean {
  const mode = getGenAIMode();
  
  if (mode === 'apikey') {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    return !!apiKey;
  }
  
  if (mode === 'vertex') {
    // Vertex requires project ID and ADC (which is automatically available on Cloud Run)
    return !!PROJECT_ID;
  }
  
  return false;
}

/**
 * Get the GenAI client with API key authentication
 */
function getApiKeyClient(): GoogleGenAI {
  if (!apiKeyClient) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GENAI_MODE=apikey requires GOOGLE_API_KEY or GEMINI_API_KEY environment variable'
      );
    }
    
    apiKeyClient = new GoogleGenAI({ apiKey });
    logInfo('GenAI client initialized', { mode: 'apikey' });
  }
  return apiKeyClient;
}

/**
 * Get the GenAI client with Vertex AI / ADC authentication
 * 
 * This uses Application Default Credentials which:
 * - On Cloud Run: automatically uses the service account
 * - Locally: uses gcloud auth application-default credentials
 */
function getVertexClient(): GoogleGenAI {
  if (!vertexClient) {
    if (!PROJECT_ID) {
      throw new Error(
        'GENAI_MODE=vertex requires GOOGLE_CLOUD_PROJECT environment variable'
      );
    }

    // The GoogleGenAI SDK supports Vertex AI through ADC when no apiKey is provided
    // and GOOGLE_APPLICATION_CREDENTIALS or Cloud Run service account is available
    try {
      // For Vertex AI, we need to use the Vertex AI endpoint
      // This is a simplified approach - full Vertex AI support would use @google-cloud/aiplatform
      vertexClient = new GoogleGenAI({
        vertexai: true,
        project: PROJECT_ID,
        location: process.env.VERTEX_AI_LOCATION || 'us-central1',
      } as any); // Type assertion needed as SDK types may not fully expose Vertex options
      
      logInfo('GenAI client initialized', { 
        mode: 'vertex',
        project: PROJECT_ID,
        location: process.env.VERTEX_AI_LOCATION || 'us-central1',
      });
    } catch (err) {
      logError('Failed to initialize Vertex AI client', err);
      throw new Error(
        `Failed to initialize Vertex AI: ${err instanceof Error ? err.message : String(err)}. ` +
        'Ensure GOOGLE_APPLICATION_CREDENTIALS is set or running on Cloud Run with appropriate IAM.'
      );
    }
  }
  return vertexClient;
}

/**
 * Get the GenAI client based on current mode
 */
export function getGenAIClient(): GoogleGenAI {
  const mode = getGenAIMode();
  
  switch (mode) {
    case 'vertex':
      return getVertexClient();
    case 'apikey':
    default:
      return getApiKeyClient();
  }
}

/**
 * Reset clients (for testing)
 */
export function resetGenAIClients(): void {
  apiKeyClient = null;
  vertexClient = null;
}

/**
 * Get configuration info for logging/debugging
 */
export function getGenAIConfig(): {
  mode: GenAIMode;
  available: boolean;
  project?: string;
  location?: string;
} {
  return {
    mode: getGenAIMode(),
    available: isGenAIAvailable(),
    project: PROJECT_ID,
    location: process.env.VERTEX_AI_LOCATION || 'us-central1',
  };
}

