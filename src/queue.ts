/**
 * AuroraNotes API - Background Job Queue
 * 
 * In-process async queue with backpressure for chunk/embedding processing.
 * Provides graceful degradation when queue is full and retry logic.
 */

import { NoteDoc } from "./types";
import { processNoteChunks } from "./chunking";
import { logInfo, logError, logWarn } from "./utils";

// Queue configuration
const DEFAULT_MAX_QUEUE_SIZE = 100;
const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 5000;

interface QueueJob {
  id: string;
  note: NoteDoc;
  retries: number;
  createdAt: Date;
}

interface QueueConfig {
  maxSize: number;
  maxConcurrent: number;
  maxRetries: number;
  retryDelayMs: number;
}

class BackgroundQueue {
  private queue: QueueJob[] = [];
  private processing: Set<string> = new Set();
  private config: QueueConfig;
  private isProcessing = false;
  private totalProcessed = 0;
  private totalFailed = 0;
  private totalDropped = 0;

  constructor(config?: Partial<QueueConfig>) {
    const envMaxSize = parseInt(process.env.BACKGROUND_QUEUE_MAX_SIZE || '');
    this.config = {
      maxSize: config?.maxSize ?? (isNaN(envMaxSize) ? DEFAULT_MAX_QUEUE_SIZE : envMaxSize),
      maxConcurrent: config?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT,
      maxRetries: config?.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryDelayMs: config?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    };

    logInfo('Background queue initialized', {
      maxSize: this.config.maxSize,
      maxConcurrent: this.config.maxConcurrent,
    });
  }

  /**
   * Enqueue a note for background processing
   * Returns true if enqueued, false if queue is full
   */
  enqueue(note: NoteDoc): boolean {
    // Check if already in queue or processing
    if (this.queue.some(j => j.id === note.id) || this.processing.has(note.id)) {
      logInfo('Note already in queue', { noteId: note.id });
      return true;
    }

    // Check queue capacity
    if (this.queue.length >= this.config.maxSize) {
      this.totalDropped++;
      logWarn('Queue full, dropping job', { 
        noteId: note.id, 
        queueSize: this.queue.length,
        totalDropped: this.totalDropped,
      });
      return false;
    }

    this.queue.push({
      id: note.id,
      note,
      retries: 0,
      createdAt: new Date(),
    });

    logInfo('Job enqueued', { 
      noteId: note.id, 
      queueSize: this.queue.length,
    });

    // Start processing if not already running
    this.processQueue();
    return true;
  }

  /**
   * Process jobs from the queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && this.processing.size < this.config.maxConcurrent) {
      const job = this.queue.shift();
      if (!job) break;

      this.processing.add(job.id);
      this.processJob(job).finally(() => {
        this.processing.delete(job.id);
        // Continue processing if more jobs
        if (this.queue.length > 0) {
          setImmediate(() => this.processQueue());
        }
      });
    }

    this.isProcessing = false;
  }

  /**
   * Process a single job with retry logic
   */
  private async processJob(job: QueueJob): Promise<void> {
    const startTime = Date.now();
    try {
      await processNoteChunks(job.note);
      this.totalProcessed++;
      logInfo('Background job completed', {
        noteId: job.id,
        elapsedMs: Date.now() - startTime,
        totalProcessed: this.totalProcessed,
      });
    } catch (err) {
      if (job.retries < this.config.maxRetries) {
        job.retries++;
        logWarn('Background job failed, retrying', {
          noteId: job.id,
          retries: job.retries,
          maxRetries: this.config.maxRetries,
        });
        
        // Re-queue with delay
        setTimeout(() => {
          this.queue.push(job);
          this.processQueue();
        }, this.config.retryDelayMs * job.retries);
      } else {
        this.totalFailed++;
        logError('Background job failed permanently', err, {
          noteId: job.id,
          retries: job.retries,
          totalFailed: this.totalFailed,
        });
      }
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    queueSize: number;
    processing: number;
    totalProcessed: number;
    totalFailed: number;
    totalDropped: number;
  } {
    return {
      queueSize: this.queue.length,
      processing: this.processing.size,
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
      totalDropped: this.totalDropped,
    };
  }

  /**
   * Check if queue is healthy
   */
  isHealthy(): boolean {
    return this.queue.length < this.config.maxSize * 0.9;
  }
}

// Singleton instance
let queueInstance: BackgroundQueue | null = null;

export function getBackgroundQueue(): BackgroundQueue {
  if (!queueInstance) {
    queueInstance = new BackgroundQueue();
  }
  return queueInstance;
}

export function enqueueNoteProcessing(note: NoteDoc): boolean {
  return getBackgroundQueue().enqueue(note);
}

export function getQueueStats() {
  return getBackgroundQueue().getStats();
}

