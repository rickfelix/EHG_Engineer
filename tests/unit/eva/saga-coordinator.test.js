/**
 * Tests for SagaCoordinator (Compensation Pattern)
 * SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-F
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SagaCoordinator,
  createSagaCoordinator,
  createArtifactCompensation,
  createStageCompensation,
  MODULE_VERSION,
  _internal,
} from '../../../lib/eva/saga-coordinator.js';

const { SAGA_STATUS } = _internal;

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('SagaCoordinator', () => {
  let saga;

  beforeEach(() => {
    vi.clearAllMocks();
    saga = new SagaCoordinator({
      traceId: 'trace-1',
      ventureId: 'venture-1',
      logger: silentLogger,
    });
  });

  describe('constructor', () => {
    it('should generate unique sagaId', () => {
      expect(saga.sagaId).toBeDefined();
      expect(saga.sagaId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should store traceId for correlation', () => {
      expect(saga.traceId).toBe('trace-1');
    });

    it('should store ventureId', () => {
      expect(saga.ventureId).toBe('venture-1');
    });

    it('should default to pending status', () => {
      expect(saga.getStatus()).toBe(SAGA_STATUS.PENDING);
    });

    it('should default to console logger', () => {
      const s = new SagaCoordinator();
      expect(s.logger).toBe(console);
    });

    it('should default traceId to null', () => {
      const s = new SagaCoordinator({ logger: silentLogger });
      expect(s.traceId).toBeNull();
    });
  });

  describe('addStep', () => {
    it('should register a step with action and compensation', () => {
      const action = vi.fn();
      const compensate = vi.fn();
      saga.addStep('step1', action, compensate);
      expect(saga.steps).toHaveLength(1);
      expect(saga.steps[0].name).toBe('step1');
    });

    it('should support chaining', () => {
      const result = saga
        .addStep('step1', vi.fn(), vi.fn())
        .addStep('step2', vi.fn(), vi.fn());
      expect(result).toBe(saga);
      expect(saga.steps).toHaveLength(2);
    });
  });

  describe('execute - all steps succeed', () => {
    it('should complete all steps and return success', async () => {
      const step1 = vi.fn();
      const step2 = vi.fn();

      saga.addStep('persist', step1, vi.fn());
      saga.addStep('advance', step2, vi.fn());

      const result = await saga.execute();
      expect(result.success).toBe(true);
      expect(result.sagaId).toBe(saga.sagaId);
      expect(result.completedSteps).toEqual(['persist', 'advance']);
      expect(result.compensationErrors).toEqual([]);
      expect(step1).toHaveBeenCalledOnce();
      expect(step2).toHaveBeenCalledOnce();
    });

    it('should set status to completed', async () => {
      saga.addStep('step1', vi.fn(), vi.fn());
      await saga.execute();
      expect(saga.getStatus()).toBe(SAGA_STATUS.COMPLETED);
    });
  });

  describe('execute - step fails, compensation succeeds', () => {
    it('should compensate completed steps in reverse', async () => {
      const compensate1 = vi.fn();
      const compensate2 = vi.fn();
      const callOrder = [];

      saga.addStep('step1', vi.fn(), async () => { callOrder.push('comp1'); await compensate1(); });
      saga.addStep('step2', vi.fn(), async () => { callOrder.push('comp2'); await compensate2(); });
      saga.addStep('step3', vi.fn().mockRejectedValue(new Error('step3 failed')), vi.fn());

      const result = await saga.execute();
      expect(result.success).toBe(false);
      expect(result.failedStep).toBe('step3');
      expect(result.error).toBe('step3 failed');
      expect(result.completedSteps).toEqual(['step1', 'step2']);
      expect(callOrder).toEqual(['comp2', 'comp1']); // Reverse order
    });

    it('should set status to compensated', async () => {
      saga.addStep('step1', vi.fn(), vi.fn());
      saga.addStep('step2', vi.fn().mockRejectedValue(new Error('fail')), vi.fn());

      await saga.execute();
      expect(saga.getStatus()).toBe(SAGA_STATUS.COMPENSATED);
    });
  });

  describe('execute - step fails, compensation also fails', () => {
    it('should collect compensation errors', async () => {
      saga.addStep('step1', vi.fn(), vi.fn().mockRejectedValue(new Error('comp1 failed')));
      saga.addStep('step2', vi.fn().mockRejectedValue(new Error('step2 failed')), vi.fn());

      const result = await saga.execute();
      expect(result.success).toBe(false);
      expect(result.compensationErrors).toHaveLength(1);
      expect(result.compensationErrors[0]).toContain('comp1 failed');
    });

    it('should set status to failed when compensation fails', async () => {
      saga.addStep('step1', vi.fn(), vi.fn().mockRejectedValue(new Error('comp fail')));
      saga.addStep('step2', vi.fn().mockRejectedValue(new Error('step fail')), vi.fn());

      await saga.execute();
      expect(saga.getStatus()).toBe(SAGA_STATUS.FAILED);
    });
  });

  describe('execute - first step fails', () => {
    it('should not call any compensations when no steps completed', async () => {
      const compensate = vi.fn();
      saga.addStep('step1', vi.fn().mockRejectedValue(new Error('fail')), compensate);

      const result = await saga.execute();
      expect(result.success).toBe(false);
      expect(result.completedSteps).toEqual([]);
      expect(compensate).not.toHaveBeenCalled();
    });
  });

  describe('execute - empty saga', () => {
    it('should succeed with no steps', async () => {
      const result = await saga.execute();
      expect(result.success).toBe(true);
      expect(result.completedSteps).toEqual([]);
    });
  });

  describe('persistLog', () => {
    it('should insert saga log into eva_saga_log', async () => {
      const mockDb = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'saga-log-1' },
                error: null,
              }),
            }),
          }),
        }),
      };

      saga.addStep('step1', vi.fn(), vi.fn());
      const result = await saga.execute();
      const logResult = await saga.persistLog(mockDb, result);

      expect(logResult.persisted).toBe(true);
      expect(logResult.id).toBe('saga-log-1');
      expect(mockDb.from).toHaveBeenCalledWith('eva_saga_log');
    });

    it('should return error when no db client', async () => {
      const result = await saga.persistLog(null, { completedSteps: [] });
      expect(result.persisted).toBe(false);
      expect(result.error).toBe('No database client provided');
    });

    it('should handle db insert error', async () => {
      const mockDb = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Table not found' },
              }),
            }),
          }),
        }),
      };

      const result = await saga.persistLog(mockDb, { completedSteps: [] });
      expect(result.persisted).toBe(false);
      expect(result.error).toBe('Table not found');
    });

    it('should handle thrown exceptions', async () => {
      const mockDb = {
        from: vi.fn().mockImplementation(() => { throw new Error('Connection lost'); }),
      };

      const result = await saga.persistLog(mockDb, { completedSteps: [] });
      expect(result.persisted).toBe(false);
      expect(result.error).toBe('Connection lost');
    });

    it('should include saga metadata in log', async () => {
      let capturedRow;
      const mockDb = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockImplementation((row) => {
            capturedRow = row;
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }),
              }),
            };
          }),
        }),
      };

      saga.addStep('step1', vi.fn(), vi.fn());
      const result = await saga.execute();
      await saga.persistLog(mockDb, result);

      expect(capturedRow.saga_id).toBe(saga.sagaId);
      expect(capturedRow.trace_id).toBe('trace-1');
      expect(capturedRow.venture_id).toBe('venture-1');
      expect(capturedRow.metadata.module_version).toBe(MODULE_VERSION);
      expect(capturedRow.steps_registered).toEqual(['step1']);
      expect(capturedRow.steps_completed).toEqual(['step1']);
    });
  });
});

describe('createArtifactCompensation', () => {
  it('should mark artifacts as not current', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    };

    const compensate = createArtifactCompensation(mockDb, ['art-1', 'art-2']);
    await compensate();

    expect(mockDb.from).toHaveBeenCalledWith('venture_artifacts');
  });

  it('should throw on db error', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ error: { message: 'update failed' } }),
        }),
      }),
    };

    const compensate = createArtifactCompensation(mockDb, ['art-1']);
    await expect(compensate()).rejects.toThrow('Artifact compensation failed');
  });

  it('should no-op when no artifactIds', async () => {
    const mockDb = { from: vi.fn() };
    const compensate = createArtifactCompensation(mockDb, []);
    await compensate(); // Should not throw
    expect(mockDb.from).not.toHaveBeenCalled();
  });

  it('should no-op when no db', async () => {
    const compensate = createArtifactCompensation(null, ['art-1']);
    await compensate(); // Should not throw
  });
});

describe('createStageCompensation', () => {
  it('should revert stage to previous value', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    };

    const compensate = createStageCompensation(mockDb, 'venture-1', 5);
    await compensate();

    expect(mockDb.from).toHaveBeenCalledWith('ventures');
  });

  it('should throw on db error', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: 'revert failed' } }),
        }),
      }),
    };

    const compensate = createStageCompensation(mockDb, 'venture-1', 5);
    await expect(compensate()).rejects.toThrow('Stage compensation failed');
  });

  it('should no-op when no db', async () => {
    const compensate = createStageCompensation(null, 'venture-1', 5);
    await compensate(); // Should not throw
  });

  it('should no-op when no ventureId', async () => {
    const mockDb = { from: vi.fn() };
    const compensate = createStageCompensation(mockDb, null, 5);
    await compensate(); // Should not throw
    expect(mockDb.from).not.toHaveBeenCalled();
  });
});

describe('createSagaCoordinator', () => {
  it('should return a SagaCoordinator instance', () => {
    const s = createSagaCoordinator({ ventureId: 'v1' });
    expect(s).toBeInstanceOf(SagaCoordinator);
    expect(s.ventureId).toBe('v1');
  });

  it('should work with no arguments', () => {
    const s = createSagaCoordinator();
    expect(s.sagaId).toBeDefined();
  });
});

describe('exports', () => {
  it('should export MODULE_VERSION', () => {
    expect(MODULE_VERSION).toBe('1.0.0');
  });

  it('should export SAGA_STATUS constants', () => {
    expect(Object.keys(SAGA_STATUS)).toHaveLength(5);
    expect(SAGA_STATUS.PENDING).toBe('pending');
    expect(SAGA_STATUS.COMPLETED).toBe('completed');
    expect(SAGA_STATUS.COMPENSATING).toBe('compensating');
    expect(SAGA_STATUS.COMPENSATED).toBe('compensated');
    expect(SAGA_STATUS.FAILED).toBe('failed');
  });
});
