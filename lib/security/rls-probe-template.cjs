'use strict';
/**
 * CANONICAL RLS / PERMISSION PROBE TEMPLATE — SD-LEO-INFRA-SURVEY-EVERY-PERMISSION-001 (FR-5).
 *
 * WHY THIS IS A TEMPLATE AND NOT A CAUTION. The constraint-ordering caution WAS written into the
 * anchor SD at sourcing; the worker DID read it and restated it in his own words; and he hit the trap
 * three times anyway. Prose is read once, at the start. An order-of-operations trap fires later,
 * during execution. The two occupy different moments and comprehension does not bridge them — the
 * remedy has to be PRESENT AT THE FAILING MOMENT, which a template is because you are writing inside
 * it. That is the timing test for when guidance must become scaffolding: does the failure it prevents
 * occur while you are READING, or later, inside a procedure?
 *
 * WHAT IT DEFENDS AGAINST, measured 2026-08-03 against public.feedback with THIS EXACT ROW:
 *   { type:'issue', source_application:'EHG_Engineer', title:<marker>,
 *     source_type:'auto_capture', feedback_type:'user_bug', venture_id:<an ACTIVE venture> }
 *   anon .insert().select()  -> 42501 "new row violates row-level security policy", row ABSENT
 *   anon .insert()  (no RETURNING, IDENTICAL row) -> error null, ROW LANDS
 *
 * EVERY FIELD IN THAT ROW IS LOAD-BEARING, which is why it is written out in full. The asymmetry
 * comes from venture_user_insert_feedback granting INSERT on (feedback_type LIKE 'user_%' AND an
 * active venture_id) while placing NO constraint on source_type, whereas anon SELECT
 * (telegram_bot_select_feedback) is confined to source_type='telegram'. So the INSERT is permitted
 * and the RETURNING read is not. Drop venture_id and the INSERT is refused too — the case stops
 * reproducing and reads as a clean refusal. An earlier version of this comment omitted venture_id;
 * re-running it produced REFUSED and briefly looked like a REFUTATION of the very claim it records.
 * An under-specified repro is worse than none.
 *
 * So an error code cannot prove refusal — and NEITHER CAN AN ABSENT ROW, because absence only
 * discriminates when the write was attempted in the shape a REAL WRITER uses. A denied nonsense
 * control returns the SAME SQLSTATE **and the same message string**, so message matching is unsound
 * too. RLS WITH CHECK evaluates BEFORE NOT NULL, so column constraints do not mask the policy verdict.
 *
 * COMPOSES WITH, does not replace, scripts/db-validate/rls-validator.js — that reads pg_policies and
 * checks policy SHAPE; this probes BEHAVIOUR. Shape and behaviour are different questions and this SD
 * exists because the second one was being answered with the first one's evidence.
 *
 * @module lib/security/rls-probe-template
 */

/** Verdicts. OPEN and REFUSED are conclusions; INCONCLUSIVE is the honest default and never an alarm. */
const VERDICT = Object.freeze({ OPEN: 'OPEN', REFUSED: 'REFUSED', INCONCLUSIVE: 'INCONCLUSIVE' });

/** How leg 2 confirmed absence. Both are valid; SURVEY-1 found a live probe using deletion-count. */
const CONFIRM = Object.freeze({ ABSENCE: 'absence-readback', DELETION_COUNT: 'deletion-count' });

class ProbeTemplateError extends Error {}

/**
 * Build a probe plan. The NONSENSE CONTROL IS A REQUIRED SLOT — omitting it THROWS.
 *
 * It is a slot rather than a documented discipline on purpose: three layers of identical rejection
 * look exactly like a working guard until something proves the probe can still discriminate, and
 * nobody thinks to add that proof while staring at a rejection they already believe. A remembered
 * control is absent exactly when the result is most convincing.
 *
 * @param {{table:string, validRow:object, fieldUnderTest:string, nonsenseControl:object,
 *          command?:'INSERT'|'UPDATE', markerColumn?:string, confirmBy?:string}} spec
 */
function buildProbePlan(spec) {
  const { table, validRow, fieldUnderTest, nonsenseControl, command = 'INSERT',
    markerColumn = 'subject', confirmBy = CONFIRM.ABSENCE } = spec || {};
  if (!table) throw new ProbeTemplateError('table is required');
  if (!validRow || typeof validRow !== 'object') {
    throw new ProbeTemplateError('validRow is required: construct an OTHERWISE-VALID row so every column constraint is satisfied, then vary ONLY the field under test. A row that trips NOT NULL or a CHECK tells you nothing about the policy.');
  }
  if (!fieldUnderTest) throw new ProbeTemplateError('fieldUnderTest is required — vary exactly one thing');
  if (!nonsenseControl || typeof nonsenseControl !== 'object') {
    throw new ProbeTemplateError('nonsenseControl is REQUIRED and must be a row expected to be genuinely DENIED. Without it a probe cannot demonstrate it is still capable of failing, and an always-refused reading is indistinguishable from a working guard.');
  }
  if (command !== 'INSERT' && command !== 'UPDATE') {
    throw new ProbeTemplateError(`command must be INSERT or UPDATE (got ${command})`);
  }
  return Object.freeze({ table, validRow, fieldUnderTest, nonsenseControl, command, markerColumn, confirmBy });
}

/**
 * PURE three-leg classifier.
 *
 * RELATIONSHIP TO THE CANARY, stated accurately. An earlier version of this comment claimed "one
 * representation of the rule, two consumers". That was FALSE: this and
 * lib/breakage/active-canary-probes.cjs classifyRlsProbe are two separate implementations, and they
 * had already DIVERGED — the canary required code 42501 before concluding refusal, this one did not,
 * which is exactly the defect fixed below. A 1-REP claim asserted in prose is not 1-REP; it is a
 * claim that nothing checks, and it read as reassurance while the two drifted apart.
 *
 * They stay aligned now because a test asserts it: tests/unit/security/rls-probe-template.test.js
 * runs a shared evidence table through BOTH classifiers and fails if their verdicts disagree. That
 * is the enforcement the prose was standing in for.
 *
 * @param {{withReturning?:{error?:object|null,data?:Array|null}|null,
 *          readbackAfterReturning?:{rows?:Array|null, deleted?:number}|null,
 *          bareInsert?:{error?:object|null}|null,
 *          readbackAfterBare?:{rows?:Array|null, deleted?:number}|null,
 *          confirmBy?:string}} evidence
 */
function classifyProbeEvidence(evidence) {
  const e = evidence || {};
  const wr = e.withReturning || {};
  const code = (wr.error && (wr.error.code || '')) || '';
  const confirmBy = e.confirmBy || CONFIRM.ABSENCE;

  const present = (leg) => {
    if (!leg) return false;
    if (confirmBy === CONFIRM.DELETION_COUNT) return Number(leg.deleted || 0) > 0;
    return Array.isArray(leg.rows) && leg.rows.length > 0;
  };
  const observed = (leg) => {
    if (!leg) return false;
    return confirmBy === CONFIRM.DELETION_COUNT
      ? Object.prototype.hasOwnProperty.call(leg, 'deleted')
      : Array.isArray(leg.rows);
  };

  // A row that exists after EITHER attempt means the write got through. Readback is the authority;
  // RETURNING's data is only a hint and is absent by construction on a bare insert.
  if (present(e.readbackAfterBare) || present(e.readbackAfterReturning) || (Array.isArray(wr.data) && wr.data.length > 0)) {
    return {
      verdict: VERDICT.OPEN,
      reason: 'the write LANDED — a row is present on service-role confirmation, so the permission is NOT enforced for this shape',
      detail: { landed_via: present(e.readbackAfterBare) ? 'bare-write' : 'with-returning', confirmBy },
    };
  }

  // REFUSED requires leg 3 AND the RLS refusal code specifically. Absence after a RETURNING attempt
  // alone is the FALSE ALL-CLEAR — and so is absence caused by a write that never reached policy
  // evaluation at all.
  //
  // WHY 42501 IS REQUIRED, measured: probing feedback with a row carrying a `subject` column (this
  // table has none — the marker column is `title`) failed PGRST204 in the SCHEMA CACHE, before any
  // policy ran. All three legs came back absent and this function reported
  // "REFUSED — three legs confirmed" for a table whose anon INSERT is in fact OPEN for
  // source_type='telegram'. A malformed probe is the most dangerous input here precisely because it
  // fails CONSISTENTLY, which is what a working guard also looks like.
  //
  // ALLOWLIST, NOT BLOCKLIST. Enumerating non-policy codes (PGRST204/42703/23502/23514/…) is a list
  // that is always one entry short. Requiring the affirmative RLS code fails CLOSED to INCONCLUSIVE
  // for every error nobody anticipated. This matches the merged SURVEY-2 canary, which required
  // 42501 from the start; the template had silently diverged.
  const RLS_REFUSAL_CODE = '42501';
  const bareAttempted = Object.prototype.hasOwnProperty.call(e, 'bareInsert') && observed(e.readbackAfterBare);
  if (code === RLS_REFUSAL_CODE && observed(e.readbackAfterReturning) && bareAttempted) {
    return {
      verdict: VERDICT.REFUSED,
      reason: 'refused — 42501, and absent after the RETURNING attempt AND after an identical write with NO RETURNING (three legs confirmed)',
      detail: { legs: 3, code, confirmBy },
    };
  }
  if (code && code !== RLS_REFUSAL_CODE) {
    return {
      verdict: VERDICT.INCONCLUSIVE,
      reason: `the write failed with ${code}, which is NOT the RLS refusal code — it never reached policy evaluation, so this says nothing about the permission. Fix the probe row (every required column present and valid) and re-run.`,
      detail: { legs: 0, code, confirmBy, non_policy_error: true },
    };
  }
  return {
    verdict: VERDICT.INCONCLUSIVE,
    reason: observed(e.readbackAfterReturning)
      ? 'leg 3 missing — absence after a RETURNING attempt CANNOT distinguish refusal from a write that would land without RETURNING'
      : 'no service-role confirmation — an error code alone proves only that the CALLER saw a failure',
    detail: { legs: observed(e.readbackAfterReturning) ? 2 : 1, code: code || null, confirmBy },
  };
}

/**
 * Run a probe. `assertPrecondition` is REQUIRED for live runs and must THROW on fixture drift —
 * never skip. A fixture that has drifted toward "everything is open" makes an always-OPEN template
 * pass silently, which is the failure this whole SD is about, reproduced in the instrument.
 *
 * @param {{anon:object, service:object, plan:object, assertPrecondition:Function}} io
 */
async function runProbe({ anon, service, plan, assertPrecondition }) {
  if (typeof assertPrecondition !== 'function') {
    throw new ProbeTemplateError('assertPrecondition is REQUIRED and must throw on fixture drift — a probe whose fixture moved reports a verdict about a table that no longer exists as described');
  }
  await assertPrecondition();     // throws on drift; must never downgrade to a skip

  const marker = plan.validRow[plan.markerColumn];
  if (!marker) throw new ProbeTemplateError(`validRow must carry a unique value in markerColumn "${plan.markerColumn}" so the row can be found and removed`);

  const confirm = async () => {
    try {
      const { data } = await service.from(plan.table).select('id').eq(plan.markerColumn, marker);
      return { rows: Array.isArray(data) ? data : [] };
    } catch { return null; }      // failed confirmation is ABSENT EVIDENCE, not evidence of absence
  };

  const evidence = { confirmBy: plan.confirmBy };
  try { evidence.withReturning = await anon.from(plan.table).insert(plan.validRow).select('id'); }
  catch (err) { evidence.withReturning = { error: { code: err.code, message: err.message }, data: null }; }
  evidence.readbackAfterReturning = await confirm();

  const looksRefused = evidence.readbackAfterReturning && evidence.readbackAfterReturning.rows.length === 0
    && !(Array.isArray(evidence.withReturning.data) && evidence.withReturning.data.length > 0);
  if (looksRefused) {
    try { evidence.bareInsert = await anon.from(plan.table).insert(plan.validRow); }
    catch (err) { evidence.bareInsert = { error: { code: err.code, message: err.message } }; }
    evidence.readbackAfterBare = await confirm();
  }

  const result = classifyProbeEvidence(evidence);
  try {
    await service.from(plan.table).delete().eq(plan.markerColumn, marker);
    const after = await confirm();
    if (after && after.rows.length > 0) result.detail = { ...(result.detail || {}), cleanup_residue: after.rows.length, marker };
  } catch { /* row is clearly marked for a human sweep */ }
  return result;
}

module.exports = { VERDICT, CONFIRM, ProbeTemplateError, buildProbePlan, classifyProbeEvidence, runProbe };
