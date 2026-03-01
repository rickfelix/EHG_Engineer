/**
 * Smoke Tests for SD-MAN-GEN-CORRECTIVE-VISION-GAP-009
 *
 * Verifies the configuration changes made for corrective vision gap 009:
 * 1. ConcurrentVentureOrchestrator default maxConcurrent = 20
 * 2. budget-exceeded handler uses 'medium' severity
 * 3. trackWriteSource is importable and functions correctly
 */

import { describe, it, expect, vi } from 'vitest';

// ── 1. ConcurrentVentureOrchestrator: DEFAULT_MAX_CONCURRENT = 20 ──────────

// Mock the orchestrator-trigger-types to avoid deep dependency chain
vi.mock('../../../lib/eva/orchestrator-trigger-types.js', () => ({
  classifyEvent: vi.fn(() => 'PRIORITY_QUEUE'),
  sortByUrgency: vi.fn((a) => a),
  TRIGGER_TYPE: {
    EVENT: 'EVENT',
    ROUND: 'ROUND',
    PRIORITY_QUEUE: 'PRIORITY_QUEUE',
  },
}));

// Mock eva-orchestrator to avoid deep imports
vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({
  processStage: vi.fn(),
}));

import { ConcurrentVentureOrchestrator } from '../../../lib/eva/concurrent-venture-orchestrator.js';

describe('ConcurrentVentureOrchestrator — DEFAULT_MAX_CONCURRENT', () => {
  it('uses maxConcurrent=20 by default when no config is provided', () => {
    const orch = new ConcurrentVentureOrchestrator({
      supabase: {},
      logger: { log: vi.fn() },
    });
    expect(orch.maxConcurrent).toBe(20);
  });

  it('uses maxConcurrent=20 when config object has no maxConcurrent property', () => {
    const orch = new ConcurrentVentureOrchestrator({
      supabase: {},
      logger: { log: vi.fn() },
      config: {},
    });
    expect(orch.maxConcurrent).toBe(20);
  });

  it('respects explicit maxConcurrent override', () => {
    const orch = new ConcurrentVentureOrchestrator({
      supabase: {},
      logger: { log: vi.fn() },
      config: { maxConcurrent: 10 },
    });
    expect(orch.maxConcurrent).toBe(10);
  });

  it('reports maxConcurrent=20 in getStatus()', () => {
    const orch = new ConcurrentVentureOrchestrator({
      supabase: {},
      logger: { log: vi.fn() },
    });
    const status = orch.getStatus();
    expect(status.maxConcurrent).toBe(20);
  });
});

// ── 2. budget-exceeded handler: severity = 'medium' ─────────────────────────

// We need to reset compute-posture mock per test, so import dynamically
describe('handleBudgetExceeded — severity is medium', () => {
  it('inserts medium severity into governance_audit_log in enforcement mode', async () => {
    // Import the handler directly
    const { handleBudgetExceeded } = await import(
      '../../../lib/eva/event-bus/handlers/budget-exceeded.js'
    );

    const insertedRows = [];
    const mockSupabase = {
      from: vi.fn((table) => ({
        insert: vi.fn((row) => {
          insertedRows.push({ table, row });
          return Promise.resolve({ data: null, error: null });
        }),
      })),
    };

    // Force enforcement mode via override
    const payload = {
      ventureId: 'v-test',
      currentBudget: 1000,
      threshold: 500,
      overage: 500,
      sdKey: 'SD-TEST-001',
    };

    // The handler reads getComputePosture() which now defaults to awareness.
    // To test governance_audit_log write (only happens in enforcement mode),
    // we need COMPUTE_POSTURE_MODE=enforcement
    const origEnv = process.env.COMPUTE_POSTURE_MODE;
    process.env.COMPUTE_POSTURE_MODE = 'enforcement';

    try {
      const result = await handleBudgetExceeded(payload, {
        supabase: mockSupabase,
        ventureId: 'v-test',
      });

      expect(result.blocked).toBe(true);
      expect(result.outcome).toBe('budget_blocked');

      // Find the governance_audit_log insert
      const govInsert = insertedRows.find((r) => r.table === 'governance_audit_log');
      expect(govInsert).toBeDefined();
      expect(govInsert.row.severity).toBe('medium');
      expect(govInsert.row.event_type).toBe('compute_budget_blocked');
    } finally {
      if (origEnv === undefined) {
        delete process.env.COMPUTE_POSTURE_MODE;
      } else {
        process.env.COMPUTE_POSTURE_MODE = origEnv;
      }
    }
  });

  it('returns budget_escalated (not blocked) in default awareness mode', async () => {
    const { handleBudgetExceeded } = await import(
      '../../../lib/eva/event-bus/handlers/budget-exceeded.js'
    );

    const insertedRows = [];
    const mockSupabase = {
      from: vi.fn((table) => ({
        insert: vi.fn((row) => {
          insertedRows.push({ table, row });
          return Promise.resolve({ data: null, error: null });
        }),
      })),
    };

    const origEnv = process.env.COMPUTE_POSTURE_MODE;
    delete process.env.COMPUTE_POSTURE_MODE;

    try {
      const result = await handleBudgetExceeded(
        { ventureId: 'v-awareness', currentBudget: 1000, threshold: 500, overage: 500 },
        { supabase: mockSupabase, ventureId: 'v-awareness' },
      );

      expect(result.blocked).toBe(false);
      expect(result.outcome).toBe('budget_escalated');

      // governance_audit_log should NOT be written in awareness mode
      // (only eva_audit_log and chairman_decisions)
      const govInsert = insertedRows.find((r) => r.table === 'governance_audit_log');
      expect(govInsert).toBeUndefined();
    } finally {
      if (origEnv === undefined) {
        delete process.env.COMPUTE_POSTURE_MODE;
      } else {
        process.env.COMPUTE_POSTURE_MODE = origEnv;
      }
    }
  });
});

// ── 3. trackWriteSource — importable and functional ─────────────────────────

describe('trackWriteSource — CLI authority tracking', () => {
  it('is importable from lib/eva/cli-write-gate.js', async () => {
    const mod = await import('../../../lib/eva/cli-write-gate.js');
    expect(typeof mod.trackWriteSource).toBe('function');
  });

  it('logs a CLI-authorized write without violation', async () => {
    const { trackWriteSource } = await import('../../../lib/eva/cli-write-gate.js');

    const mockSupabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    };

    const result = await trackWriteSource(mockSupabase, {
      table: 'sd_phase_handoffs',
      operation: 'insert',
      source: 'cli',
      command: 'handoff',
      sdKey: 'SD-TEST-001',
    });

    expect(result.logged).toBe(true);
    expect(result.violation).toBe(false);
  });

  it('detects violation for non-CLI write to tracked table', async () => {
    const { trackWriteSource } = await import('../../../lib/eva/cli-write-gate.js');

    const mockSupabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    };

    const result = await trackWriteSource(mockSupabase, {
      table: 'strategic_directives_v2',
      operation: 'update',
      source: 'manual',
      logger: { warn: vi.fn() },
    });

    expect(result.logged).toBe(true);
    expect(result.violation).toBe(true);
  });

  it('returns graceful error when supabase is missing', async () => {
    const { trackWriteSource } = await import('../../../lib/eva/cli-write-gate.js');

    const result = await trackWriteSource(null, {
      table: 'sd_phase_handoffs',
      operation: 'insert',
    });

    expect(result.logged).toBe(false);
    expect(result.error).toBe('Missing required parameters');
  });
});
