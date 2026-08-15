#!/usr/bin/env node
/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B (TR-3) — the durable SMS leg.
 *
 * Sends the drive score to the chairman. Outbound, to a real phone, on a cron that retries.
 *
 * ── UNTRUSTED CONTENT IS UNREPRESENTABLE, NOT SANITISED ───────────────────────────────────
 * The report is FULL of free text: SD titles, predicates, `null_means`, limitation strings — all
 * authored by agents or humans upstream. Interpolating any of it into an outbound message is the
 * injection surface, and sanitising it is a losing game played forever.
 *
 * So the body is built ONLY from numbers and closed-set tokens. `formatBody` takes the score, the
 * denominator, a verdict from a fixed enum, and counts. There is no parameter through which a
 * report string could reach the wire, which is a stronger claim than "we escape it": it cannot be
 * done, rather than being done carefully. Same move as section 4's closed act set.
 *
 * ── NO DOUBLE-SEND, AND A SKIP IS REPORTED AS A SKIP ──────────────────────────────────────
 * Mirrors the producer. Keyed on run_id: probe first, and if this run already sent, return
 * {sent:false, skipped:'already_sent'} rather than anything a caller could mistake for success. A
 * duplicate here is not a wasted row — it is a second buzz on someone's phone at 3am, and the fix
 * for "why did it text me twice" is never discovered by reading a log that says success.
 *
 * ── RECIPIENTS ARE VALIDATED AND CAPPED ───────────────────────────────────────────────────
 * E.164 only, and a hard cap on how many go out per run. An unbounded recipient list on a retrying
 * cron is a bill and a trust problem at the same time.
 *
 * LIVES IN scripts/ because it SENDS. The FR-7 propose-only scan forbids that under lib/drive-loop.
 *
 * ── formatDriveBreakdown: THE PER-LEG SIBLING OF formatBody (SD-FDBK-INFRA-ENCODE-DRIVE-SIX-GOAL-001) ──
 * Chairman directive 2026-08-15: chairman-facing drive reads must show the per-leg breakdown and a
 * named top lever, not a bare aggregate number alone. This is a NEW, SEPARATE function rather than
 * a parameter on formatBody — formatBody's 7 callers are pinned on its exact byte-for-byte output,
 * and giving it an optional "breakdown" mode is exactly the kind of change that quietly reshapes a
 * pinned contract. formatDriveBreakdown mirrors formatBody's own disciplines (own-properties-only,
 * non-negative numeric validation, a closed-set throw, a length-budget throw) rather than reusing
 * any of its code, so the two can evolve independently and neither can silently break the other.
 */

import { RATIFIED_LEG_IDS } from '../lib/drive-loop/score/drive-score-legs.js';

export const MAX_RECIPIENTS = 3;
export const MAX_BODY_CHARS = 320;   // 2 SMS segments; beyond this carriers split unpredictably
// formatDriveBreakdown's OWN budget, deliberately larger than MAX_BODY_CHARS: a full per-leg
// breakdown ("X/6 = leg1_landed 2 + leg2_uptake 1 + leg4_capacity 0; top lever: leg4_capacity") is
// appended to callers' own bodies (morning-brief SMS, exec-summary email) rather than sent as a
// bare SMS body itself, so it does not need to fit inside one/two SMS segments on its own — but it
// still needs SOME bound, so a malformed/runaway input (e.g. an absurd leg count) fails loud rather
// than producing an unbounded string.
export const MAX_BREAKDOWN_CHARS = 400;
export const VERDICTS = Object.freeze(['DEFICIT-URGENT', 'DEFICIT', 'TIGHT', 'SURPLUS', 'UNKNOWN']);

/** E.164: a leading + and 8-15 digits. Anything else is not a phone number we will dial. */
export function isE164(n) {
  return typeof n === 'string' && /^\+[1-9]\d{7,14}$/.test(n);
}

/**
 * Turn a drive_reports row into the closed set of facts a message may carry. Returns null when the
 * row cannot supply them, so the caller sends the missing/stale signal rather than a zero.
 *
 * MOVED HERE from scripts/cron/drive-report-sms-sweep.mjs by
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-D, which needed it for a second consumer (the Adam
 * SessionStart hook). It belongs beside formatBody: the two are the reading and writing halves of
 * one contract — this function's output is formatBody's only legal input, which is why the comment
 * below about being AT LEAST as strict is a statement about the function six lines down, not about
 * a module elsewhere. It already reached back into this file for VERDICTS. The sweep re-exports it,
 * so its callers and tests are unchanged.
 *
 * ROW SHAPE, VERIFIED AGAINST THE DDL: it reads `drive_score` ONLY. drive_reports is
 * (id, generated_at, run_id, cadence, sections, drive_score, schema_version, metadata) — there is
 * no headline or summary column, and a caller that selects one gets PostgREST 42703 on the WHOLE
 * projection, not a null field.
 */
export function factsFromReport(report) {
  const score = report?.drive_score;
  const value = score?.score?.value;
  const possible = score?.possible;

  // NON-NEGATIVE, not merely finite. This predicate must be AT LEAST as strict as formatBody's,
  // because anything this function accepts is handed straight to it — and formatBody THROWS on a
  // negative. The two disagreed: this checked finiteness, formatBody checked range, and a
  // negative score aborted the entire run instead of degrading to the missing signal. So a
  // corrupt number silenced the chairman completely rather than telling him something was wrong.
  // A validator upstream of a stricter validator is not a validator; it is a gap. (SECURITY F2.)
  const usable = (n) => Number.isFinite(n) && n >= 0;
  if (!usable(value) || !usable(possible)) return null;

  const legs = Array.isArray(score?.unavailable_legs) ? score.unavailable_legs.length : 0;

  // ABSENT means zero; PRESENT-BUT-CORRUPT means unusable. My first fix collapsed both to 0,
  // which stopped the crash and replaced it with the exact defect this SD exists to prevent:
  // a corrupt counter silently rendering as "0 unowned blockers" — an unmeasured value wearing
  // a measured one. A field that is simply not there is a legitimate zero; a field carrying a
  // negative is a producer bug, and the honest report of a bug is UNUSABLE, not a reassuring
  // number nobody will question.
  const rawBlockers = score?.unowned_blockers;
  if (rawBlockers !== undefined && rawBlockers !== null && !usable(rawBlockers)) return null;
  const blockers = usable(rawBlockers) ? rawBlockers : 0;

  // The capacity verdict comes from leg 4 when it was measurable. UNKNOWN is a real member of
  // VERDICTS, so an unmeasured leg is SAID rather than defaulted to something reassuring.
  const raw = score?.capacity_verdict;
  const verdict = VERDICTS.includes(raw) ? raw : 'UNKNOWN';

  return {
    score: value,
    possible,
    verdict,
    unavailableLegs: legs,
    unownedBlockers: blockers,
  };
}

/**
 * The ONLY way a body is produced. Every parameter is a number or a closed-set token — there is no
 * string passthrough, so no report text can reach the wire.
 *
 * @param {{score:number, possible:number, verdict:string, unavailableLegs:number, unownedBlockers:number}} f
 */
export function formatBody(facts = {}) {
  // OWN PROPERTIES ONLY. Destructuring reads the prototype chain, so with a polluted
  // Object.prototype this function returned a perfectly well-formed body for `formatBody()` with
  // NO ARGUMENTS AT ALL — measured by the SECURITY sub-agent, not theorised. The blast radius is
  // integrity rather than injection (a polluted verdict must still be a member of the frozen
  // enum, so no attacker text reaches the wire), but "the SMS reported a score nobody computed"
  // is its own failure, and it is the kind that is never traced back.
  if (facts === null || typeof facts !== 'object') {
    throw new Error(`formatBody(): facts must be an object — got ${JSON.stringify(facts)}`);
  }
  for (const k of ['score', 'possible', 'verdict']) {
    if (!Object.hasOwn(facts, k)) {
      throw new Error(`formatBody(): ${k} must be an OWN property of facts — an inherited value means the number was not computed by this run`);
    }
  }
  const { score, possible, verdict } = facts;
  const unavailableLegs = Object.hasOwn(facts, 'unavailableLegs') ? facts.unavailableLegs : 0;
  const unownedBlockers = Object.hasOwn(facts, 'unownedBlockers') ? facts.unownedBlockers : 0;

  for (const [k, v] of Object.entries({ score, possible, unavailableLegs, unownedBlockers })) {
    if (!Number.isFinite(v) || v < 0) throw new Error(`formatBody(): ${k} must be a non-negative number — got ${JSON.stringify(v)}`);
  }
  if (!VERDICTS.includes(verdict)) {
    // A free-text verdict is exactly the hole this function exists to close.
    throw new Error(`formatBody(): verdict must be one of ${VERDICTS.join(', ')} — got ${JSON.stringify(verdict)}`);
  }
  const parts = [
    `Drive ${score}/${possible}`,
    `capacity ${verdict}`,
    unavailableLegs > 0 ? `${unavailableLegs} leg(s) unmeasured` : null,
    unownedBlockers > 0 ? `${unownedBlockers} unowned blocker(s)` : null,
  ].filter(Boolean);
  const body = parts.join(' | ');
  if (body.length > MAX_BODY_CHARS) throw new Error('formatBody(): body exceeds the segment cap');
  return body;
}

/**
 * The per-leg sibling of formatBody (SD-FDBK-INFRA-ENCODE-DRIVE-SIX-GOAL-001). Renders the
 * chairman-facing breakdown: "X/6 = leg1_landed 2 + leg2_uptake 1 + leg4_capacity 0; top lever:
 * leg4_capacity". Same closed-inputs discipline as formatBody — numbers and closed-set leg ids
 * only, so no upstream free text (predicates, limitation strings, reasons) can reach this string.
 *
 * `facts.topLeverLeg` is a CALLER-SUPPLIED leg id, not computed here — this function renders and
 * VALIDATES, it does not decide which leg is the biggest lever (that judgement lives with the
 * caller composing `facts`, e.g. lib/fleet/exec-email-drive-line.mjs), exactly as formatBody does
 * not decide the capacity verdict, only validates it against VERDICTS.
 *
 * @param {object} facts
 * @param {number} facts.score earned points this run (non-negative)
 * @param {number} facts.possible the denominator to show against (non-negative — callers frame
 *   this as the fixed ratified max, not aggregate.js's own run-scoped `possible`, so the chairman
 *   always reads progress against the standing 6/6 goal rather than a denominator that shrinks
 *   when a leg is unavailable)
 * @param {Array<{id:string, value:number|null}>} facts.legs one entry per leg to render, in
 *   display order. `value: null` (or omitted) means UNAVAILABLE for that leg — rendered as such,
 *   NEVER as 0: an unmeasured leg and a measured zero are different claims (aggregate.js's own
 *   rule, one layer down).
 * @param {string} facts.topLeverLeg the leg id to name as the top lever — MUST be a ratified leg
 *   id (RATIFIED_LEG_IDS); anything else throws.
 */
export function formatDriveBreakdown(facts = {}) {
  if (facts === null || typeof facts !== 'object') {
    throw new Error(`formatDriveBreakdown(): facts must be an object — got ${JSON.stringify(facts)}`);
  }
  // OWN PROPERTIES ONLY — see formatBody's own comment on prototype pollution; the same hazard
  // applies here and the same fix applies here.
  for (const k of ['score', 'possible', 'legs', 'topLeverLeg']) {
    if (!Object.hasOwn(facts, k)) {
      throw new Error(`formatDriveBreakdown(): ${k} must be an OWN property of facts — an inherited value means it was not computed by this run`);
    }
  }
  const { score, possible, legs, topLeverLeg } = facts;

  for (const [k, v] of Object.entries({ score, possible })) {
    if (!Number.isFinite(v) || v < 0) throw new Error(`formatDriveBreakdown(): ${k} must be a non-negative number — got ${JSON.stringify(v)}`);
  }
  if (!Array.isArray(legs) || legs.length === 0) {
    throw new Error('formatDriveBreakdown(): legs must be a non-empty array');
  }

  const legParts = legs.map((leg) => {
    if (!leg || typeof leg !== 'object' || typeof leg.id !== 'string' || leg.id.trim() === '') {
      throw new Error(`formatDriveBreakdown(): every leg needs a string id — got ${JSON.stringify(leg)}`);
    }
    // UNAVAILABLE, never 0. `value` may be absent, null, or undefined — all three mean the same
    // thing here: nothing was measured for this leg on the row this facts object was built from
    // (e.g. an old-shape pre-migration row that predates per-leg values entirely).
    if (leg.value === null || leg.value === undefined) {
      return `${leg.id} unavailable`;
    }
    if (!Number.isFinite(leg.value) || leg.value < 0) {
      throw new Error(`formatDriveBreakdown(): leg ${leg.id} value must be a non-negative number — got ${JSON.stringify(leg.value)}`);
    }
    return `${leg.id} ${leg.value}`;
  });

  // CLOSED-SET, imported — never a locally re-declared id list, and never a free-text reason. The
  // whole point of naming a leg id (not a prose explanation) is that "top lever" stays a pointer
  // into the ratified vocabulary a reader can cross-check, not another string this function would
  // have to trust.
  if (typeof topLeverLeg !== 'string' || !RATIFIED_LEG_IDS.includes(topLeverLeg)) {
    throw new Error(`formatDriveBreakdown(): topLeverLeg must be one of ${RATIFIED_LEG_IDS.join(', ')} — got ${JSON.stringify(topLeverLeg)}`);
  }

  const body = `${score}/${possible} = ${legParts.join(' + ')}; top lever: ${topLeverLeg}`;
  if (body.length > MAX_BREAKDOWN_CHARS) throw new Error('formatDriveBreakdown(): body exceeds the breakdown length budget');
  return body;
}

/**
 * The body for "there is no fresh report", which TR-3 requires be sent as its own fact rather
 * than suppressed: no report IS the signal that the instrument or the Adam seat is down, and a
 * silent cron is indistinguishable from a healthy quiet day.
 *
 * Closed vocabulary, exactly like formatBody — a number and fixed literals, no interpolated
 * text. It is a SEPARATE function rather than a flag on formatBody because the two messages
 * carry different facts, and giving formatBody a "reason" parameter is precisely the free-text
 * hole this module exists to not have.
 *
 * @param {{ageHours: number|null}} o ageHours null = no report has EVER been produced
 */
export const MISSING_KINDS = Object.freeze(['NONE', 'STALE', 'UNUSABLE']);

export function formatMissingBody({ kind = 'NONE', ageHours = null } = {}) {
  if (!MISSING_KINDS.includes(kind)) {
    throw new Error(`formatMissingBody(): kind must be one of ${MISSING_KINDS.join(', ')} — got ${JSON.stringify(kind)}`);
  }
  // NEGATIVE AGES ARE ACCEPTED AND CLAMPED BY THE CALLER, NOT REFUSED HERE.
  //
  // The first version threw on ageHours < 0, and that was a defect of exactly the kind this SD
  // exists to find: the throw lived on the MISSING branch ONLY, so the alarm crashed precisely
  // when it had something to report and never when things were fine. Its failure was perfectly
  // correlated with the condition it existed to announce.
  //
  // And it needed no attacker. generated_at is stamped from the PRODUCER's wall clock and
  // compared against Date.now() on a DIFFERENT runner — MEASURED, a 3-SECOND skew was enough to
  // throw. One future-dated row also wins ORDER BY generated_at DESC, so it would have killed
  // every tick from then on. Found by the SECURITY sub-agent.
  if (ageHours !== null && !Number.isFinite(ageHours)) {
    throw new Error(`formatMissingBody(): ageHours must be null or a finite number — got ${JSON.stringify(ageHours)}`);
  }
  const hours = ageHours === null ? null : Math.max(0, Math.round(ageHours));

  if (kind === 'NONE' || hours === null) return 'Drive report MISSING: none ever produced';
  // UNUSABLE is its own literal because "STALE: last one 0h ago" is self-contradicting, and
  // worse, it points the chairman at a dead producer when the producer ran fine and it is the
  // SCORE that is unreadable. Different cause, different remedy, so a different sentence.
  if (kind === 'UNUSABLE') return `Drive report UNUSABLE: produced ${hours}h ago, score unreadable`;
  return `Drive report STALE: last one ${hours}h ago`;
}

/**
 * @param {object} o
 * @param {object} [o.facts] the numeric/enumerated facts — see formatBody
 * @param {{ageHours:number|null}} [o.missing] send the no-fresh-report signal instead. EXACTLY
 *   one of facts/missing — never both, never neither.
 * @param {string[]} o.recipients E.164 numbers
 * @param {(to:string, body:string) => Promise<object>} o.send injected, so sends are COUNTED
 * @param {(runId:string) => Promise<boolean>} [o.findSent] idempotence probe
 * @param {(o:object) => Promise<void>} [o.recordSent] durability: mark the run as sent
 * @param {string} o.runId
 */
export async function sendDriveSms({ facts, missing = null, recipients = [], send, findSent = null, recordSent = null, runId } = {}) {
  if (typeof send !== 'function') {
    throw new Error('sendDriveSms(): send must be injected — "did it send twice?" is unanswerable about a hidden client');
  }
  if (typeof runId !== 'string' || runId.trim().length === 0) {
    throw new Error('sendDriveSms(): runId is required — it is the idempotence key, and without it a retry double-sends');
  }

  const invalid = recipients.filter((r) => !isE164(r));
  if (invalid.length > 0) {
    // Refuse the whole run rather than silently dropping the bad ones: a partial send that looks
    // complete is how a recipient quietly stops receiving alerts nobody notices are missing.
    throw new Error(`sendDriveSms(): ${invalid.length} recipient(s) are not E.164 — refusing the run rather than sending partially`);
  }
  if (recipients.length === 0) throw new Error('sendDriveSms(): no recipients — a send to nobody is a failed run, not a quiet success');
  if (recipients.length > MAX_RECIPIENTS) {
    throw new Error(`sendDriveSms(): ${recipients.length} recipients exceeds the cap of ${MAX_RECIPIENTS} — an unbounded list on a retrying cron is a bill and a trust problem`);
  }

  if (findSent && await findSent(runId)) {
    return { sent: false, skipped: 'already_sent', run_id: runId, recipients: 0 };
  }

  // EXACTLY ONE of facts/missing. Both would mean the caller does not know which message it is
  // sending; neither would mean an empty send. Refusing here keeps "which signal did the
  // chairman get?" answerable from the arguments alone.
  if ((facts && missing) || (!facts && !missing)) {
    throw new Error('sendDriveSms(): supply EXACTLY ONE of facts or missing — both is ambiguous, neither is an empty send');
  }

  // Built once, before the loop. NOTE, honestly: this ordering is for clarity, NOT a guard —
  // I mutated it to build inside the loop and NOTHING went red, because formatBody is
  // deterministic and its argument is evaluated before the first send() either way. So the
  // "half the recipients messaged" hazard does not exist in this shape, and claiming the ordering
  // prevents it would be asserting a guarantee nothing enforces. What IS enforced is that a bad
  // `facts` sends to nobody, which the test does discriminate.
  const body = missing ? formatMissingBody(missing) : formatBody(facts);

  const results = [];
  for (const to of recipients) results.push(await send(to, body));

  if (recordSent) await recordSent({ run_id: runId, recipients: recipients.length, body });
  return { sent: true, run_id: runId, recipients: recipients.length, body, results };
}
