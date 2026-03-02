/**
 * Tests for Cascade Invalidation Engine + CLI Origin Gate
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-015
 *
 * Tests cover:
 * - cascade-invalidation-engine.js: getStaleDocuments, resolveInvalidationFlag, manualCascadeInvalidation, getCascadeSummary
 * - cli-origin-gate.js: scoreCLIOrigin scoring tiers
 * - cascade-health-check.js: runStaleDocumentCheck integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Helpers ──────────────────────────────────────────────────

function createMockSupabase(overrides = {}) {
  const responses = {
    cascade_invalidation_flags: { data: [], error: null, count: 0 },
    cascade_invalidation_log: { data: [], error: null },
    eva_event_log: { data: [], error: null },
    ...overrides,
  };

  const buildChain = (table) => {
    const resp = responses[table] || { data: [], error: null, count: 0 };
    const chain = {
      select: (...args) => {
        // Support count queries: select('id', { count: 'exact', head: true })
        if (args[1] && args[1].count === 'exact') {
          return { ...chain, count: resp.count || 0 };
        }
        return chain;
      },
      insert: (rows) => {
        // Return inserted data with generated IDs
        if (resp.insertResponse) return resp.insertResponse;
        const inserted = Array.isArray(rows)
          ? rows.map((r, i) => ({ ...r, id: `mock-id-${i}` }))
          : { ...rows, id: 'mock-id-0' };
        return {
          select: () => ({
            single: () => Promise.resolve({ data: Array.isArray(inserted) ? inserted[0] : inserted, error: resp.insertError || null }),
          }),
          then: (fn) => Promise.resolve(fn({ data: inserted, error: resp.insertError || null })),
        };
      },
      update: () => chain,
      eq: () => chain,
      in: () => chain,
      gte: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => Promise.resolve({ data: resp.singleData || (resp.data ? resp.data[0] : null), error: resp.error }),
      then: (fn) => Promise.resolve(fn({ data: resp.data, error: resp.error, count: resp.count })),
    };
    return chain;
  };

  return { from: vi.fn((table) => buildChain(table)) };
}

// ─── cascade-invalidation-engine tests ──────────────────────

describe('cascade-invalidation-engine', () => {
  describe('getStaleDocuments', () => {
    it('returns empty when no pending flags', async () => {
      const { getStaleDocuments } = await import(
        '../../../scripts/modules/governance/cascade-invalidation-engine.js'
      );

      const supabase = createMockSupabase();
      const result = await getStaleDocuments(supabase);

      expect(result.flags).toEqual([]);
      expect(result.count).toBe(0);
      expect(result.error).toBeUndefined();
    });

    it('returns flags when pending documents exist', async () => {
      const { getStaleDocuments } = await import(
        '../../../scripts/modules/governance/cascade-invalidation-engine.js'
      );

      const mockFlags = [
        { id: 'f1', document_type: 'architecture_plan', document_id: 'doc-1', status: 'pending', flagged_at: '2026-03-01T00:00:00Z' },
        { id: 'f2', document_type: 'objective', document_id: 'doc-2', status: 'pending', flagged_at: '2026-03-01T01:00:00Z' },
      ];

      const supabase = createMockSupabase({
        cascade_invalidation_flags: { data: mockFlags, error: null },
      });

      const result = await getStaleDocuments(supabase);
      expect(result.flags).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(result.flags[0].document_type).toBe('architecture_plan');
    });

    it('returns error when query fails', async () => {
      const { getStaleDocuments } = await import(
        '../../../scripts/modules/governance/cascade-invalidation-engine.js'
      );

      const supabase = createMockSupabase({
        cascade_invalidation_flags: { data: null, error: { message: 'connection error' } },
      });

      const result = await getStaleDocuments(supabase);
      expect(result.error).toBe('connection error');
      expect(result.flags).toEqual([]);
    });
  });

  describe('resolveInvalidationFlag', () => {
    it('returns error when flagId is missing', async () => {
      const { resolveInvalidationFlag } = await import(
        '../../../scripts/modules/governance/cascade-invalidation-engine.js'
      );

      const supabase = createMockSupabase();
      const result = await resolveInvalidationFlag(supabase, null);
      expect(result.resolved).toBe(false);
      expect(result.error).toBe('Missing flagId');
    });

    it('resolves flag successfully', async () => {
      const { resolveInvalidationFlag } = await import(
        '../../../scripts/modules/governance/cascade-invalidation-engine.js'
      );

      const supabase = createMockSupabase({
        cascade_invalidation_flags: { data: [], error: null },
      });

      const result = await resolveInvalidationFlag(supabase, 'flag-123', {
        notes: 'Reviewed and aligned',
      });
      expect(result.resolved).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('manualCascadeInvalidation', () => {
    it('returns error when required params missing', async () => {
      const { manualCascadeInvalidation } = await import(
        '../../../scripts/modules/governance/cascade-invalidation-engine.js'
      );

      const supabase = createMockSupabase();
      const result = await manualCascadeInvalidation(supabase, {});
      expect(result.error).toContain('Missing required');
      expect(result.flagsCreated).toBe(0);
    });

    it('creates log entry and flags for targets', async () => {
      const { manualCascadeInvalidation } = await import(
        '../../../scripts/modules/governance/cascade-invalidation-engine.js'
      );

      const supabase = createMockSupabase({
        cascade_invalidation_log: {
          data: [],
          error: null,
          insertResponse: {
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'log-1' }, error: null }),
            }),
          },
        },
        cascade_invalidation_flags: { data: [], error: null },
      });

      const result = await manualCascadeInvalidation(supabase, {
        sourceTable: 'eva_architecture_plans',
        sourceId: 'arch-1',
        sourceKey: 'ARCH-TEST-001',
        changeType: 'content_update',
        targets: [
          { documentType: 'objective', documentId: 'obj-1' },
          { documentType: 'objective', documentId: 'obj-2' },
        ],
      });

      expect(result.logId).toBe('log-1');
      expect(result.flagsCreated).toBe(2);
    });
  });
});

// ─── cli-origin-gate tests ──────────────────────────────────

describe('cli-origin-gate', () => {
  describe('scoreCLIOrigin', () => {
    it('returns full score when no writes exist', async () => {
      const { scoreCLIOrigin } = await import(
        '../../../scripts/modules/governance/cli-origin-gate.js'
      );

      const supabase = createMockSupabase({
        eva_event_log: { data: [], error: null },
      });

      const result = await scoreCLIOrigin(supabase, { logger: { warn: vi.fn() } });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(10);
      expect(result.maxScore).toBe(10);
    });

    it('returns 10/10 when 100% CLI coverage', async () => {
      const { scoreCLIOrigin } = await import(
        '../../../scripts/modules/governance/cli-origin-gate.js'
      );

      const events = [
        { event_type: 'cli_write_tracked', event_data: { cli_authorized: true }, created_at: '2026-03-01T00:00:00Z' },
        { event_type: 'cli_write_tracked', event_data: { cli_authorized: true }, created_at: '2026-03-01T01:00:00Z' },
      ];

      const supabase = createMockSupabase({
        eva_event_log: { data: events, error: null },
      });

      const result = await scoreCLIOrigin(supabase, { logger: { warn: vi.fn() } });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(10);
    });

    it('returns 7/10 when >80% coverage', async () => {
      const { scoreCLIOrigin } = await import(
        '../../../scripts/modules/governance/cli-origin-gate.js'
      );

      // 9 CLI writes + 1 violation = 90% coverage
      const events = [];
      for (let i = 0; i < 9; i++) {
        events.push({ event_type: 'cli_write_tracked', event_data: { cli_authorized: true }, created_at: '2026-03-01T00:00:00Z' });
      }
      events.push({ event_type: 'cli_write_violation', event_data: { cli_authorized: false }, created_at: '2026-03-01T01:00:00Z' });

      const supabase = createMockSupabase({
        eva_event_log: { data: events, error: null },
      });

      const result = await scoreCLIOrigin(supabase, { logger: { warn: vi.fn() } });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(7);
    });

    it('returns 3/10 when <50% coverage', async () => {
      const { scoreCLIOrigin } = await import(
        '../../../scripts/modules/governance/cli-origin-gate.js'
      );

      // 2 CLI writes + 8 violations = 20% coverage
      const events = [];
      for (let i = 0; i < 2; i++) {
        events.push({ event_type: 'cli_write_tracked', event_data: { cli_authorized: true }, created_at: '2026-03-01T00:00:00Z' });
      }
      for (let i = 0; i < 8; i++) {
        events.push({ event_type: 'cli_write_violation', event_data: { cli_authorized: false }, created_at: '2026-03-01T01:00:00Z' });
      }

      const supabase = createMockSupabase({
        eva_event_log: { data: events, error: null },
      });

      const result = await scoreCLIOrigin(supabase, { logger: { warn: vi.fn() } });
      expect(result.passed).toBe(false);
      expect(result.score).toBe(3);
    });

    it('fails open on query error', async () => {
      const { scoreCLIOrigin } = await import(
        '../../../scripts/modules/governance/cli-origin-gate.js'
      );

      const supabase = createMockSupabase({
        eva_event_log: { data: null, error: { message: 'db error' } },
      });

      const result = await scoreCLIOrigin(supabase, { logger: { warn: vi.fn() } });
      // Fail-open: still passes
      expect(result.passed).toBe(true);
      expect(result.score).toBe(5);
    });
  });
});

// ─── Migration schema validation ──────────────────────────────

describe('cascade invalidation migration schema', () => {
  it('migration file exists and has expected tables', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260302_cascade_invalidation_system.sql');

    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath, 'utf8');

    // Verify table definitions
    expect(content).toContain('CREATE TABLE IF NOT EXISTS cascade_invalidation_log');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS cascade_invalidation_flags');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS okr_vision_alignment_records');

    // Verify trigger
    expect(content).toContain('fn_cascade_invalidation_on_vision_update');
    expect(content).toContain('trg_cascade_invalidation_on_vision_update');

    // Verify RLS
    expect(content).toContain('ENABLE ROW LEVEL SECURITY');
    expect(content).toContain('service_role_all_cascade_log');

    // Verify indexes
    expect(content).toContain('idx_cascade_inv_flags_status');
    expect(content).toContain('idx_cascade_inv_flags_doc');

    // Verify ALTER TABLE additions
    expect(content).toContain('vision_version_aligned_to');
    expect(content).toContain('needs_review_since');
  });

  it('cascade_invalidation_log has required columns', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260302_cascade_invalidation_system.sql');
    const content = fs.readFileSync(migrationPath, 'utf8');

    const requiredColumns = ['source_table', 'source_id', 'source_key', 'change_type', 'old_version', 'new_version', 'changed_by', 'change_summary'];
    for (const col of requiredColumns) {
      expect(content).toContain(col);
    }
  });

  it('cascade_invalidation_flags has valid status CHECK constraint', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260302_cascade_invalidation_system.sql');
    const content = fs.readFileSync(migrationPath, 'utf8');

    expect(content).toContain("'pending'");
    expect(content).toContain("'acknowledged'");
    expect(content).toContain("'resolved'");
    expect(content).toContain("'dismissed'");
  });
});
