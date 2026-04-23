/**
 * SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-C
 * Unit tests for phase dual-write in the canonical results-storage.js writer.
 *
 * Covers:
 *   - phase is read from options.phase (canonical source)
 *   - phase falls back to results.phase, then results.metadata.phase
 *   - both the native `phase` column AND metadata.phase are populated (dual-write)
 *   - writer tolerates missing phase (writes phase: null, preserves existing metadata.phase)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Build a mocked supabase client that captures the record passed to insert().
 * Returns the inserted record via the chained .select().single() call.
 */
function makeMockSupabase(captureTarget) {
  return {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        gte() { return this; },
        order() { return this; },
        limit() { return Promise.resolve({ data: [], error: null }); },
        insert(record) {
          captureTarget.insertedTable = table;
          captureTarget.inserted = record;
          return {
            select() {
              return {
                single: async () => ({
                  data: { id: 'mock-row-id', ...record },
                  error: null
                })
              };
            }
          };
        },
        update(fields) {
          captureTarget.updatedTable = table;
          captureTarget.updated = fields;
          return {
            eq() {
              return {
                select() {
                  return {
                    single: async () => ({ data: { id: 'mock-row-id', ...fields }, error: null })
                  };
                }
              };
            }
          };
        }
      };
    }
  };
}

describe('storeSubAgentResults: phase dual-write (SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-C)', () => {
  const capture = {};
  let originalFetch;

  beforeEach(async () => {
    // Reset capture
    capture.inserted = null;
    capture.updated = null;
    capture.insertedTable = null;
    capture.updatedTable = null;

    // Stub the supabase client loader
    vi.doMock('../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(capture)
    }));

    // Stub the SD-id normalizer so it is a no-op.
    vi.doMock('../../scripts/modules/sd-id-normalizer.js', () => ({
      normalizeSDId: async (_s, v) => v
    }));

    // Stub createArtifact so compression paths don't fire.
    vi.doMock('../../lib/artifact-tools.js', () => ({
      createArtifact: async () => ({ artifact_id: 'a', token_count: 0, summary: '' })
    }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../lib/sub-agent-executor/supabase-client.js');
    vi.doUnmock('../../scripts/modules/sd-id-normalizer.js');
    vi.doUnmock('../../lib/artifact-tools.js');
  });

  it('writes phase to both native column and metadata when options.phase is provided (canonical source)', async () => {
    const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('TESTING', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90
    }, { phase: 'LEAD-TO-PLAN' });

    expect(capture.insertedTable).toBe('sub_agent_execution_results');
    const row = capture.inserted;
    expect(row.phase).toBe('LEAD-TO-PLAN');
    expect(row.metadata.phase).toBe('LEAD-TO-PLAN');
  });

  it('falls back to results.phase when options.phase is absent', async () => {
    const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      phase: 'PLAN-TO-EXEC'
    });

    const row = capture.inserted;
    expect(row.phase).toBe('PLAN-TO-EXEC');
    expect(row.metadata.phase).toBe('PLAN-TO-EXEC');
  });

  it('falls back to results.metadata.phase when neither options.phase nor results.phase is set', async () => {
    const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('SECURITY', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      metadata: { phase: 'EXEC-TO-PLAN', other: 'preserved' }
    });

    const row = capture.inserted;
    expect(row.phase).toBe('EXEC-TO-PLAN');
    expect(row.metadata.phase).toBe('EXEC-TO-PLAN');
    expect(row.metadata.other).toBe('preserved');
  });

  it('writes phase: null when no phase source is provided (graceful degradation)', async () => {
    const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('REGRESSION', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90
    });

    const row = capture.inserted;
    expect(row.phase).toBeNull();
    // No metadata.phase key should be added when phaseValue is null
    expect(row.metadata.phase).toBeUndefined();
  });

  it('prefers options.phase over results.phase and results.metadata.phase (source priority)', async () => {
    const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('TESTING', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      phase: 'PLAN-TO-LEAD',
      metadata: { phase: 'EXEC-TO-PLAN' }
    }, { phase: 'LEAD-FINAL-APPROVAL' });

    const row = capture.inserted;
    expect(row.phase).toBe('LEAD-FINAL-APPROVAL');
    expect(row.metadata.phase).toBe('LEAD-FINAL-APPROVAL');
  });

  it('ignores whitespace-only phase values and falls through to the next source', async () => {
    const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('TESTING', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      metadata: { phase: 'EXEC-TO-PLAN' }
    }, { phase: '   ' });

    const row = capture.inserted;
    expect(row.phase).toBe('EXEC-TO-PLAN');
    expect(row.metadata.phase).toBe('EXEC-TO-PLAN');
  });

  it('ignores non-string phase values (type guard)', async () => {
    const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('TESTING', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      phase: 123,
      metadata: { phase: 'VALID-PHASE' }
    });

    const row = capture.inserted;
    expect(row.phase).toBe('VALID-PHASE');
  });
});
