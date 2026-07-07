/**
 * QF-20260704-602 — directed WORK_ASSIGNMENT dispatch of quick_fixes was structurally broken:
 * some dispatch paths emit payload.qf_id (not sd_key/assigned_sd) for QF-specific directed
 * assignments, but extractSdFromAssignment() never recognized that field -- the whole
 * directed-assignment claim branch was silently skipped (no ack, no claim attempt). Confirmed
 * live: QF-20260704-726 (CRITICAL) starved 5+ hours through SIX directed assignments -- 4 of 6
 * carried ONLY payload.qf_id and never even reached tryClaim(). claim_sd itself is already
 * QF-aware (p_sd_id LIKE 'QF-%'); the gap was purely in the extraction step.
 *
 * GROOM ADDENDUM leg 2: the self-claim picker (selfClaimQuickFix) ordered candidates purely by
 * created_at, so a lower-severity QF filed earlier could self-claim ahead of a critical one
 * filed later (specimen: QF-20260704-717 medium claimed while QF-20260704-726 critical sat
 * beside it). sortQfCandidatesBySeverity fixes the ordering: severity DESC, then created_at ASC.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { extractSdFromAssignment, resolveCheckin, sortQfCandidatesBySeverity, QF_SEVERITY_RANK } = require('../../scripts/worker-checkin.cjs');

describe('extractSdFromAssignment — recognizes payload.qf_id (leg 1)', () => {
  it('returns qf_id when assigned_sd/sd_key are both absent', () => {
    expect(extractSdFromAssignment({ payload: { qf_id: 'QF-20260704-726' } })).toBe('QF-20260704-726');
  });

  it('assigned_sd still takes precedence over qf_id when both present', () => {
    expect(extractSdFromAssignment({ payload: { assigned_sd: 'QF-1', qf_id: 'QF-2' } })).toBe('QF-1');
  });

  it('sd_key still takes precedence over qf_id when both present', () => {
    expect(extractSdFromAssignment({ payload: { sd_key: 'QF-1', qf_id: 'QF-2' } })).toBe('QF-1');
  });

  it('falls through to available_sds when qf_id is absent (unchanged prior behavior)', () => {
    expect(extractSdFromAssignment({ payload: { available_sds: ['SD-X-001'] } })).toBe('SD-X-001');
  });

  it('returns null for a non-string/empty qf_id (defensive)', () => {
    expect(extractSdFromAssignment({ payload: { qf_id: '' } })).toBeNull();
    expect(extractSdFromAssignment({ payload: { qf_id: 123 } })).toBeNull();
  });
});

describe('resolveCheckin — a qf_id-only directed assignment now reaches the claim step (leg 1 integration)', () => {
  function fakeSbQf({ claimResult }) {
    return {
      rpc: () => Promise.resolve(claimResult),
      from(table) {
        const api = {
          select() { return this; }, eq() { return this; }, gte() { return this; },
          order() { return this; }, limit() { return this; }, is() { return this; },
          maybeSingle() {
            if (table === 'claude_sessions') return Promise.resolve({ data: { metadata: { role: 'worker' }, sd_key: null }, error: null });
            // A QF key genuinely misses in strategic_directives_v2 -- no row, no error.
            if (table === 'strategic_directives_v2') return Promise.resolve({ data: null, error: null });
            return Promise.resolve({ data: null, error: null });
          },
          insert() { return Promise.resolve({ error: null }); },
          update() { return { eq() { return Promise.resolve({ error: null }); } }; },
        };
        return api;
      },
    };
  }

  it('claims the QF when the WORK_ASSIGNMENT payload carries ONLY qf_id (the QF-726 repro shape)', async () => {
    const sb = fakeSbQf({ claimResult: { data: { success: true }, error: null } });
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [{ id: 'msg-qfid-only', message_type: 'WORK_ASSIGNMENT', payload: { qf_id: 'QF-20260704-726' } }];
    try {
      const res = await resolveCheckin(sb, 'sess-idle', { getCoordinator: async () => null });
      expect(res.action).toBe('claimed_assignment');
      expect(res.sd).toBe('QF-20260704-726');
    } finally {
      ws.getMessagesForSession = orig;
    }
  });
});

// QF-20260707-650: same bug class as leg 1, a different field-name variant. A directed_dispatch
// payload carrying the QF key as payload.qf (not qf_id) was silently skipped by extraction --
// confirmed live on QF-20260705-893's redispatch (session_coordination row 2a3cef4b).
describe('extractSdFromAssignment — recognizes payload.qf (QF-20260707-650)', () => {
  it('returns qf when assigned_sd/sd_key/qf_id are all absent', () => {
    expect(extractSdFromAssignment({ payload: { qf: 'QF-20260705-893' } })).toBe('QF-20260705-893');
  });

  it('qf_id still takes precedence over qf when both present', () => {
    expect(extractSdFromAssignment({ payload: { qf_id: 'QF-1', qf: 'QF-2' } })).toBe('QF-1');
  });

  it('assigned_sd/sd_key still take precedence over qf when present', () => {
    expect(extractSdFromAssignment({ payload: { assigned_sd: 'QF-1', qf: 'QF-2' } })).toBe('QF-1');
    expect(extractSdFromAssignment({ payload: { sd_key: 'QF-1', qf: 'QF-2' } })).toBe('QF-1');
  });

  it('falls through to available_sds when qf is absent (unchanged prior behavior)', () => {
    expect(extractSdFromAssignment({ payload: { available_sds: ['SD-X-001'] } })).toBe('SD-X-001');
  });

  it('returns null for a non-string/empty qf (defensive)', () => {
    expect(extractSdFromAssignment({ payload: { qf: '' } })).toBeNull();
    expect(extractSdFromAssignment({ payload: { qf: 123 } })).toBeNull();
  });
});

describe('sortQfCandidatesBySeverity (leg 2)', () => {
  it('orders critical before high before medium before low', () => {
    const qfs = [
      { id: 'low-1', severity: 'low', created_at: '2026-07-01T00:00:00Z' },
      { id: 'medium-1', severity: 'medium', created_at: '2026-07-01T00:00:00Z' },
      { id: 'critical-1', severity: 'critical', created_at: '2026-07-04T00:00:00Z' },
      { id: 'high-1', severity: 'high', created_at: '2026-07-01T00:00:00Z' },
    ];
    expect(sortQfCandidatesBySeverity(qfs).map(q => q.id)).toEqual(['critical-1', 'high-1', 'medium-1', 'low-1']);
  });

  it('reproduces the QF-717/726 specimen: a later-created critical still outranks an earlier medium', () => {
    const qfs = [
      { id: 'QF-20260704-717', severity: 'medium', created_at: '2026-07-04T10:00:00Z' },
      { id: 'QF-20260704-726', severity: 'critical', created_at: '2026-07-04T12:24:24Z' },
    ];
    expect(sortQfCandidatesBySeverity(qfs).map(q => q.id)).toEqual(['QF-20260704-726', 'QF-20260704-717']);
  });

  it('breaks ties within the same severity by created_at ascending (older first)', () => {
    const qfs = [
      { id: 'newer', severity: 'high', created_at: '2026-07-04T00:00:00Z' },
      { id: 'older', severity: 'high', created_at: '2026-07-01T00:00:00Z' },
    ];
    expect(sortQfCandidatesBySeverity(qfs).map(q => q.id)).toEqual(['older', 'newer']);
  });

  it('unranked/unknown severity sorts LAST, never ahead of a ranked item', () => {
    const qfs = [
      { id: 'unknown-sev', severity: undefined, created_at: '2026-07-01T00:00:00Z' },
      { id: 'low-sev', severity: 'low', created_at: '2026-07-04T00:00:00Z' },
    ];
    expect(sortQfCandidatesBySeverity(qfs).map(q => q.id)).toEqual(['low-sev', 'unknown-sev']);
  });

  it('handles empty/null input gracefully', () => {
    expect(sortQfCandidatesBySeverity([])).toEqual([]);
    expect(sortQfCandidatesBySeverity(null)).toEqual([]);
    expect(sortQfCandidatesBySeverity(undefined)).toEqual([]);
  });

  it('QF_SEVERITY_RANK is exported and ranks critical strictly ahead of the others', () => {
    expect(QF_SEVERITY_RANK.critical).toBeLessThan(QF_SEVERITY_RANK.high);
    expect(QF_SEVERITY_RANK.high).toBeLessThan(QF_SEVERITY_RANK.medium);
    expect(QF_SEVERITY_RANK.medium).toBeLessThan(QF_SEVERITY_RANK.low);
  });
});
