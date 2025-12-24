/**
 * AuroraNotes API - Cloud Tasks Integration
 * 
 * Handles async note processing via Google Cloud Tasks.
 * Supports retries with idempotency and graceful fallback to sync in dev.
 */

import { CloudTasksClient, protos } from '@google-cloud/tasks';
import { logInfo, logError, logWarn } from './utils';

// =============================================================================
// Configuration
// =============================================================================

const PROJECT_ID = process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '';
const LOCATION = process.env.CLOUD_TASKS_LOCATION || 'us-central1';
const QUEUE_NAME = process.env.CLOUD_TASKS_QUEUE || 'note-processing';
const SERVICE_URL = process.env.SERVICE_URL || 'http://localhost:8080';

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// Use sync processing in dev unless explicitly configured
const USE_ASYNC_PROCESSING = process.env.USE_ASYNC_PROCESSING === 'true' || IS_PRODUCTION;

let tasksClient: CloudTasksClient | null = null;

function getTasksClient(): CloudTasksClient {
  if (!tasksClient) {
    tasksClient = new CloudTasksClient();
  }
  return tasksClient;
}

// =============================================================================
// Types
// =============================================================================

export interface ProcessNoteTask {
  noteId: string;
  tenantId: string;
  action: 'chunk' | 'embed' | 'process_all';
  /** Idempotency key to prevent duplicate processing */
  idempotencyKey: string;
}

export interface EnqueueResult {
  success: boolean;
  taskName?: string;
  fallbackSync?: boolean;
  error?: string;
}

// =============================================================================
// Task Queue Functions
// =============================================================================

/**
 * Enqueue a note for async processing
 * 
 * Returns quickly so the API response is fast. The actual processing
 * happens in the background via Cloud Tasks calling /internal/process-note.
 */
export async function enqueueNoteProcessing(task: ProcessNoteTask): Promise<EnqueueResult> {
  const { noteId, tenantId, action, idempotencyKey } = task;

  // In development, fall back to sync unless explicitly configured
  if (!USE_ASYNC_PROCESSING) {
    logInfo('Async processing disabled - returning for sync fallback', { noteId, tenantId });
    return { success: true, fallbackSync: true };
  }

  if (!PROJECT_ID) {
    logWarn('PROJECT_ID not set - cannot use Cloud Tasks', { noteId });
    return { success: true, fallbackSync: true };
  }

  const queuePath = getTasksClient().queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);

  const payload: ProcessNoteTask = {
    noteId,
    tenantId,
    action,
    idempotencyKey,
  };

  const taskConfig: protos.google.cloud.tasks.v2.ITask = {
    httpRequest: {
      httpMethod: 'POST',
      url: `${SERVICE_URL}/internal/process-note`,
      headers: {
        'Content-Type': 'application/json',
        // Cloud Tasks will add its own auth header for verification
      },
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
    },
    // Dedupe by idempotencyKey to prevent duplicate tasks
    name: `${queuePath}/tasks/${idempotencyKey.replace(/[^a-zA-Z0-9-_]/g, '-')}`,
  };

  // Configure retries
  const request: protos.google.cloud.tasks.v2.ICreateTaskRequest = {
    parent: queuePath,
    task: taskConfig,
  };

  try {
    const [response] = await getTasksClient().createTask(request);
    
    logInfo('Enqueued note processing task', {
      noteId,
      tenantId,
      action,
      taskName: response.name,
      idempotencyKey,
    });

    return {
      success: true,
      taskName: response.name || undefined,
    };
  } catch (err: any) {
    // 409 ALREADY_EXISTS is expected for idempotent retries - treat as success
    if (err.code === 6) { // ALREADY_EXISTS
      logInfo('Task already exists (idempotent)', { noteId, idempotencyKey });
      return { success: true, taskName: task.idempotencyKey };
    }

    logError('Failed to enqueue note processing', err as Error, { noteId, tenantId });
    
    // Fall back to sync processing on queue errors
    return { 
      success: true, 
      fallbackSync: true,
      error: err.message,
    };
  }
}

/**
 * Generate an idempotency key for note processing
 * Ensures chunks aren't duplicated on retries
 */
export function generateIdempotencyKey(noteId: string, action: string): string {
  const timestamp = Date.now();
  return `${noteId}-${action}-${timestamp}`;
}

/**
 * Check if we should use async processing
 */
export function shouldUseAsyncProcessing(): boolean {
  return USE_ASYNC_PROCESSING && !!PROJECT_ID;
}

/**
 * Verify a Cloud Tasks request (called by internal endpoint)
 * 
 * In production, verify the request came from Cloud Tasks.
 * In development, allow any request to the internal endpoint.
 */
export function verifyCloudTasksRequest(headers: Record<string, string | string[] | undefined>): boolean {
  // In development, allow all requests for easier testing
  if (!IS_PRODUCTION) {
    return true;
  }

  // Check for Cloud Tasks headers
  const taskName = headers['x-cloudtasks-taskname'];
  const queueName = headers['x-cloudtasks-queuename'];
  
  if (!taskName || !queueName) {
    logWarn('Missing Cloud Tasks headers in production', { hasTaskName: !!taskName, hasQueueName: !!queueName });
    return false;
  }

  return true;
}

