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

  // QF-20260725-691: terminal completion now requires an explicit scope attestation, so the
  // SD-REFILL-00QQ60BN CHECK-satisfaction contract is pinned on the ATTESTED path — the path that
  // still writes status='completed'. The assertions themselves are unchanged.
  const ATTEST = 'coordinator a59441f4: both surfaces verified';

  it('produces an UPDATE that satisfies completed_requires_verification for an un-stamped QF', () => {
    const qf = { tests_passing: null, uat_verified: null, force_completed: null, verification_notes: null };
    const u = buildMergedReconcileUpdate({ qf, prUrl, mergeSha: 'abc123', nowIso, scopeAcceptedBy: ATTEST });
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
    expect(buildMergedReconcileUpdate({ qf: { completed_at: '2026-01-01T00:00:00.000Z' }, prUrl, nowIso, scopeAcceptedBy: ATTEST }).completed_at)
      .toBe('2026-01-01T00:00:00.000Z');
    expect(buildMergedReconcileUpdate({ qf: {}, prUrl, nowIso, scopeAcceptedBy: ATTEST }).completed_at).toBe(nowIso);
  });

  it('carries pr_url and mergeSha through', () => {
    const u = buildMergedReconcileUpdate({ qf: {}, prUrl, mergeSha: 'deadbeef', nowIso });
    expect(u.pr_url).toBe(prUrl);
    expect(u.commit_sha).toBe('deadbeef');
  });
});

/**
 * QF-20260725-691 — the witness is TRUE, it just witnesses the WRONG PROPOSITION. A merged PR
 * proves CODE LANDED; terminal `completed` asserts SCOPE WAS SATISFIED. Silently substituting one
 * for the other is invisible because the merge really did happen. Demonstrated by QF-20260725-638:
 * it named two surfaces, one shipped, it reached completed anyway, and the remainder had to be
 * re-filed as QF-20260725-639. So the merge witness alone now lands NON-TERMINAL.
 */
describe('buildMergedReconcileUpdate — merge witness is not scope acceptance (QF-20260725-691)', () => {
  const prUrl = 'https://github.com/rickfelix/EHG_Engineer/pull/6471';
  const nowIso = '2026-07-25T18:00:00.000Z';

  it('without an attestation it does NOT reach terminal completed', () => {
    const u = buildMergedReconcileUpdate({ qf: { id: 'QF-X' }, prUrl, mergeSha: 'abc', nowIso });
    expect(u.status).toBe('in_progress');
    expect(u.status).not.toBe('completed');
  });

  it('without an attestation it asserts no completion facts (no completed_at, no force_completed)', () => {
    const u = buildMergedReconcileUpdate({ qf: { id: 'QF-X' }, prUrl, mergeSha: 'abc', nowIso });
    expect(u.completed_at).toBeUndefined();
    expect(u.force_completed).toBeUndefined();
    expect(u.uat_verified).toBeUndefined();
  });

  it('still records the TRUE fact — the merge — and says scope acceptance is outstanding', () => {
    const u = buildMergedReconcileUpdate({ qf: { id: 'QF-X' }, prUrl, mergeSha: 'abc', nowIso });
    expect(u.pr_url).toBe(prUrl);
    expect(u.commit_sha).toBe('abc');
    expect(u.tests_passing).toBe(true); // a merged PR IS a genuine CI witness
    expect(u.verification_notes).toMatch(/SCOPE ACCEPTANCE OUTSTANDING/);
    expect(u.verification_notes).toContain(prUrl);
  });

  it('tells the operator exactly how to attest', () => {
    const u = buildMergedReconcileUpdate({ qf: { id: 'QF-ABC' }, prUrl, nowIso });
    expect(u.verification_notes).toMatch(/--scope-accepted/);
    expect(u.verification_notes).toContain('QF-ABC');
  });

  it('an explicit attestation completes it and names the attester in the audit trail', () => {
    const who = 'Foxtrot: both named surfaces verified against origin/main';
    const u = buildMergedReconcileUpdate({ qf: { id: 'QF-X' }, prUrl, mergeSha: 'abc', nowIso, scopeAcceptedBy: who });
    expect(u.status).toBe('completed');
    expect(u.force_completed).toBe(true);
    expect(u.completed_at).toBe(nowIso);
    expect(u.verification_notes).toContain(who);
    expect(u.verification_notes).toMatch(/SCOPE ACCEPTED by/);
  });

  it('uses only statuses already in the CHECK enum — no migration required', () => {
    const allowed = ['open', 'in_progress', 'completed', 'escalated'];
    const witness = buildMergedReconcileUpdate({ qf: {}, prUrl, nowIso });
    const attested = buildMergedReconcileUpdate({ qf: {}, prUrl, nowIso, scopeAcceptedBy: 'x' });
    expect(allowed).toContain(witness.status);
    expect(allowed).toContain(attested.status);
  });

  it('never leaves a holder pinned on the row either way (QF-20260711-176 preserved)', () => {
    expect(buildMergedReconcileUpdate({ qf: {}, prUrl, nowIso }).claiming_session_id).toBeNull();
    expect(buildMergedReconcileUpdate({ qf: {}, prUrl, nowIso, scopeAcceptedBy: 'x' }).claiming_session_id).toBeNull();
  });
});
