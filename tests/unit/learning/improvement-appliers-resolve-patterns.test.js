/**
 * SD-LEO-INFRA-009-LEAF-FORMALIZE-001 (C-009 leaf 2, FR-2): resolvePatterns() is
 * migrated onto the canonical closeIssuePatterns() gate. Verifies the translation from
 * closeIssuePatterns()'s {resolved, deferred} shape back into resolvePatterns()'s
 * original per-pattern {pattern_id, success, error} return contract (decision-management.js
 * still relies on that shape via patternResults.filter(r => r.success)).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const closeIssuePatternsMock = vi.fn();
const insertedPayloads = [];
const queueUpdateCalls = [];

// SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001 (FR-3a regression coverage, PLAN_VERIFICATION finding
// G-2): the write-side fix (every leo_protocol_sections insert() sets publication_status) had
// zero test exercising the real write path -- only synthetic-fixture reader tests existed. This
// fake client is a minimal chainable stub, not a real Supabase client, but it captures the exact
// object passed to .insert() the same way the real applyImprovement() dispatcher does.
function makeChain() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    single: () => Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'not found' } }),
  };
  return chain;
}
const fakeSupabase = {
  from: (table) => ({
    ...makeChain(),
    insert: (payload) => {
      insertedPayloads.push({ table, payload });
      return Promise.resolve({ error: null });
    },
    update: (patch) => ({
      eq: (...args) => { queueUpdateCalls.push({ table, patch, args }); return Promise.resolve({ error: null }); },
    }),
  }),
};

vi.mock('../../../lib/governance/pattern-closure.js', () => ({
  closeIssuePatterns: (...args) => closeIssuePatternsMock(...args),
}));
vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => fakeSupabase,
}));
vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

const { resolvePatterns, applyImprovement } = await import('../../../scripts/modules/learning/improvement-appliers.js');

describe('FR-3a regression (SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001): applyImprovement -> PROTOCOL_SECTION sets publication_status on the real write path', () => {
  beforeEach(() => {
    insertedPayloads.length = 0;
    queueUpdateCalls.length = 0;
  });

  it('inserting a PROTOCOL_SECTION improvement through applyImprovement() lands a non-null metadata.publication_status', async () => {
    const improvement = {
      id: 'imp-write-path-1',
      improvement_type: 'PROTOCOL_SECTION',
      target_table: 'leo_protocol_sections',
      assigned_sd_id: 'SD-TEST-WRITE-PATH-001',
      payload: { section_type: 'write_path_probe', title: 'probe', content: 'probe content' },
    };

    const result = await applyImprovement(improvement);

    expect(result.success).toBe(true);
    expect(insertedPayloads).toHaveLength(1);
    expect(insertedPayloads[0].table).toBe('leo_protocol_sections');
    expect(insertedPayloads[0].payload.metadata.publication_status).toBe('file');
    expect(insertedPayloads[0].payload.metadata.publication_note).toContain('/learn applier');
    // provenance is still derived from the trusted ctx, not the caller -- the FR-3a fix must not
    // regress the sibling SD's provenance guarantee.
    expect(insertedPayloads[0].payload.metadata.provenance).toEqual({
      sd_key: 'SD-TEST-WRITE-PATH-001', actor_type: 'sd', actor_id: 'SD-TEST-WRITE-PATH-001',
    });
  });

  it('a caller-supplied publication_status cannot survive the sanitizer + FR-3a merge (it is not in ALLOWED_SECTION_COLUMNS, and FR-3a\'s stamp always wins for metadata sub-keys)', async () => {
    const improvement = {
      id: 'imp-write-path-2',
      improvement_type: 'PROTOCOL_SECTION',
      target_table: 'leo_protocol_sections',
      payload: { section_type: 'write_path_probe_2', title: 'probe', content: 'probe content', publication_status: 'HACKED' },
    };

    await applyImprovement(improvement);

    expect(insertedPayloads[0].payload.publication_status).toBeUndefined();
    expect(insertedPayloads[0].payload.metadata.publication_status).toBe('file');
  });
});

describe('resolvePatterns — routed through closeIssuePatterns() (FR-2)', () => {
  beforeEach(() => {
    closeIssuePatternsMock.mockClear();
  });

  it('works without a single sdId (patterns spanning multiple assigned_sd_id values), passing patternIds only', async () => {
    closeIssuePatternsMock.mockResolvedValueOnce({ resolved: ['PAT-A', 'PAT-B'], deferred: [] });

    const results = await resolvePatterns(['PAT-A', 'PAT-B'], 'imp-1');

    expect(closeIssuePatternsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ patternIds: ['PAT-A', 'PAT-B'] })
    );
    expect(closeIssuePatternsMock.mock.calls[0][1].sdId).toBeUndefined();
    expect(results).toEqual([
      { pattern_id: 'PAT-A', success: true },
      { pattern_id: 'PAT-B', success: true },
    ]);
  });

  it('maps a deferred pattern back to success:false with the deferral reason', async () => {
    closeIssuePatternsMock.mockResolvedValueOnce({
      resolved: ['PAT-A'],
      deferred: [{ pattern_id: 'PAT-B', reason: 'missing prevention_checklist (no named guard/gate/test)' }],
    });

    const results = await resolvePatterns(['PAT-A', 'PAT-B'], 'imp-2');

    expect(results).toEqual([
      { pattern_id: 'PAT-A', success: true },
      { pattern_id: 'PAT-B', success: false, error: 'missing prevention_checklist (no named guard/gate/test)' },
    ]);
  });

  it('returns [] for an empty/undefined patternIds list without calling closeIssuePatterns', async () => {
    expect(await resolvePatterns([], 'imp-3')).toEqual([]);
    expect(await resolvePatterns(undefined, 'imp-3')).toEqual([]);
    expect(closeIssuePatternsMock).not.toHaveBeenCalled();
  });
});
