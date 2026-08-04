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
 */

export const MAX_RECIPIENTS = 3;
export const MAX_BODY_CHARS = 320;   // 2 SMS segments; beyond this carriers split unpredictably
export const VERDICTS = Object.freeze(['DEFICIT-URGENT', 'DEFICIT', 'TIGHT', 'SURPLUS', 'UNKNOWN']);

/** E.164: a leading + and 8-15 digits. Anything else is not a phone number we will dial. */
export function isE164(n) {
  return typeof n === 'string' && /^\+[1-9]\d{7,14}$/.test(n);
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
