/**
 * Marketing BullMQ Queue System
 * SD-EVA-FEAT-MARKETING-FOUNDATION-001
 *
 * 6 queues orchestrating the content lifecycle:
 * 1. content-generation (concurrency 2)
 * 2. content-review (concurrency 5)
 * 3. publish-x (concurrency 1)
 * 4. publish-bluesky (concurrency 1)
 * 5. attribution-sync (concurrency 2)
 * 6. daily-rollup (concurrency 1)
 */

import { Queue, Worker } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Queue configuration
 */
const QUEUE_CONFIGS = {
  'content-generation': {
    concurrency: parseInt(process.env.BULLMQ_CONCURRENCY_GENERATE || '2', 10),
    maxRetries: 3,
    backoff: { type: 'exponential', delay: 5000 }
  },
  'content-review': {
    concurrency: 5,
    maxRetries: 3,
    backoff: { type: 'exponential', delay: 3000 }
  },
  'publish-x': {
    concurrency: 1,
    maxRetries: 3,
    backoff: { type: 'exponential', delay: 10000 } // longer backoff for rate limits
  },
  'publish-bluesky': {
    concurrency: 1,
    maxRetries: 3,
    backoff: { type: 'exponential', delay: 5000 }
  },
  'attribution-sync': {
    concurrency: 2,
    maxRetries: 3,
    backoff: { type: 'exponential', delay: 5000 }
  },
  'daily-rollup': {
    concurrency: 1,
    maxRetries: 2,
    backoff: { type: 'fixed', delay: 60000 }
  }
};

/**
 * Parse Redis URL to connection object
 */
function parseRedisConnection(url) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

/**
 * Create all marketing queues
 * @returns {Map<string, Queue>} Map of queue name to Queue instance
 */
export function createQueues() {
  const connection = parseRedisConnection(REDIS_URL);
  const queues = new Map();

  for (const [name] of Object.entries(QUEUE_CONFIGS)) {
    queues.set(name, new Queue(`marketing:${name}`, { connection }));
  }

  return queues;
}

/**
 * Create workers for all queues
 * @param {object} handlers - Map of queue name to handler function
 * @returns {Map<string, Worker>} Map of queue name to Worker instance
 */
export function createWorkers(handlers) {
  const connection = parseRedisConnection(REDIS_URL);
  const workers = new Map();

  for (const [name, config] of Object.entries(QUEUE_CONFIGS)) {
    const handler = handlers[name];
    if (!handler) {
      console.warn(`No handler for queue: ${name}, skipping worker creation`);
      continue;
    }

    const worker = new Worker(`marketing:${name}`, handler, {
      connection,
      concurrency: config.concurrency,
      defaultJobOptions: {
        attempts: config.maxRetries + 1,
        backoff: config.backoff,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 } // keep more failed jobs for debugging
      }
    });

    worker.on('failed', (job, err) => {
      if (job && job.attemptsMade >= config.maxRetries + 1) {
        console.error(`[DLQ] Job ${job.id} in ${name} moved to DLQ after ${job.attemptsMade} attempts: ${err.message}`);
      }
    });

    workers.set(name, worker);
  }

  return workers;
}

/**
 * Add a job to a marketing queue
 * @param {Map<string, Queue>} queues - Queue map from createQueues()
 * @param {string} queueName - Queue name (e.g., 'content-generation')
 * @param {object} data - Job data
 * @param {object} [opts] - Job options (priority, delay, etc.)
 * @returns {Promise<object>} Job instance
 */
export async function addJob(queues, queueName, data, opts = {}) {
  const queue = queues.get(queueName);
  if (!queue) {
    throw new Error(`Queue not found: ${queueName}. Available: ${[...queues.keys()].join(', ')}`);
  }

  // Enforce idempotency key for dispatch queues
  if (queueName.startsWith('publish-') && data.idempotencyKey) {
    opts.jobId = data.idempotencyKey;
  }

  return queue.add(`${queueName}-job`, data, opts);
}

/**
 * Get queue health status
 * @param {Map<string, Queue>} queues - Queue map
 * @returns {Promise<object>} Status of all queues
 */
export async function getQueueHealth(queues) {
  const status = {};

  for (const [name, queue] of queues) {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount()
      ]);

      status[name] = { waiting, active, completed, failed, delayed, healthy: true };
    } catch (error) {
      status[name] = { error: error.message, healthy: false };
    }
  }

  return status;
}

/**
 * Gracefully shut down all queues and workers
 * @param {Map<string, Queue>} queues
 * @param {Map<string, Worker>} workers
 */
export async function shutdown(queues, workers) {
  // Close workers first (stop processing)
  for (const [name, worker] of workers) {
    try {
      await worker.close();
    } catch (error) {
      console.error(`Error closing worker ${name}: ${error.message}`);
    }
  }

  // Then close queues
  for (const [name, queue] of queues) {
    try {
      await queue.close();
    } catch (error) {
      console.error(`Error closing queue ${name}: ${error.message}`);
    }
  }
}

/**
 * Get queue configurations (for display/monitoring)
 */
export function getQueueConfigs() {
  return { ...QUEUE_CONFIGS };
}
