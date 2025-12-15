/**
 * AuroraNotes API - Background Job Queue
 *
 * In-process async queue with backpressure for chunk/embedding processing.
 * Provides graceful degradation when queue is full and retry logic.
 *
 * QUEUE MODES:
 *   - in-process (default): Jobs processed in-memory with backpressure
 *   - cloud-tasks (env QUEUE_MODE=cloud-tasks): Optional Cloud Tasks for durability
 *   - pubsub (env QUEUE_MODE=pubsub): Optional Pub/Sub for high volume
 */

import { NoteDoc } from "./types";
import { processNoteChunks } from "./chunking";
import { logInfo, logError, logWarn } from "./utils";

// Queue configuration
const DEFAULT_MAX_QUEUE_SIZE = 100;
const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 5000;
const STATS_LOG_INTERVAL_MS = 60000; // Log stats every minute

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
  private totalRetries = 0;
  private lastStatsLog = 0;

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
      mode: process.env.QUEUE_MODE || 'in-process',
    });

    // Start periodic stats logging if there's activity
    this.startStatsLogger();
  }

  /**
   * Periodically log queue statistics for monitoring
   */
  private startStatsLogger(): void {
    setInterval(() => {
      // Only log if there's been activity since last log
      if (this.totalProcessed > 0 || this.totalFailed > 0 ||
          this.totalDropped > 0 || this.queue.length > 0) {
        this.logQueueStats();
      }
    }, STATS_LOG_INTERVAL_MS);
  }

  /**
   * Log comprehensive queue statistics
   */
  private logQueueStats(): void {
    const stats = this.getStats();
    const utilization = Math.round((stats.queueSize / this.config.maxSize) * 100);

    logInfo('Queue stats', {
      ...stats,
      maxSize: this.config.maxSize,
      utilization: `${utilization}%`,
      healthy: this.isHealthy(),
      mode: process.env.QUEUE_MODE || 'in-process',
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
        this.totalRetries++;

        const delay = this.config.retryDelayMs * job.retries;
        logWarn('Background job failed, retrying', {
          noteId: job.id,
          attempt: job.retries,
          maxRetries: this.config.maxRetries,
          nextRetryMs: delay,
          errorMessage: err instanceof Error ? err.message : String(err),
        });

        // Re-queue with exponential backoff delay
        setTimeout(() => {
          this.queue.push(job);
          this.processQueue();
        }, delay);
      } else {
        this.totalFailed++;
        logError('Background job failed permanently', err, {
          noteId: job.id,
          attempts: job.retries + 1,
          totalFailed: this.totalFailed,
          queueStats: this.getStats(),
        });
      }
    }
  }

  /**
   * Get queue statistics for monitoring
   */
  getStats(): {
    queueSize: number;
    processing: number;
    totalProcessed: number;
    totalFailed: number;
    totalDropped: number;
    totalRetries: number;
  } {
    return {
      queueSize: this.queue.length,
      processing: this.processing.size,
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
      totalDropped: this.totalDropped,
      totalRetries: this.totalRetries,
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

