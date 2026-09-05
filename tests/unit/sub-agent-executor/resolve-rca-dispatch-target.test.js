/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C (FR-C1): lib/sub-agent-executor/executor.js used to
 * dispatch every sub-agent code with an SD UUID as the first execute() argument, but
 * lib/sub-agents/rca.js::execute(rcrId, ...) expects a root_cause_reports (RCR) row id --
 * the only one of the dispatchable modules with this shape. resolveRcaDispatchTarget() resolves
 * an existing OPEN RCR for the SD, or creates one, before dispatch. Tested directly (DI'd on a
 * mock supabase client) rather than via the full dispatch pipeline, since driving the real
 * lib/sub-agents/rca.js module through the generic dispatcher would require either mocking the
 * production file's dynamic-import target (fragile) or exercising the real 5-Whys analysis
 * (out of scope for this unit).
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveRcaDispatchTarget } from '../../../lib/sub-agent-executor/executor.js';

const SD_UUID = '00000000-0000-0000-0000-0000000000c1';

function makeMockSupabase({ existingRcr = null, insertedId = 'new-rcr-id', insertError = null, lookupError = null } = {}) {
  const inserts = [];
  return {
    inserts,
    from(table) {
      if (table !== 'root_cause_reports') throw new Error(`unexpected table: ${table}`);
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        limit() { return this; },
        maybeSingle: async () => ({ data: existingRcr, error: lookupError }),
        insert(record) {
          inserts.push(record);
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

  it('creates a new root_cause_reports row when no OPEN row exists for the SD', async () => {
    const supabase = makeMockSupabase({ existingRcr: null, insertedId: 'freshly-created-rcr' });
    const target = await resolveRcaDispatchTarget(supabase, SD_UUID, 'SD-TEST-C', {});
    expect(target).toBe('freshly-created-rcr');
    expect(supabase.inserts.length).toBe(1);
    expect(supabase.inserts[0]).toMatchObject({
      scope_type: 'SD',
      sd_id: SD_UUID,
      status: 'OPEN',
      trigger_source: 'AGENT_DISPATCH',
    });
  });

  it('falls back to the SD UUID (never returns undefined) when the RCR insert itself fails', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const supabase = makeMockSupabase({ existingRcr: null, insertError: { message: 'insert boom' } });
    const target = await resolveRcaDispatchTarget(supabase, SD_UUID, 'SD-TEST-C', {});
    expect(target).toBe(SD_UUID);
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
