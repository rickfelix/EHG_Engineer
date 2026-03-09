/**
 * Tests for StageExecutionWorker Health Check Endpoint
 * SD-MAN-INFRA-VENTURE-ARTIFACT-PIPELINE-003
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';
import http from 'http';

// Mock all external dependencies
vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({
  processStage: vi.fn(),
}));

vi.mock('../../../lib/eva/orchestrator-state-machine.js', () => ({
  acquireProcessingLock: vi.fn().mockResolvedValue({ acquired: false }),
  releaseProcessingLock: vi.fn().mockResolvedValue({}),
  markCompleted: vi.fn().mockResolvedValue({}),
  ORCHESTRATOR_STATES: {
    IDLE: 'idle',
    PROCESSING: 'processing',
    BLOCKED: 'blocked',
    FAILED: 'failed',
    KILLED_AT_REALITY_GATE: 'killed_at_reality_gate',
  },
}));

vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn(),
  waitForDecision: vi.fn(),
}));

vi.mock('../../../lib/eva/shared-services.js', () => ({
  emit: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../lib/eva/autonomy-model.js', () => ({
  checkAutonomy: vi.fn().mockResolvedValue({ action: 'block', level: 'L0' }),
}));

function createMockSupabase() {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
  };

  for (const key of Object.keys(mockChain)) {
    if (key !== 'single') {
      mockChain[key].mockReturnValue(mockChain);
    }
  }

  return {
    from: vi.fn().mockReturnValue(mockChain),
    _chain: mockChain,
  };
}

function createMockLogger() {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

describe('StageExecutionWorker Health Check', () => {
  let supabase;
  let logger;
  let worker;
  let healthPort;

  beforeEach(() => {
    supabase = createMockSupabase();
    logger = createMockLogger();
    // Use random port to avoid conflicts in parallel tests
    healthPort = 30000 + Math.floor(Math.random() * 10000);
  });

  afterEach(() => {
    if (worker) {
      worker.stop();
      worker = null;
    }
  });

  describe('getHealth()', () => {
    it('returns healthy status when running and not stalled', () => {
      worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
      worker.start();

      const health = worker.getHealth();

      expect(health.status).toBe('healthy');
      expect(health.version).toBeDefined();
      expect(health.workerId).toMatch(/^sew-/);
      expect(health.startedAt).toBeDefined();
      expect(health.uptime).toBeGreaterThanOrEqual(0);
      expect(health.venturesProcessed).toBe(0);
      expect(health.stalled).toBe(false);
    });

    it('returns stopped status when worker is not running', () => {
      worker = new StageExecutionWorker({ supabase, logger });

      const health = worker.getHealth();

      expect(health.status).toBe('stopped');
      expect(health.startedAt).toBeNull();
    });

    it('returns degraded status when stalled', async () => {
      worker = new StageExecutionWorker({
        supabase,
        logger,
        pollIntervalMs: 999999,
        stallThresholdMs: 50, // Very short threshold for testing
      });

      worker.start();
      // Simulate a tick that happened, then wait for stall
      worker._lastTickAt = new Date(Date.now() - 100); // 100ms ago, threshold is 50ms

      const health = worker.getHealth();

      expect(health.status).toBe('degraded');
      expect(health.stalled).toBe(true);
      expect(health.timeSinceLastTick).toBeDefined();
    });

    it('includes timeSinceLastTick in human-readable format', () => {
      worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
      worker.start();
      worker._lastTickAt = new Date(Date.now() - 125000); // 2m 5s ago

      const health = worker.getHealth();

      expect(health.timeSinceLastTick).toMatch(/\d+m \d+s/);
    });

    it('tracks venturesProcessed count', () => {
      worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
      worker._venturesProcessed = 42;

      const health = worker.getHealth();

      expect(health.venturesProcessed).toBe(42);
    });
  });

  describe('startHealthServer()', () => {
    it('responds to GET /health with 200 when healthy', async () => {
      worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
      worker.start();

      await worker.startHealthServer(healthPort);

      const { statusCode, body } = await httpGet(`http://localhost:${healthPort}/health`);

      expect(statusCode).toBe(200);
      expect(body.status).toBe('healthy');
      expect(body.version).toBeDefined();
      expect(body.workerId).toBeDefined();
      expect(body.venturesProcessed).toBe(0);
    });

    it('responds with 503 when stalled', async () => {
      worker = new StageExecutionWorker({
        supabase,
        logger,
        pollIntervalMs: 999999,
        stallThresholdMs: 10,
      });
      worker.start();
      worker._lastTickAt = new Date(Date.now() - 100);

      await worker.startHealthServer(healthPort);

      const { statusCode, body } = await httpGet(`http://localhost:${healthPort}/health`);

      expect(statusCode).toBe(503);
      expect(body.status).toBe('degraded');
      expect(body.stalled).toBe(true);
    });

    it('responds with 404 for unknown paths', async () => {
      worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
      worker.start();

      await worker.startHealthServer(healthPort);

      const { statusCode, body } = await httpGet(`http://localhost:${healthPort}/unknown`);

      expect(statusCode).toBe(404);
      expect(body.error).toBe('Not found');
    });

    it('shuts down health server on worker stop', async () => {
      worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
      worker.start();

      await worker.startHealthServer(healthPort);

      // Verify server is running
      const { statusCode } = await httpGet(`http://localhost:${healthPort}/health`);
      expect(statusCode).toBe(200);

      // Stop worker (which should close health server)
      worker.stop();

      // Verify server is closed
      await expect(httpGet(`http://localhost:${healthPort}/health`)).rejects.toThrow();
      worker = null; // Prevent afterEach double-stop
    });
  });
});
