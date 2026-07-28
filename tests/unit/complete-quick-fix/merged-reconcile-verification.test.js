// SD-REFILL-00QQ60BN — the already-MERGED reconcile path (orchestrator.js) set status='completed'
// WITHOUT stamping the verification columns, so the completed_requires_verification CHECK
//   (status='completed') AND ((tests_passing AND uat_verified) OR force_completed)
// rejected the UPDATE forever for any QF not pre-stamped — the reconcile printed
// "Could not reconcile QF record (non-fatal)" on every re-run and the QF stayed in_progress with
// a merged PR (witnessed on QF-20260610-541 / PR #4587). buildMergedReconcileUpdate now stamps
// tests_passing=true (merged PR = CI witness) + force_completed=true + an audit note, satisfying
// the CHECK without fabricating uat_verified.

import { describe, it, expect } from 'vitest';
import { buildMergedReconcileUpdate, witnessNameFrom, completionModeStamp } from '../../../scripts/modules/complete-quick-fix/orchestrator.js';

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

// SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001 FR-2 — a thin stamp must not be ANONYMOUS.
//
// This branch wrote force_completed=true with uat_verified left false and verified_by omitted
// entirely, so the row asserted a close with nobody attached to it. Measured across the live table
// when this was written: 392 of 629 force-completed rows had uat_verified=false AND
// verified_by=null — 62 percent, the majority pattern rather than an exception.
//
// FR-2 does not BLOCK a thin close. It stops one being anonymous, which is why every assertion here
// is about the witness being present and legible rather than about the close being refused.
describe('FR-2: the merged-reconcile terminal close names its witness', () => {
  const prUrl = 'https://github.com/o/r/pull/1';
  const nowIso = '2026-07-28T03:00:00.000Z';

  it('carries the witness into verified_by instead of omitting it', () => {
    const u = buildMergedReconcileUpdate({
      qf: { id: 'QF-X' }, prUrl, mergeSha: 'abc', nowIso,
      scopeAcceptedBy: 'Alpha-4 (worker 39aa8a1e) — both named surfaces verified against origin/main'
    });
    expect(u.verified_by).toBe('Alpha-4 (worker 39aa8a1e)');
  });

  it('NEVER writes force_completed=true with a null witness — the defect itself', () => {
    const u = buildMergedReconcileUpdate({ qf: {}, prUrl, nowIso, scopeAcceptedBy: 'Somebody — why' });
    expect(u.force_completed).toBe(true);
    expect(u.verified_by).not.toBeNull();
    expect(u.verified_by).not.toBeUndefined();
  });

  it('does not stamp a witness on the NON-terminal witness-only path, which asserts no close', () => {
    // The merge-witness branch deliberately stays in_progress: nobody has attested scope, so there
    // is no witness to name and inventing one would be the fabrication FR-2 exists to prevent.
    const u = buildMergedReconcileUpdate({ qf: {}, prUrl, nowIso });
    expect(u.status).toBe('in_progress');
    expect(u.verified_by).toBeUndefined();
  });

  it('keeps the full attestation in verification_notes even though verified_by is trimmed', () => {
    const why = 'Alpha-4 — every named surface verified live, plus a long rationale that belongs in the notes';
    const u = buildMergedReconcileUpdate({ qf: {}, prUrl, nowIso, scopeAcceptedBy: why });
    expect(u.verified_by).toBe('Alpha-4');
    expect(u.verification_notes).toContain(why);
  });
});

describe('FR-2: witnessNameFrom extracts an identity, not a paragraph', () => {
  it('takes the head of the documented "<who> — <why>" convention', () => {
    expect(witnessNameFrom('Alpha-4 (worker 39aa8a1e) — reason text')).toBe('Alpha-4 (worker 39aa8a1e)');
  });

  it('accepts a plain hyphen so a caller who cannot type an em-dash is not degraded', () => {
    expect(witnessNameFrom('Charlie - accepted on merge evidence alone')).toBe('Charlie');
  });

  it('falls back to the whole value when there is no separator', () => {
    expect(witnessNameFrom('coordinator')).toBe('coordinator');
  });

  it('caps a caller who ignores the convention rather than storing a wall of text', () => {
    const out = witnessNameFrom('x'.repeat(400));
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.endsWith('...')).toBe(true);
  });

  it('returns null for absent or blank input rather than an empty string', () => {
    expect(witnessNameFrom(null)).toBeNull();
    expect(witnessNameFrom('')).toBeNull();
    expect(witnessNameFrom('   ')).toBeNull();
    expect(witnessNameFrom(undefined)).toBeNull();
  });

  it('does not choke on a hyphenated name with no separator spaces', () => {
    // "well-known" must not be split at the hyphen — only a SPACED separator delimits who from why.
    expect(witnessNameFrom('well-known-agent')).toBe('well-known-agent');
  });
});

// SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001 FR-2, SECOND WRITER.
//
// FR-2 has two writers. The reconcile path above was pinned; the DIRECT completion path was not,
// and it was unpinned in the way that hides a regression rather than merely leaving a hole.
//
// The value lived in an inline IIFE, so nothing could import it. The only test naming
// FORCE_COMPLETE asserts FORCE_COMPLETE_NO_REASON — a different thing entirely. And the fallback
// made the gap self-concealing: under test CLAUDE_SESSION_ID is unset and no --scope-accepted is
// passed, so `who` is null and the stamp degrades to the bare mode label — EXACTLY the pre-FR-2
// output. A test written against observed behaviour would have certified the old behaviour and
// passed. Deleting the identity logic outright would not have failed a single test.
//
// Hence these pins target the branches ambient state suppresses, not the one it exposes.
describe('completionModeStamp — FR-2 second writer', () => {
  it('prefers the explicit scope-accepter over the operator session', () => {
    // Precedence matters: the human/agent who attested to SCOPE outranks whoever happened to run
    // the command. Both are present here so the test cannot pass by accident of absence.
    expect(completionModeStamp({
      forceComplete: true,
      scopeAcceptedBy: 'Alpha-4 (worker 39aa8a1e) — scope satisfied across two PRs',
      sessionId: 'session-should-not-win'
    })).toBe('Alpha-4 (worker 39aa8a1e) (FORCE_COMPLETE)');
  });

  it('falls back to the operator session when no scope-accepter was given', () => {
    // THE BRANCH THE ENVIRONMENT HID. With CLAUDE_SESSION_ID unset in test, live behaviour never
    // reached this, which is why the improvement shipped unexercised.
    expect(completionModeStamp({ forceComplete: true, sessionId: '39aa8a1e' }))
      .toBe('39aa8a1e (FORCE_COMPLETE)');
  });

  it('carries the mode as a suffix so classification on these literals still works', () => {
    // Anything grouping rows by how they closed must still find the mode inside the value.
    expect(completionModeStamp({ forceComplete: false, sessionId: 'x' })).toContain('(UAT_AGENT)');
    expect(completionModeStamp({ forceComplete: true, sessionId: 'x' })).toContain('(FORCE_COMPLETE)');
  });

  it('degrades to the bare mode label when there is no identity at all', () => {
    // The documented fallback, pinned so it stays DELIBERATE rather than becoming the default
    // again by accident. This is the shape FR-2 exists to make rare — not impossible.
    expect(completionModeStamp({ forceComplete: true })).toBe('FORCE_COMPLETE');
    expect(completionModeStamp({ forceComplete: false })).toBe('UAT_AGENT');
  });

  it('never returns null or empty — a close is always attributable to at least its mode', () => {
    // The regression that would matter most: a close attributed to NOBODY. 392 of 629 force-
    // completed rows already carry verified_by=null; this function must never add to that set.
    for (const args of [{}, { forceComplete: true }, { scopeAcceptedBy: '   ' }, { sessionId: null }]) {
      const out = completionModeStamp(args);
      expect(out).toBeTruthy();
      expect(typeof out).toBe('string');
    }
  });

  it('treats a whitespace-only scope-accepter as absent rather than stamping blank', () => {
    expect(completionModeStamp({ forceComplete: true, scopeAcceptedBy: '   ', sessionId: 's1' }))
      .toBe('s1 (FORCE_COMPLETE)');
  });

  it('is callable with no arguments at all', () => {
    // Guards the default-parameter object: a bare call must not throw on destructuring.
    expect(completionModeStamp()).toBe('UAT_AGENT');
  });
});
