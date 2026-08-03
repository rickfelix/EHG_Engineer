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
 * WHAT IT DEFENDS AGAINST, measured 2026-08-03 against public.feedback:
 *   anon .insert().select()  -> 42501, row ABSENT   (looks refused)
 *   anon .insert()  (no RETURNING, same row) -> error null, ROW LANDS   (is wide open)
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
 * PURE three-leg classifier. Same logic shipped and merged as the SURVEY-2 canary exemplar
 * (lib/breakage/active-canary-probes.cjs classifyRlsProbe) — one representation of the rule, two
 * consumers.
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

  // REFUSED requires leg 3. Absence after a RETURNING attempt alone is the FALSE ALL-CLEAR.
  const bareAttempted = Object.prototype.hasOwnProperty.call(e, 'bareInsert') && observed(e.readbackAfterBare);
  if (observed(e.readbackAfterReturning) && bareAttempted) {
    return {
      verdict: VERDICT.REFUSED,
      reason: 'refused — absent after the RETURNING attempt AND after an identical write with NO RETURNING (three legs confirmed)',
      detail: { legs: 3, code: code || null, confirmBy },
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
