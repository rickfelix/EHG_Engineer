// SD-REFILL-00QQ60BN — the already-MERGED reconcile path (orchestrator.js) set status='completed'
// WITHOUT stamping the verification columns, so the completed_requires_verification CHECK
//   (status='completed') AND ((tests_passing AND uat_verified) OR force_completed)
// rejected the UPDATE forever for any QF not pre-stamped — the reconcile printed
// "Could not reconcile QF record (non-fatal)" on every re-run and the QF stayed in_progress with
// a merged PR (witnessed on QF-20260610-541 / PR #4587). buildMergedReconcileUpdate now stamps
// tests_passing=true (merged PR = CI witness) + force_completed=true + an audit note, satisfying
// the CHECK without fabricating uat_verified.

import { describe, it, expect } from 'vitest';
import { buildMergedReconcileUpdate } from '../../../scripts/modules/complete-quick-fix/orchestrator.js';

// Mirror of the live completed_requires_verification CHECK predicate (asserted against the DB
// constraint def: (tests_passing AND uat_verified) OR force_completed when status='completed').
const satisfiesCheck = (u) =>
  u.status !== 'completed' || ((u.tests_passing === true && u.uat_verified === true) || u.force_completed === true);

describe('buildMergedReconcileUpdate (SD-REFILL-00QQ60BN)', () => {
  const prUrl = 'https://github.com/rickfelix/EHG_Engineer/pull/4587';
  const nowIso = '2026-06-22T16:00:00.000Z';

  it('produces an UPDATE that satisfies completed_requires_verification for an un-stamped QF', () => {
    const qf = { tests_passing: null, uat_verified: null, force_completed: null, verification_notes: null };
    const u = buildMergedReconcileUpdate({ qf, prUrl, mergeSha: 'abc123', nowIso });
    expect(u.status).toBe('completed');
    expect(u.force_completed).toBe(true);      // the CHECK escape used — UAT did not re-run here
    expect(u.tests_passing).toBe(true);        // merged PR = CI witness
    expect(satisfiesCheck(u)).toBe(true);
  });

  it('does NOT fabricate uat_verified (honest reconcile — force_completed carries the CHECK)', () => {
    const u = buildMergedReconcileUpdate({ qf: {}, prUrl, mergeSha: null, nowIso });
    expect(u.uat_verified).toBeUndefined();
  });

  it('records an audit note referencing the merged PR', () => {
    const u = buildMergedReconcileUpdate({ qf: {}, prUrl, mergeSha: null, nowIso });
    expect(u.verification_notes).toContain(prUrl);
    expect(u.verification_notes).toMatch(/merged/i);
  });

  it('appends to (does not clobber) an existing verification_notes', () => {
    const u = buildMergedReconcileUpdate({ qf: { verification_notes: 'prior note' }, prUrl, mergeSha: null, nowIso });
    expect(u.verification_notes.startsWith('prior note | ')).toBe(true);
    expect(u.verification_notes).toContain(prUrl);
  });

  it('preserves an existing completed_at and falls back to nowIso otherwise', () => {
    expect(buildMergedReconcileUpdate({ qf: { completed_at: '2026-01-01T00:00:00.000Z' }, prUrl, nowIso }).completed_at)
      .toBe('2026-01-01T00:00:00.000Z');
    expect(buildMergedReconcileUpdate({ qf: {}, prUrl, nowIso }).completed_at).toBe(nowIso);
  });

  it('carries pr_url and mergeSha through', () => {
    const u = buildMergedReconcileUpdate({ qf: {}, prUrl, mergeSha: 'deadbeef', nowIso });
    expect(u.pr_url).toBe(prUrl);
    expect(u.commit_sha).toBe('deadbeef');
  });
});
