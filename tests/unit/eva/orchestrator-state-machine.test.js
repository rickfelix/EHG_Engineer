/**
 * Tests for Orchestrator State Machine
 * SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-G
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ORCHESTRATOR_STATES,
  VALID_TRANSITIONS,
  validateStateTransition,
  acquireProcessingLock,
  releaseProcessingLock,
  getOrchestratorState,
  MODULE_VERSION,
  _internal,
} from '../../../lib/eva/orchestrator-state-machine.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('ORCHESTRATOR_STATES', () => {
  it('should have exactly 4 states', () => {
    expect(Object.keys(ORCHESTRATOR_STATES)).toHaveLength(4);
  });

  it('should contain idle, processing, blocked, failed', () => {
    expect(ORCHESTRATOR_STATES.IDLE).toBe('idle');
    expect(ORCHESTRATOR_STATES.PROCESSING).toBe('processing');
    expect(ORCHESTRATOR_STATES.BLOCKED).toBe('blocked');
    expect(ORCHESTRATOR_STATES.FAILED).toBe('failed');
  });

  it('should be frozen', () => {
    expect(Object.isFrozen(ORCHESTRATOR_STATES)).toBe(true);
  });
});

describe('VALID_TRANSITIONS', () => {
  it('should allow idle → processing', () => {
    expect(VALID_TRANSITIONS[ORCHESTRATOR_STATES.IDLE]).toContain(ORCHESTRATOR_STATES.PROCESSING);
  });

  it('should allow processing → idle, blocked, failed', () => {
    const targets = VALID_TRANSITIONS[ORCHESTRATOR_STATES.PROCESSING];
    expect(targets).toContain(ORCHESTRATOR_STATES.IDLE);
    expect(targets).toContain(ORCHESTRATOR_STATES.BLOCKED);
    expect(targets).toContain(ORCHESTRATOR_STATES.FAILED);
  });

  it('should allow blocked → idle, processing', () => {
    const targets = VALID_TRANSITIONS[ORCHESTRATOR_STATES.BLOCKED];
    expect(targets).toContain(ORCHESTRATOR_STATES.IDLE);
    expect(targets).toContain(ORCHESTRATOR_STATES.PROCESSING);
  });

  it('should allow failed → idle, processing', () => {
    const targets = VALID_TRANSITIONS[ORCHESTRATOR_STATES.FAILED];
    expect(targets).toContain(ORCHESTRATOR_STATES.IDLE);
    expect(targets).toContain(ORCHESTRATOR_STATES.PROCESSING);
  });

  it('should NOT allow idle → blocked directly', () => {
    expect(VALID_TRANSITIONS[ORCHESTRATOR_STATES.IDLE]).not.toContain(ORCHESTRATOR_STATES.BLOCKED);
  });

  it('should NOT allow idle → failed directly', () => {
    expect(VALID_TRANSITIONS[ORCHESTRATOR_STATES.IDLE]).not.toContain(ORCHESTRATOR_STATES.FAILED);
  });

  it('should be frozen', () => {
    expect(Object.isFrozen(VALID_TRANSITIONS)).toBe(true);
  });
});

describe('validateStateTransition', () => {
  it('should accept valid transition idle → processing', () => {
    const result = validateStateTransition('idle', 'processing');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should accept valid transition processing → idle', () => {
    const result = validateStateTransition('processing', 'idle');
    expect(result.valid).toBe(true);
  });

  it('should accept valid transition processing → blocked', () => {
    const result = validateStateTransition('processing', 'blocked');
    expect(result.valid).toBe(true);
  });

  it('should accept valid transition processing → failed', () => {
    const result = validateStateTransition('processing', 'failed');
    expect(result.valid).toBe(true);
  });

  it('should accept valid transition blocked → processing (retry)', () => {
    const result = validateStateTransition('blocked', 'processing');
    expect(result.valid).toBe(true);
  });

  it('should accept valid transition failed → idle (reset)', () => {
    const result = validateStateTransition('failed', 'idle');
    expect(result.valid).toBe(true);
  });

  it('should reject invalid transition idle → blocked', () => {
    const result = validateStateTransition('idle', 'blocked');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid transition');
  });

  it('should reject invalid transition idle → failed', () => {
    const result = validateStateTransition('idle', 'failed');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid transition');
  });

  it('should reject same-state transition', () => {
    const result = validateStateTransition('idle', 'idle');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cannot transition to same state');
  });

  it('should reject unknown source state', () => {
    const result = validateStateTransition('unknown', 'idle');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown state');
  });

  it('should reject unknown target state', () => {
    const result = validateStateTransition('idle', 'unknown');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown state');
  });
});

describe('acquireProcessingLock', () => {
  let mockDb;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should acquire lock when venture is idle', async () => {
    mockDb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'venture-1', orchestrator_state: 'processing' },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const result = await acquireProcessingLock(mockDb, 'venture-1', { logger: silentLogger });
    expect(result.acquired).toBe(true);
    expect(result.lockId).toBeDefined();
    expect(result.lockId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should reject lock when venture is already processing', async () => {
    mockDb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'No rows' },
                }),
              }),
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { orchestrator_state: 'processing' },
              error: null,
            }),
          }),
        }),
      }),
    };

    const result = await acquireProcessingLock(mockDb, 'venture-1', { logger: silentLogger });
    expect(result.acquired).toBe(false);
    expect(result.error).toBe('CONCURRENT_EXECUTION');
    expect(result.previousState).toBe('processing');
  });

  it('should return error when no db client', async () => {
    const result = await acquireProcessingLock(null, 'venture-1', { logger: silentLogger });
    expect(result.acquired).toBe(false);
    expect(result.error).toContain('Missing');
  });

  it('should return error when no ventureId', async () => {
    const result = await acquireProcessingLock({}, null, { logger: silentLogger });
    expect(result.acquired).toBe(false);
    expect(result.error).toContain('Missing');
  });

  it('should handle thrown exceptions', async () => {
    mockDb = {
      from: vi.fn().mockImplementation(() => { throw new Error('Connection lost'); }),
    };

    const result = await acquireProcessingLock(mockDb, 'venture-1', { logger: silentLogger });
    expect(result.acquired).toBe(false);
    expect(result.error).toBe('Connection lost');
  });
});

describe('releaseProcessingLock', () => {
  let mockDb;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should release lock and transition to idle', async () => {
    mockDb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'venture-1', orchestrator_state: 'idle' },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const result = await releaseProcessingLock(mockDb, 'venture-1', { logger: silentLogger });
    expect(result.released).toBe(true);
    expect(result.newState).toBe('idle');
  });

  it('should release lock with specific lockId', async () => {
    mockDb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'venture-1', orchestrator_state: 'idle' },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const result = await releaseProcessingLock(mockDb, 'venture-1', {
      lockId: 'lock-123',
      logger: silentLogger,
    });
    expect(result.released).toBe(true);
  });

  it('should transition to blocked state', async () => {
    mockDb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'venture-1', orchestrator_state: 'blocked' },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const result = await releaseProcessingLock(mockDb, 'venture-1', {
      targetState: 'blocked',
      logger: silentLogger,
    });
    expect(result.released).toBe(true);
    expect(result.newState).toBe('blocked');
  });

  it('should transition to failed state', async () => {
    mockDb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'venture-1', orchestrator_state: 'failed' },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const result = await releaseProcessingLock(mockDb, 'venture-1', {
      targetState: 'failed',
      logger: silentLogger,
    });
    expect(result.released).toBe(true);
    expect(result.newState).toBe('failed');
  });

  it('should reject invalid target state from processing', async () => {
    const result = await releaseProcessingLock({}, 'venture-1', {
      targetState: 'processing',
      logger: silentLogger,
    });
    expect(result.released).toBe(false);
    expect(result.error).toContain('Cannot transition to same state');
  });

  it('should fail when lock mismatch', async () => {
    mockDb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'No rows' },
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const result = await releaseProcessingLock(mockDb, 'venture-1', {
      lockId: 'wrong-lock',
      logger: silentLogger,
    });
    expect(result.released).toBe(false);
    expect(result.error).toContain('Lock release failed');
  });

  it('should return error when no db client', async () => {
    const result = await releaseProcessingLock(null, 'venture-1', { logger: silentLogger });
    expect(result.released).toBe(false);
    expect(result.error).toContain('Missing');
  });

  it('should handle thrown exceptions', async () => {
    mockDb = {
      from: vi.fn().mockImplementation(() => { throw new Error('DB error'); }),
    };

    const result = await releaseProcessingLock(mockDb, 'venture-1', { logger: silentLogger });
    expect(result.released).toBe(false);
    expect(result.error).toBe('DB error');
  });
});

describe('getOrchestratorState', () => {
  it('should return current state', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                orchestrator_state: 'processing',
                orchestrator_lock_id: 'lock-1',
                orchestrator_lock_acquired_at: '2026-02-08T12:00:00Z',
              },
              error: null,
            }),
          }),
        }),
      }),
    };

    const result = await getOrchestratorState(mockDb, 'venture-1');
    expect(result.state).toBe('processing');
    expect(result.lockId).toBe('lock-1');
    expect(result.lockAcquiredAt).toBe('2026-02-08T12:00:00Z');
  });

  it('should default to idle when state is null', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                orchestrator_state: null,
                orchestrator_lock_id: null,
                orchestrator_lock_acquired_at: null,
              },
              error: null,
            }),
          }),
        }),
      }),
    };

    const result = await getOrchestratorState(mockDb, 'venture-1');
    expect(result.state).toBe('idle');
  });

  it('should return idle with error when no db', async () => {
    const result = await getOrchestratorState(null, 'venture-1');
    expect(result.state).toBe('idle');
    expect(result.error).toContain('Missing');
  });

  it('should return idle with error when venture not found', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          }),
        }),
      }),
    };

    const result = await getOrchestratorState(mockDb, 'venture-1');
    expect(result.state).toBe('idle');
    expect(result.error).toBe('Not found');
  });

  it('should handle thrown exceptions', async () => {
    const mockDb = {
      from: vi.fn().mockImplementation(() => { throw new Error('Boom'); }),
    };

    const result = await getOrchestratorState(mockDb, 'venture-1');
    expect(result.state).toBe('idle');
    expect(result.error).toBe('Boom');
  });
});

describe('exports', () => {
  it('should export MODULE_VERSION', () => {
    expect(MODULE_VERSION).toBe('1.0.0');
  });

  it('should export _internal with ORCHESTRATOR_STATES', () => {
    expect(_internal.ORCHESTRATOR_STATES).toBe(ORCHESTRATOR_STATES);
  });

  it('should export _internal with VALID_TRANSITIONS', () => {
    expect(_internal.VALID_TRANSITIONS).toBe(VALID_TRANSITIONS);
  });
});
