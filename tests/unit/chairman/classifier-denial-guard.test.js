/**
 * QF-20260906-881 — classifier-denial-guard.mjs.
 * classifyMigrationApplyState, sdKeyOwnsFile and recordPendingDecision are mocked (each already
 * tested where they live); these tests focus on this module's OWN control flow: candidate
 * selection from both sources, dedup-by-coverage, and the post-approval verifier bridge.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const recordPendingDecisionMock = vi.fn();
const classifyMock = vi.fn();

vi.mock('../../../lib/chairman/record-pending-decision.mjs', () => ({
  recordPendingDecision: (...args) => recordPendingDecisionMock(...args),
}));
vi.mock('../../../scripts/modules/handoff/executors/lead-final-approval/chairman-apply-state.js', () => ({
  classifyMigrationApplyState: (...args) => classifyMock(...args),
}));
vi.mock('../../../scripts/modules/handoff/executors/lead-final-approval/sd-key-file-ownership.js', () => ({
  sdKeyOwnsFile: (sdKey, filename) => filename.includes(sdKey.split('-').pop()),
}));

import { runClassifierDenialGuard, resolveAndVerifyClassifierDenial } from '../../../lib/chairman/classifier-denial-guard.mjs';

/** Deep-subset containment matching Postgres jsonb `@>` semantics closely enough for these tests:
 *  every key in `expected` must exist in `actual` with a (recursively) containing value. */
function jsonbContains(actual, expected) {
  if (expected === null || typeof expected !== 'object') return actual === expected;
  if (actual === null || typeof actual !== 'object') return false;
  return Object.entries(expected).every(([k, v]) => jsonbContains(actual[k], v));
}

function makeFakeSupabase({ sds = [], signals = [], decisions = [], feedbackRows = [] } = {}) {
  const feedbackUpdates = [];
  return {
    _feedbackUpdates: feedbackUpdates,
    from(table) {
      if (table === 'strategic_directives_v2') {
        const api = { select: () => api, eq: () => api, limit: () => api, then: (r) => r({ data: sds, error: null }) };
        return api;
      }
      if (table === 'session_coordination') {
        const api = { select: () => api, eq: () => api, gte: () => api, limit: () => api, then: (r) => r({ data: signals, error: null }) };
        return api;
      }
      if (table === 'chairman_decisions') {
        // Only .contains() actually narrows the result set here — the other chain methods
        // (select/eq/neq/limit) are no-ops on this fake, matching the fixture's real usage
        // (this module never varies its eq/neq predicates per-test).
        let filtered = decisions;
        const api = {
          select: () => api, eq: () => api, neq: () => api, limit: () => api,
          contains: (_col, value) => { filtered = filtered.filter((d) => jsonbContains(d.brief_data, value)); return api; },
          maybeSingle: async () => ({ data: decisions[0] || null, error: null }),
          then: (r) => r({ data: filtered, error: null }),
        };
        return api;
      }
      if (table === 'feedback') {
        let filtered = feedbackRows;
        const api = {
          select: () => api, eq: () => api, limit: () => api,
          contains: (_col, value) => { filtered = filtered.filter((f) => jsonbContains(f.metadata, value)); return api; },
          then: (r) => r({ data: filtered, error: null }),
          update: (patch) => ({ eq: (col, val) => { feedbackUpdates.push({ patch, id: val }); return Promise.resolve({ data: [{ id: val }], error: null }); } }),
        };
        return api;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  recordPendingDecisionMock.mockReset().mockResolvedValue({ recorded: true, id: 'dec-1' });
  classifyMock.mockReset();
});

describe('runClassifierDenialGuard', () => {
  it('records a chairman_approval row for an ungated SD declaring a NOT_APPLIED migration', async () => {
    classifyMock.mockResolvedValue({ files: [{ file: '20260906_foo.sql', status: 'NOT_APPLIED' }], error: null });
    const sb = makeFakeSupabase({
      sds: [{ sd_key: 'SD-TEST-001', metadata: { migration_files: ['20260906_foo.sql'] } }],
      signals: [],
      decisions: [],
    });
    const { recorded } = await runClassifierDenialGuard(sb);
    expect(recorded).toBe(1);
    const call = recordPendingDecisionMock.mock.calls[0][1];
    expect(call.decisionType).toBe('chairman_approval');
    expect(call.raisedBy).toBe('classifier-denial-guard');
    expect(call.context.sd_key).toBe('SD-TEST-001');
    expect(call.context.kind).toBe('migration_apply_wait');
  });

  it('skips an SD flagged requires_chairman_apply (already covered by the ceremonyPending path)', async () => {
    classifyMock.mockResolvedValue({ files: [{ file: '20260906_foo.sql', status: 'NOT_APPLIED' }], error: null });
    const sb = makeFakeSupabase({
      sds: [{ sd_key: 'SD-TEST-001', metadata: { migration_files: ['20260906_foo.sql'], requires_chairman_apply: true } }],
      signals: [],
      decisions: [],
    });
    const { recorded } = await runClassifierDenialGuard(sb);
    expect(recorded).toBe(0);
    expect(recordPendingDecisionMock).not.toHaveBeenCalled();
  });

  it('skips a candidate already covered by a pending chairman_approval row', async () => {
    classifyMock.mockResolvedValue({ files: [], error: null });
    const sb = makeFakeSupabase({
      sds: [],
      signals: [{ id: 's1', payload: { signal_type: 'stuck', sd_key: 'SD-TEST-002', body: 'applying it was denied by the auto-mode permission classifier: `node scripts/apply-migration.js x.sql`' } }],
      decisions: [{ id: 'existing', status: 'pending', brief_data: { context: { sd_key: 'SD-TEST-002', kind: 'classifier_denied_command' } } }],
    });
    const { recorded } = await runClassifierDenialGuard(sb);
    expect(recorded).toBe(0);
    expect(recordPendingDecisionMock).not.toHaveBeenCalled();
  });

  it('records a classifier_denied_command row from a matching /signal stuck row, extracting the command', async () => {
    classifyMock.mockResolvedValue({ files: [], error: null });
    const sb = makeFakeSupabase({
      sds: [],
      signals: [{ id: 's1', payload: { signal_type: 'stuck', sd_key: 'SD-TEST-003', body: 'applying it was denied by the auto-mode permission classifier: `node scripts/apply-migration.js foo.sql`' } }],
      decisions: [],
    });
    const { recorded } = await runClassifierDenialGuard(sb);
    expect(recorded).toBe(1);
    const call = recordPendingDecisionMock.mock.calls[0][1];
    expect(call.decisionType).toBe('chairman_approval');
    expect(call.context.sd_key).toBe('SD-TEST-003');
    expect(call.context.kind).toBe('classifier_denied_command');
    expect(call.context.command).toContain('apply-migration.js');
  });

  it('a second, distinct unapplied migration on the same SD+kind still surfaces (adversarial review finding)', async () => {
    // An earlier chairman_approval row already exists for this SD+kind, but for a DIFFERENT
    // file. Dedup keyed only on (sd_key, kind) would mask this genuinely new candidate forever.
    classifyMock.mockResolvedValue({ files: [{ file: '20260906_second.sql', status: 'NOT_APPLIED' }], error: null });
    const sb = makeFakeSupabase({
      sds: [{ sd_key: 'SD-TEST-001', metadata: { migration_files: ['20260906_second.sql'] } }],
      signals: [],
      decisions: [{ status: 'pending', brief_data: { context: { sd_key: 'SD-TEST-001', kind: 'migration_apply_wait', file: '20260906_first.sql' } } }],
    });
    const { recorded } = await runClassifierDenialGuard(sb);
    expect(recorded).toBe(1);
    const call = recordPendingDecisionMock.mock.calls[0][1];
    expect(call.context.file).toBe('20260906_second.sql');
  });

  it('reports (not silently drops) a scan failure while still processing the working source', async () => {
    classifyMock.mockRejectedValue(new Error('classifier_apply_state db timeout'));
    const sb = makeFakeSupabase({
      sds: [],
      signals: [{ id: 's1', payload: { signal_type: 'stuck', sd_key: 'SD-TEST-009', body: 'denied by the auto-mode permission classifier: `node scripts/leo-create-sd.js`' } }],
      decisions: [],
    });
    const { recorded, errors } = await runClassifierDenialGuard(sb);
    expect(recorded).toBe(1); // the signal-scan side still worked
    expect(errors.some((e) => e.error.includes('migration_apply_wait_scan_failed'))).toBe(true);
  });

  it('ignores stuck signals with no sd_key or no denial phrase', async () => {
    classifyMock.mockResolvedValue({ files: [], error: null });
    const sb = makeFakeSupabase({
      sds: [],
      signals: [
        { id: 's1', payload: { signal_type: 'stuck', body: 'denied by the auto-mode permission classifier' } }, // no sd_key
        { id: 's2', payload: { signal_type: 'stuck', sd_key: 'SD-TEST-004', body: 'unrelated blocker, no classifier mention' } },
      ],
      decisions: [],
    });
    const { recorded } = await runClassifierDenialGuard(sb);
    expect(recorded).toBe(0);
  });
});

describe('resolveAndVerifyClassifierDenial', () => {
  it('is a no-op for a non-approve action', async () => {
    const sb = makeFakeSupabase({ decisions: [{ brief_data: { context: { kind: 'migration_apply_wait', file: 'x.sql' } } }] });
    const result = await resolveAndVerifyClassifierDenial(sb, { decisionId: 'd1', action: 'reject' });
    expect(result.ran).toBe(false);
  });

  it('verifies a migration_apply_wait approval and resolves the covering completion-flag row', async () => {
    classifyMock.mockResolvedValue({ files: [{ file: 'x.sql', status: 'APPLIED' }], error: null });
    const sb = makeFakeSupabase({
      decisions: [{ brief_data: { context: { kind: 'migration_apply_wait', file: 'x.sql', sd_key: 'SD-TEST-005', command: 'node scripts/apply-migration.js x.sql' } } }],
      feedbackRows: [{ id: 'fb-1', description: 'x.sql was never applied to the live database', metadata: { source_sd: 'SD-TEST-005' } }],
    });
    const result = await resolveAndVerifyClassifierDenial(sb, { decisionId: 'd1', action: 'approve' });
    expect(result.verified).toBe(true);
    expect(result.closed).toBe(1);
    expect(sb._feedbackUpdates[0].patch.status).toBe('resolved');
  });

  it('does not close the flag when the migration is still not applied', async () => {
    classifyMock.mockResolvedValue({ files: [{ file: 'x.sql', status: 'NOT_APPLIED' }], error: null });
    const sb = makeFakeSupabase({
      decisions: [{ brief_data: { context: { kind: 'migration_apply_wait', file: 'x.sql', sd_key: 'SD-TEST-006' } } }],
      feedbackRows: [{ id: 'fb-1', description: 'x.sql was never applied to the live database', metadata: { source_sd: 'SD-TEST-006' } }],
    });
    const result = await resolveAndVerifyClassifierDenial(sb, { decisionId: 'd1', action: 'approve' });
    expect(result.verified).toBe(false);
    expect(sb._feedbackUpdates.length).toBe(0);
  });

  it('does NOT resolve an unrelated completion-flag finding for the same SD (adversarial review finding)', async () => {
    // Two completion-flag rows exist for this SD: one genuinely about x.sql, one unrelated
    // (e.g. harness friction noted at the SD's own completion). Approving the migration_apply_wait
    // decision must close only the matching row -- resolving both would silently discard the
    // unrelated finding the completion-flags mechanism exists to keep durable.
    classifyMock.mockResolvedValue({ files: [{ file: 'x.sql', status: 'APPLIED' }], error: null });
    const sb = makeFakeSupabase({
      decisions: [{ brief_data: { context: { kind: 'migration_apply_wait', file: 'x.sql', sd_key: 'SD-TEST-008', command: 'node scripts/apply-migration.js x.sql' } } }],
      feedbackRows: [
        { id: 'fb-related', description: 'x.sql needs to be applied', metadata: { source_sd: 'SD-TEST-008' } },
        { id: 'fb-unrelated', description: 'ship-preflight.js hung for 2 minutes and had to be skipped', metadata: { source_sd: 'SD-TEST-008' } },
      ],
    });
    const result = await resolveAndVerifyClassifierDenial(sb, { decisionId: 'd1', action: 'approve' });
    expect(result.closed).toBe(1);
    expect(sb._feedbackUpdates).toHaveLength(1);
    expect(sb._feedbackUpdates[0].id).toBe('fb-related');
  });

  it('has no verifier for classifier_denied_command (non-migration) kinds — never falsely closes', async () => {
    const sb = makeFakeSupabase({
      decisions: [{ brief_data: { context: { kind: 'classifier_denied_command', sd_key: 'SD-TEST-007', command: 'schtasks /Create ...' } } }],
      feedbackRows: [{ id: 'fb-1' }],
    });
    const result = await resolveAndVerifyClassifierDenial(sb, { decisionId: 'd1', action: 'approve' });
    expect(result.ran).toBe(false);
    expect(result.reason).toBe('no_verifier_for_kind');
    expect(sb._feedbackUpdates.length).toBe(0);
  });
});
