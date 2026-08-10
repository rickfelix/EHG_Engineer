/**
 * SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001 (FR-3) — the premise-freshness contract for
 * WORK_ASSIGNMENT instruction bodies.
 *
 * Every 'freshness' concept on the dispatch path measures the RECIPIENT (heartbeat windows in
 * lib/coordinator/dispatch.cjs and detectors.cjs, DISPATCH_RANK_TTL_MS on the dispatch rank).
 * None measures whether a factual claim EMBEDDED IN the instruction is still true. Reported
 * incident: an 08-05 dispatch carried an apply-instruction ("drive_reports returns PGRST205,
 * prepend-commit-apply") that was FALSE by read-time — the table had since been applied — and a
 * worker following it literally would have re-applied a live permission-class table.
 *
 * THIS MODULE IS NOT A PROSE RE-VALIDATOR, and deliberately claims nothing about instruction
 * CONTENT. Arbitrary factual claims cannot be mechanically re-checked; a guard pretending to
 * would assert what it never measured. The contract is narrower and honest:
 *   WRITE side  the dispatcher records WHEN the premise was MEASURED (payload.premise_measured_at)
 *               — never the send time; a send-time stamp certifies only that the message is new,
 *               which is exactly the false comfort this defect is made of.
 *   READ side   at claim-time, a premise older than the bound — or an instruction body carrying
 *               no stamp at all — surfaces an explicit RE-VERIFY-BEFORE-EXECUTING directive to
 *               the worker instead of being handed on as fact.
 *
 * Detection is by KEY PRESENCE (payload.instruction / apply / body / steps — the fields
 * directed-assignment previously never inspected), never by reading the prose, so the verdict is
 * content-blind by construction.
 *
 * The verdict is computed at READ time, never persisted at write time: a persisted "fresh"
 * verdict would itself go stale — the exact defect class this FR closes.
 */

// One hour, mirroring DISPATCH_RANK_TTL_MS (worker-checkin.cjs) — the precedent bound for how
// long dispatch-path state stays trustworthy without re-measurement.
const PREMISE_FRESHNESS_BOUND_MS = 60 * 60 * 1000;

// The instruction-carrying payload fields (the FR's measured absence list). A payload with any
// of these is an instruction a worker is expected to ACT on, so its premise needs a stamp.
const INSTRUCTION_BODY_KEYS = Object.freeze(['instruction', 'apply', 'body', 'steps']);

/** True iff the payload carries a non-empty instruction body under any contract key. */
function hasInstructionBody(payload) {
  if (!payload || typeof payload !== 'object') return false;
  return INSTRUCTION_BODY_KEYS.some((k) => {
    const v = payload[k];
    if (v == null) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return typeof v === 'object' ? Object.keys(v).length > 0 : Boolean(v);
  });
}

/**
 * Assess an assignment payload's premise at claim-time.
 *
 * @param {object|null|undefined} payload - the WORK_ASSIGNMENT row's payload
 * @param {number} [nowMs] - injected clock for tests
 * @returns {{verdict:'no_instruction'|'fresh'|'stale'|'unstamped',
 *            measuredAt:string|null, ageMs:number|null, directive:string|null}}
 *   directive is non-null exactly when the worker must re-verify (stale/unstamped); it is the
 *   worker-facing text and never claims any re-validation was performed.
 */
function assessInstructionPremise(payload, nowMs = Date.now()) {
  if (!hasInstructionBody(payload)) {
    return { verdict: 'no_instruction', measuredAt: null, ageMs: null, directive: null };
  }
  const raw = payload.premise_measured_at;
  const measured = raw ? Date.parse(raw) : NaN;
  if (!Number.isFinite(measured)) {
    // A missing (or unreadable) stamp must never read as a passing one.
    return {
      verdict: 'unstamped',
      measuredAt: null,
      ageMs: null,
      directive: 'RE-VERIFY BEFORE EXECUTING: this instruction carries no premise measurement '
        + 'time — its factual premise is UNVERIFIED. Treat it as a lead, not a fact; check the '
        + 'live state it describes before acting on it.',
    };
  }
  const ageMs = nowMs - measured;
  if (ageMs > PREMISE_FRESHNESS_BOUND_MS) {
    const ageHours = (ageMs / (60 * 60 * 1000)).toFixed(1);
    return {
      verdict: 'stale',
      measuredAt: new Date(measured).toISOString(),
      ageMs,
      directive: `RE-VERIFY BEFORE EXECUTING: this instruction's premise was measured ${ageHours}h `
        + `ago (${new Date(measured).toISOString()}), beyond the `
        + `${Math.round(PREMISE_FRESHNESS_BOUND_MS / 60000)}min freshness bound. Treat it as a `
        + 'lead, not a fact; re-verify the live state it describes before acting on it.',
    };
  }
  return { verdict: 'fresh', measuredAt: new Date(measured).toISOString(), ageMs, directive: null };
}

module.exports = {
  PREMISE_FRESHNESS_BOUND_MS,
  INSTRUCTION_BODY_KEYS,
  hasInstructionBody,
  assessInstructionPremise,
};
