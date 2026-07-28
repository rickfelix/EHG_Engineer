// SD-REFILL-00QQ60BN — the already-MERGED reconcile path (orchestrator.js) set status='completed'
// WITHOUT stamping the verification columns, so the completed_requires_verification CHECK
//   (status='completed') AND ((tests_passing AND uat_verified) OR force_completed)
// rejected the UPDATE forever for any QF not pre-stamped — the reconcile printed
// "Could not reconcile QF record (non-fatal)" on every re-run and the QF stayed in_progress with
// a merged PR (witnessed on QF-20260610-541 / PR #4587). buildMergedReconcileUpdate now stamps
// tests_passing=true (merged PR = CI witness) + force_completed=true + an audit note, satisfying
// the CHECK without fabricating uat_verified.

import { describe, it, expect } from 'vitest';
import { buildMergedReconcileUpdate, witnessNameFrom, completionModeStamp, buildRuntimeObservation, completionStampFromOptions } from '../../../scripts/modules/complete-quick-fix/orchestrator.js';

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

// ── SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001 FR-1 ────────────────────────────────────────────
//
// buildRuntimeObservation: one observation of the RUNNING system at close time. The shape is fixed
// by PRECEDENT, not invented — Adam recorded the first real observation on QF-20260725-096 using
// {observed_at, method, observation, declared_by}, so these pin conformance to what is already in
// the column rather than a second dialect.
describe('buildRuntimeObservation — FR-1', () => {
  const nowIso = '2026-07-28T11:00:00.000Z';

  it('records a declared observation in the shape already in the column', () => {
    const o = buildRuntimeObservation({
      observation: 'GET /fleet-ui/session-view.html -> 410', method: 'http_probe',
      declaredBy: 'Alpha-4', nowIso
    });
    expect(o).toEqual({
      observed_at: nowIso, method: 'http_probe',
      observation: 'GET /fleet-ui/session-view.html -> 410', declared_by: 'Alpha-4'
    });
  });

  it('records ABSENCE EXPLICITLY rather than leaving the column null', () => {
    // The FR-1 acceptance criterion verbatim: absence must be explicit "so silence is
    // distinguishable from not applicable". A null cannot carry that distinction.
    const o = buildRuntimeObservation({ declaredBy: 'Alpha-4', nowIso });
    expect(o.declared).toBe(false);
    expect(o.observed_at).toBe(nowIso);
    expect(o).not.toBeNull();
  });

  it('says in the row itself that absence is NOT an all-clear', () => {
    // The trigger is worker-DECLARED, not detected. If the note ever stops saying so, a reader
    // will mistake declared:false for "runtime evidence was not applicable here".
    const o = buildRuntimeObservation({ nowIso });
    expect(o.note).toMatch(/nobody declared one/i);
    expect(o.note).toMatch(/not evidence that none was applicable/i);
  });

  it('NEVER clobbers an observation already on the row', () => {
    // Re-running a completion must not overwrite a probe someone actually performed with a fresh
    // "nobody declared one" — that destroys real evidence in order to record its absence.
    const existing = { observed_at: '2026-07-28T10:35:34.327Z', method: 'http_probe', observation: 'real probe', declared_by: 'adam' };
    expect(buildRuntimeObservation({ existing, observation: 'later text', nowIso })).toEqual(existing);
    expect(buildRuntimeObservation({ existing, nowIso })).toEqual(existing);
  });

  it('treats an empty or whitespace-only observation as undeclared, not as a blank observation', () => {
    for (const v of ['', '   ', null, undefined]) {
      expect(buildRuntimeObservation({ observation: v, nowIso }).declared).toBe(false);
    }
  });

  it('defaults method when text is given without one, and ignores a blank existing object', () => {
    expect(buildRuntimeObservation({ observation: 'saw it', nowIso }).method).toBe('declared');
    expect(buildRuntimeObservation({ existing: {}, observation: 'saw it', nowIso }).observation).toBe('saw it');
  });
});

// completionStampFromOptions: the CALL-SITE contract. This is the pin that was missing.
describe('completionStampFromOptions — the option NAME is the contract', () => {
  it('reads the key cli.js actually produces (scopeAccepted), not scopeAcceptedBy', () => {
    // THE SHIPPED BUG: FR-2 read options.scopeAcceptedBy while cli.js has always produced
    // options.scopeAccepted, so the value was permanently undefined and the documented precedence
    // could never fire — it degraded silently to the session id, which LOOKS like a working stamp.
    // The FR-2 pins missed it because they called completionModeStamp directly with explicit args:
    // the function was right, the call site handed it the wrong key.
    expect(completionStampFromOptions({ forceComplete: true, scopeAccepted: 'Alpha-4 — why' }, 'sess-1'))
      .toBe('Alpha-4 (FORCE_COMPLETE)');
  });

  it('regression guard: the misspelled key must NOT satisfy the precedence', () => {
    // If someone reintroduces scopeAcceptedBy at the call site, this fails instead of silently
    // falling back to the session id.
    expect(completionStampFromOptions({ forceComplete: true, scopeAcceptedBy: 'Ghost — why' }, 'sess-1'))
      .toBe('sess-1 (FORCE_COMPLETE)');
  });

  it('falls back to the session when no scope-accepter was supplied', () => {
    expect(completionStampFromOptions({ forceComplete: false }, 'sess-2')).toBe('sess-2 (UAT_AGENT)');
  });
});

// END-TO-END OPTION CONTRACT, driven by the REAL parser rather than a hand-made options object.
// A stand-in object only proves the stand-in spells the key the way I spelled it in the test —
// which is the same mental model that produced the bug. Importing parseArguments makes the two
// modules agree in the test the way they must agree at runtime.
describe('cli.parseArguments -> completionStampFromOptions (cross-module contract)', () => {
  it('a real --scope-accepted argv reaches the stamp', async () => {
    const { parseArguments } = await import('../../../scripts/modules/complete-quick-fix/cli.js');
    // parseArguments returns { qfId, options } — NOT a flat object. Learned by driving the real
    // parser: a hand-made stand-in would have encoded my wrong assumption about the return shape
    // and passed forever. --force-complete also genuinely requires --reason.
    const { options } = parseArguments(['QF-20260725-096', '--force-complete', '--reason', 'audit', '--scope-accepted', 'Alpha-4 — scope satisfied']);
    expect(options.scopeAccepted).toBe('Alpha-4 — scope satisfied');
    expect(completionStampFromOptions(options, 'sess-x')).toBe('Alpha-4 (FORCE_COMPLETE)');
  });

  it('a real --runtime-observation argv reaches buildRuntimeObservation', async () => {
    const { parseArguments } = await import('../../../scripts/modules/complete-quick-fix/cli.js');
    const { options } = parseArguments(['QF-20260725-096', '--runtime-observation', 'GET / -> 410', '--observation-method', 'http_probe']);
    const o = buildRuntimeObservation({
      observation: options.runtimeObservation, method: options.observationMethod,
      declaredBy: 'Alpha-4', nowIso: '2026-07-28T11:00:00.000Z'
    });
    expect(o.observation).toBe('GET / -> 410');
    expect(o.method).toBe('http_probe');
    expect(o.declared).toBeUndefined();
  });
});

// ── THE PIN THAT WAS MISSING, and the reason it was missing ──────────────────────────────────────
//
// buildMergedReconcileUpdate declared runtimeObservation/observationMethod and its SOLE production
// call site passed NEITHER. So on the reconcile path a real --runtime-observation was dropped and
// the row recorded declared:false — a MANUFACTURED FALSE ABSENCE over an operator's actual
// declaration, made permanent by the never-clobber guard. Strictly worse than a null: FR-1 exists
// so that absence is honest, and this asserted an absence that was false.
//
// The existing FR-1 pins could not catch it because they pass `observation:` BY HAND, reproducing
// in the test the exact plumbing production omitted — the same "unit verified, consumer not"
// failure as the FR-2 call-site bug, committed one function over while fixing that one.
//
// These drive the REAL parser into the REAL builder and assert on the ASSEMBLED payload.
describe('reconcile path carries FR-1 through from parsed argv (regression)', () => {
  const base = { qf: {}, prUrl: 'https://github.com/x/y/pull/1', nowIso: '2026-07-28T12:00:00.000Z' };

  it('a real --runtime-observation reaches the assembled reconcile payload', async () => {
    const { parseArguments } = await import('../../../scripts/modules/complete-quick-fix/cli.js');
    const { options } = parseArguments(['QF-1', '--runtime-observation', 'GET /health -> 200', '--observation-method', 'http_probe']);
    const u = buildMergedReconcileUpdate({ ...base, scopeAcceptedBy: 'Alpha-4 — why', options });
    expect(u.runtime_observation.observation).toBe('GET /health -> 200');
    expect(u.runtime_observation.method).toBe('http_probe');
    // The precise regression: a real declaration must NEVER be recorded as an absence.
    expect(u.runtime_observation.declared).toBeUndefined();
  });

  it('still records EXPLICIT absence when the operator genuinely declared nothing', async () => {
    const { parseArguments } = await import('../../../scripts/modules/complete-quick-fix/cli.js');
    const { options } = parseArguments(['QF-1', '--pr-url', 'https://github.com/x/y/pull/1']);
    const u = buildMergedReconcileUpdate({ ...base, scopeAcceptedBy: 'Alpha-4 — why', options });
    expect(u.runtime_observation.declared).toBe(false);
  });

  it('the field exists at all — deleting it from the payload must fail a test', () => {
    // Coverage guard: before this, removing runtime_observation from the reconcile builder failed
    // ZERO tests. An FR deliverable that can be deleted invisibly is not delivered.
    const u = buildMergedReconcileUpdate({ ...base, scopeAcceptedBy: 'Alpha-4 — why' });
    expect(u).toHaveProperty('runtime_observation');
    expect(u.runtime_observation).not.toBeNull();
  });

  it('explicit args still win over options, so callers that pass them directly are unaffected', () => {
    const u = buildMergedReconcileUpdate({
      ...base, scopeAcceptedBy: 'Alpha-4 — why',
      runtimeObservation: 'explicit', options: { runtimeObservation: 'from-options' }
    });
    expect(u.runtime_observation.observation).toBe('explicit');
  });
});

// SECURITY S3 — the observation is redacted and capped before it is stored.
describe('buildRuntimeObservation redacts secrets (SECURITY S3)', () => {
  const nowIso = '2026-07-28T13:00:00.000Z';

  it('does not store a bearer token pasted from probe output verbatim', () => {
    const o = buildRuntimeObservation({
      observation: 'curl -H "Authorization: Bearer sk-live-ABCDEF1234567890abcdef" https://api/x -> 200',
      nowIso
    });
    expect(o.observation).not.toContain('sk-live-ABCDEF1234567890abcdef');
  });

  it('still records the observation — redaction must not empty it into a false absence', () => {
    // The failure mode to avoid: redaction so aggressive the text becomes blank and the row then
    // records declared:false, which would manufacture the very false absence FR-1 exists to stop.
    const o = buildRuntimeObservation({ observation: 'GET /fleet-ui/session-view.html -> 410', nowIso });
    expect(o.observation).toBe('GET /fleet-ui/session-view.html -> 410');
    expect(o.declared).toBeUndefined();
  });
});

describe('buildRuntimeObservation over-cap handling (SECURITY S3)', () => {
  it('truncates and SAYS SO rather than silently becoming an absence', () => {
    // The trap: capBody THROWS over the cap. Swallowing that would leave text empty, and the
    // function would then record declared:false — manufacturing the exact false absence FR-1
    // exists to stop. An over-long observation must stay an observation.
    const o = buildRuntimeObservation({ observation: 'x'.repeat(9000), nowIso: '2026-07-28T13:00:00.000Z' });
    expect(o.declared).toBeUndefined();
    expect(o.observation).toMatch(/TRUNCATED at \d+ chars/);
  });
});
