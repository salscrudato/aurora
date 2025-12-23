/**
 * AuroraNotes API - GenAI Client Factory
 */

import { GoogleGenAI } from "@google/genai";
import { logInfo, logError } from "./utils";

// =============================================================================
// Configuration
// =============================================================================

const MODE = process.env.GENAI_MODE || 'apikey';
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const LOCATION = process.env.VERTEX_AI_LOCATION || 'us-central1';
const MAX_CONCURRENT = parseInt(process.env.GENAI_MAX_CONCURRENT || '10');

// =============================================================================
// Singleton Clients
// =============================================================================

let apiKeyClient: GoogleGenAI | null = null;
let vertexClient: GoogleGenAI | null = null;

// =============================================================================
// Concurrency Control
// =============================================================================

let activeRequests = 0;
const requestQueue: Array<() => void> = [];

function releaseSlot() {
  activeRequests--;
  const next = requestQueue.shift();
  if (next) next();
}

export async function acquireRequestSlot(): Promise<() => void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return releaseSlot;
  }

  return new Promise((resolve) => {
    requestQueue.push(() => {
      activeRequests++;
      resolve(releaseSlot);
    });
  });
}

// =============================================================================
// Availability Check
// =============================================================================

export function isGenAIAvailable(): boolean {
  if (MODE === 'vertex') return !!PROJECT_ID;
  return !!(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
}

// =============================================================================
// Client Initialization
// =============================================================================

function getApiKeyClient(): GoogleGenAI {
  if (!apiKeyClient) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GENAI_MODE=apikey requires GOOGLE_API_KEY or GEMINI_API_KEY');
    }
    apiKeyClient = new GoogleGenAI({ apiKey });
    logInfo('GenAI client initialized', { mode: 'apikey' });
  }
  return apiKeyClient;
}

function getVertexClient(): GoogleGenAI {
  if (!vertexClient) {
    if (!PROJECT_ID) {
      throw new Error('GENAI_MODE=vertex requires GOOGLE_CLOUD_PROJECT');
    }
    try {
      vertexClient = new GoogleGenAI({
        vertexai: true,
        project: PROJECT_ID,
        location: LOCATION,
      } as any);
      logInfo('GenAI client initialized', { mode: 'vertex', project: PROJECT_ID, location: LOCATION });
    } catch (err) {
      logError('Failed to initialize Vertex AI client', err);
      throw new Error(`Failed to initialize Vertex AI: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return vertexClient;
}

export function getGenAIClient(): GoogleGenAI {
  return MODE === 'vertex' ? getVertexClient() : getApiKeyClient();
}
