/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C (FR-C1): lib/sub-agent-executor/executor.js used to
 * dispatch every sub-agent code with an SD UUID as the first execute() argument, but
 * lib/sub-agents/rca.js::execute(rcrId, ...) expects a root_cause_reports (RCR) row id --
 * the only one of the dispatchable modules with this shape. resolveRcaDispatchTarget() resolves
 * an existing OPEN RCR THIS mechanism created for the SD, or creates one, before dispatch.
 * Tested directly (DI'd on a mock supabase client) rather than via the full dispatch pipeline,
 * since driving the real lib/sub-agents/rca.js module through the generic dispatcher would
 * require either mocking the production file's dynamic-import target (fragile) or exercising
 * the real 5-Whys analysis (out of scope for this unit).
 *
 * EXEC-phase TESTING re-verify (evidence 28382f71) found the ORIGINAL version of this test
 * asserted `trigger_source: 'AGENT_DISPATCH'` -- a value that violates the LIVE
 * root_cause_reports_trigger_source_check CHECK constraint, confirmed against the real table.
 * The mock never validated payloads against real constraints, so the suite stayed green while
 * FR-C1 was a complete no-op in production (every real INSERT failed, silently falling back to
 * the SD UUID -- the exact pre-fix defect). The mock's insert() now simulates that constraint,
 * so a future regression of the trigger_source value fails THIS test, not just a live DB probe.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveRcaDispatchTarget } from '../../../lib/sub-agent-executor/executor.js';

const SD_UUID = '00000000-0000-0000-0000-0000000000c1';

// Mirrors the live root_cause_reports_trigger_source_check CHECK constraint (confirmed via
// direct probe against the real table, TESTING evidence 28382f71).
const VALID_TRIGGER_SOURCES = new Set(['SUB_AGENT', 'MANUAL', 'TEST_FAILURE', 'CI_PIPELINE']);

function makeMockSupabase({ existingRcr = null, insertedId = 'new-rcr-id', insertError = null, lookupError = null } = {}) {
  const inserts = [];
  const eqCalls = [];
  return {
    inserts,
    eqCalls,
    from(table) {
      if (table !== 'root_cause_reports') throw new Error(`unexpected table: ${table}`);
      return {
        select() { return this; },
        eq(col, val) { eqCalls.push([col, val]); return this; },
        order() { return this; },
        limit() { return this; },
        maybeSingle: async () => ({ data: existingRcr, error: lookupError }),
        insert(record) {
          inserts.push(record);
          // Simulate the real CHECK constraint -- an invalid trigger_source must fail the
          // insert exactly as Postgres would (23514), not silently succeed.
          if (!VALID_TRIGGER_SOURCES.has(record.trigger_source)) {
            return {
              select: () => ({
                single: async () => ({
                  data: null,
                  error: { message: 'new row for relation "root_cause_reports" violates check constraint "root_cause_reports_trigger_source_check"' },
                }),
              }),
            };
          }
          return {
            select: () => ({
              single: async () => (insertError ? { data: null, error: insertError } : { data: { id: insertedId }, error: null }),
            }),
          };
        },
      };
    },
  };
}

describe('SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C FR-C1: resolveRcaDispatchTarget', () => {
  it('reuses an existing OPEN root_cause_reports row for the SD instead of creating a duplicate', async () => {
    const supabase = makeMockSupabase({ existingRcr: { id: 'existing-open-rcr' } });
    const target = await resolveRcaDispatchTarget(supabase, SD_UUID, 'SD-TEST-C', {});
    expect(target).toBe('existing-open-rcr');
    expect(supabase.inserts.length).toBe(0);
  });

  it('scopes the reuse lookup to rows THIS mechanism created (trigger_source=SUB_AGENT), never an unrelated OPEN row', async () => {
    const supabase = makeMockSupabase({ existingRcr: { id: 'existing-open-rcr' } });
    await resolveRcaDispatchTarget(supabase, SD_UUID, 'SD-TEST-C', {});
    expect(supabase.eqCalls).toContainEqual(['trigger_source', 'SUB_AGENT']);
  });

  it('creates a new root_cause_reports row with a trigger_source value the live CHECK constraint actually accepts', async () => {
    const supabase = makeMockSupabase({ existingRcr: null, insertedId: 'freshly-created-rcr' });
    const target = await resolveRcaDispatchTarget(supabase, SD_UUID, 'SD-TEST-C', {});
    expect(target).toBe('freshly-created-rcr');
    expect(supabase.inserts.length).toBe(1);
    expect(supabase.inserts[0]).toMatchObject({
      scope_type: 'SD',
      sd_id: SD_UUID,
      status: 'OPEN',
    });
    expect(VALID_TRIGGER_SOURCES.has(supabase.inserts[0].trigger_source), `trigger_source '${supabase.inserts[0].trigger_source}' must satisfy the live CHECK constraint`).toBe(true);
  });

  it('throws (does NOT silently fall back to the SD UUID) when the RCR insert itself fails', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const supabase = makeMockSupabase({ existingRcr: null, insertError: { message: 'insert boom' } });
    await expect(resolveRcaDispatchTarget(supabase, SD_UUID, 'SD-TEST-C', {})).rejects.toThrow(/insert boom/);
    consoleSpy.mockRestore();
  });

  it('does not throw when the OPEN-row lookup itself errors -- falls through to create', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const supabase = makeMockSupabase({ existingRcr: null, lookupError: { message: 'lookup boom' }, insertedId: 'created-after-lookup-error' });
    const target = await resolveRcaDispatchTarget(supabase, SD_UUID, 'SD-TEST-C', {});
    expect(target).toBe('created-after-lookup-error');
    consoleSpy.mockRestore();
  });
});
