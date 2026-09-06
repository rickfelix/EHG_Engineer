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

function makeFakeSupabase({ sds = [], signals = [], decisions = [], feedbackRows = [] } = {}) {
  const feedbackUpdates = [];
  return {
    _feedbackUpdates: feedbackUpdates,
    from(table) {
      if (table === 'strategic_directives_v2') {
        const api = { select: () => api, eq: () => api, then: (r) => r({ data: sds, error: null }) };
        return api;
      }
      if (table === 'session_coordination') {
        const api = { select: () => api, eq: () => api, gte: () => api, then: (r) => r({ data: signals, error: null }) };
        return api;
      }
      if (table === 'chairman_decisions') {
        const api = {
          select: () => api, eq: () => api, contains: () => api, neq: () => api, limit: () => api,
          maybeSingle: async () => ({ data: decisions[0] || null, error: null }),
          then: (r) => r({ data: decisions, error: null }),
        };
        return api;
      }
      if (table === 'feedback') {
        const api = {
          select: () => api, eq: () => api, contains: () => api,
          then: (r) => r({ data: feedbackRows, error: null }),
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
      feedbackRows: [{ id: 'fb-1' }],
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
      feedbackRows: [{ id: 'fb-1' }],
    });
    const result = await resolveAndVerifyClassifierDenial(sb, { decisionId: 'd1', action: 'approve' });
    expect(result.verified).toBe(false);
    expect(sb._feedbackUpdates.length).toBe(0);
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
