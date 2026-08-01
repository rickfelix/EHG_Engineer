/**
 * lib/chairman/decision-disposition.mjs — the disposition reader.
 * SD-FDBK-INFRA-DECISION-QUEUE-RETIREMENT-001, FR-3.
 *
 * THE QUEUE HAS NO WAY TO LEARN THAT A DECISION WAS ALREADY MADE. Five of its seven live rows carry
 * a chairman deferral — several deferred twice — and the queue keeps presenting them as untouched and
 * ageing. The records exist, are attributable, and are read by nothing. This module is the reader.
 *
 * DELIBERATELY PURE AND DEPENDENCY-FREE, matching lib/chairman/decision-queue.mjs (:10-11): callers
 * inject rows, so the unit tier can exercise every branch without DB plumbing.
 *
 * ===== WHY target_id, MEASURED RATHER THAN CHOSEN =====
 * A review flagged a join-key split in the WRITER: scripts/chairman-decisions.mjs:96 writes
 * metadata.flag_id while :113 writes metadata.target_id — two keys for one concept, twenty lines
 * apart, and a both-directions test cannot catch it because both directions share one seeding helper.
 * So the key was settled by a FULL KEY CENSUS over the whole live population rather than by reading
 * either line: 21 of 21 chairman_decision_deferred rows carry target_id, decided_by, deferred_at and
 * decision_type. flag_id appears ZERO times. target_id is the key; the flag_id branch writes
 * something this lane never sees.
 *
 * ===== DEFERRAL IS NOT RETIREMENT, AND CONFLATING THEM WOULD BE THE WORSE BUG =====
 * A deferral says "not now", not "never" — lib/chairman/decision-queue.mjs:128-130 documents it as a
 * visibility act. So a deferral RESTARTS THE AGE CLOCK; it does not remove the row. Treating it as a
 * retirement would silently delete decisions the chairman intends to make, which is the catastrophic
 * direction for this SD. Retirement requires its own explicit disposition.
 *
 * snoozed_until is honoured when present. It is currently populated on 0 of 21 rows even though
 * feedback.snoozed_until and lib/quality/snooze-manager.js both exist — that unused affordance is
 * FR-6's actual defect, and this reader is written to consume it the moment the writer sets it.
 */

/** The feedback category the chairman-deferral writer stamps. Measured: the only category in this lane. */
export const DEFERRAL_CATEGORY = 'chairman_decision_deferred';

/**
 * PROVENANCE FENCE — WITHOUT THIS, RETIREMENT AUTHORITY IS FORGEABLE BY AN UNAUTHENTICATED PARTY.
 *
 * PROVEN LIVE, as the anon role: an anon client inserts a feedback row with
 * category='chairman_decision_deferred' and metadata {target_id: <a REAL pending decision>,
 * decided_by: 'chairman-cli'}, and retirementAuthority() ACCEPTS IT. Nothing verifies who wrote the
 * record. That forges the authority to retire a genuine chairman decision — and, because
 * ageClockFor() reads the same records, a forged deferral also resets a real decision's age clock
 * and silences its escalation on the live CLI.
 *
 * ===== A source_type-ONLY FENCE DOES NOT WORK. THIS IS THE CORRECTED VERSION. =====
 * The first attempt fenced on source_type='auto_capture' alone, on the stated premise that "the
 * anon INSERT policy constrains source_type to 'telegram'". THAT PREMISE WAS FALSE, and the probe
 * that "confirmed" it was a false negative twice over:
 *   (1) `feedback` has TWO permissive anon INSERT policies, and RLS OR-s them. The probe only ever
 *       satisfied the telegram-shaped one. The second policy, venture_user_insert_feedback, places
 *       NO constraint on source_type at all.
 *   (2) 42501 is raised BOTH by a rejected INSERT and by a SUCCEEDING insert whose RETURNING clause
 *       fails the (telegram-only) anon SELECT policy. A bare supabase-js .insert() omits RETURNING
 *       and lands 201. Reading the client's error code cannot distinguish the two — only a
 *       SERVICE-ROLE READ-BACK can. Re-demonstrated live: anon INSERT -> 201, row persisted,
 *       forged authority GRANTED.
 *
 * ===== THE FENCE IS DERIVED FROM THE POLICY PREDICATES, NOT FROM A CORRELATION =====
 * The two anon INSERT policies force MUTUALLY EXCLUSIVE row shapes:
 *   telegram_bot_insert_feedback  WITH CHECK (source_type = 'telegram')
 *   venture_user_insert_feedback  WITH CHECK (feedback_type LIKE 'user_%' AND venture_id IS NOT NULL
 *                                             AND venture_exists_and_active(venture_id) AND ...)
 * All 21 genuine deferrals are, unanimously: source_type='auto_capture', venture_id IS NULL,
 * feedback_type='sentry_error'. So requiring all three rejects BOTH anon paths by construction:
 *   - to pass telegram_bot_insert_feedback an attacker MUST set source_type='telegram'   -> fails (1)
 *   - to pass venture_user_insert_feedback an attacker MUST set venture_id NOT NULL AND
 *     feedback_type LIKE 'user_%'                                                        -> fails (2) and (3)
 * (3) is redundant with (2) against today's policy set and is kept deliberately: two independent
 * blocks on the same policy means adding one column to a future policy does not silently re-open it.
 *
 * LIMIT OF THIS CONTROL, STATED PLAINLY: it is derived from the CURRENT live policy set. A future
 * third anon INSERT policy permitting venture_id IS NULL with an arbitrary source_type would defeat
 * it, and nothing here would notice. The durable fix is DB-side — a BEFORE trigger stamping the
 * writer identity, or moving chairman deferrals to a table with no anon INSERT policy — which is
 * DDL and therefore chairman-gated. Routed separately; this fence is the reader-side stopgap.
 */
export const TRUSTED_SOURCE_TYPE = 'auto_capture';

/**
 * feedback_type values reachable by anon via venture_user_insert_feedback, whose predicate is
 * `feedback_type LIKE 'user_%'`.
 *
 * THIS MIRRORS SQL `LIKE` SEMANTICS DELIBERATELY, and an earlier version did not. In SQL LIKE, `_`
 * is a SINGLE-CHARACTER WILDCARD — so 'userX', 'usera' and 'user-bug' all satisfy the policy while
 * failing a literal JS startsWith('user_'). With the literal check, clause 3 admitted rows the
 * policy admits, which made the "independent second block" claim in the header FALSE.
 *
 * Not exploitable when found: feedback_feedback_type_check enumerates exactly six values
 * (sentry_error / user_bug / user_feature_request / user_usability / user_other / venture_error) and
 * none match LIKE-but-not-startsWith, and clause 2 blocks that shape regardless. Corrected anyway,
 * because a documented guarantee that is weaker than it reads is the defect class this SD exists to
 * remove — and it silently stops blocking the moment the CHECK constraint gains a value like
 * 'userland_x'.
 *
 * The character class is [\s\S], not `.`, because JS `.` excludes line terminators while SQL `_`
 * matches them — so 'user\nx' satisfied the policy while passing a /^user./ fence. Same defect as
 * the literal-underscore version, one layer down. Not exploitable (no CHECK-permitted value
 * contains a newline, and clause 2 blocks the shape), fixed so "mirrors the SQL predicate exactly"
 * is a true statement rather than an almost-true one.
 */
export const UNTRUSTED_FEEDBACK_TYPE_RE = /^user[\s\S]/;

/**
 * The columns a caller MUST select for the fence to be evaluable.
 *
 * EXPORTED SO THE CONSUMER CANNOT DRIFT FROM IT, and that is not hypothetical: the first version of
 * this fence shipped while scripts/chairman-decisions.mjs selected only
 * `id, category, created_at, snoozed_until, metadata, description, title`. `source_type` was
 * therefore `undefined` on EVERY production row, the fence rejected all 21 of them, and FR-6 was
 * DEAD IN PRODUCTION — while all 32 unit tests stayed green, because every fixture hand-supplied
 * source_type. Measured: 0 dispositions via the real select, 15 via the same rows with source_type
 * added. A green suite proved nothing because it never used the consumer's own query.
 */
export const DISPOSITION_SELECT =
  'id, category, created_at, snoozed_until, metadata, description, title, source_type, venture_id, feedback_type';

/** Keys whose ABSENCE means provenance cannot be evaluated at all (see DISPOSITION_SELECT). */
export const REQUIRED_PROVENANCE_FIELDS = Object.freeze(['source_type', 'venture_id', 'feedback_type']);

/**
 * Is this record's writer establishable as the trusted chairman-deferral path?
 * FAILS CLOSED: anything not positively recognised governs nothing.
 * @param {object} r a feedback row already known to match DEFERRAL_CATEGORY
 */
export function isTrustedProvenance(r) {
  if (!r) return false;
  if (r.source_type !== TRUSTED_SOURCE_TYPE) return false;      // blocks telegram_bot_insert_feedback
  if (r.venture_id !== null && r.venture_id !== undefined) return false; // blocks venture_user_insert_feedback
  // Independent second block on venture_user_insert_feedback, matching that policy's LIKE 'user_%'
  // predicate exactly (see UNTRUSTED_FEEDBACK_TYPE_RE — `_` is a SQL wildcard, not a literal).
  // A null/absent feedback_type is unreachable via that policy, so it is not rejected here.
  if (typeof r.feedback_type === 'string' && UNTRUSTED_FEEDBACK_TYPE_RE.test(r.feedback_type)) return false;
  return true;
}

/** The join key, established by a full key census over all 21 live rows (see header). */
export const DISPOSITION_KEY = 'target_id';

/**
 * Index disposition records by the decision they refer to.
 * Keeps the MOST RECENT per target: a row deferred twice is governed by the later deferral, and
 * three of the live rows have exactly that shape.
 *
 * @param {Array<object>} rows feedback rows (any categories; non-deferrals are ignored)
 * @returns {Map<string, object>} target_id -> {targetId, deferredAt, decidedBy, decisionType, snoozedUntil, basis, sourceId}
 */
export function indexDispositions(rows) {
  const out = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || r.category !== DEFERRAL_CATEGORY) continue;

    // UNDER-SELECTION IS A PROGRAMMING ERROR, NOT AN UNTRUSTED RECORD — and it must never be
    // silently indistinguishable from one. A caller that omits these columns previously produced
    // "0 dispositions" that looked exactly like "0 trusted dispositions", which is how FR-6 shipped
    // dead (see DISPOSITION_SELECT). Throw loudly instead; build the select from DISPOSITION_SELECT.
    const missing = REQUIRED_PROVENANCE_FIELDS.filter(f => !Object.prototype.hasOwnProperty.call(r, f));
    if (missing.length) {
      throw new Error(
        `indexDispositions: row ${r.id} matched ${DEFERRAL_CATEGORY} but is missing provenance ` +
        `column(s) [${missing.join(', ')}] — the caller under-selected. Select DISPOSITION_SELECT. ` +
        'Refusing to evaluate provenance on an incomplete row.'
      );
    }

    // THE FENCE. A record whose writer cannot be established governs nothing — not the age clock,
    // not retirement. Same rule retirementAuthority() applies to a record with no actor.
    if (!isTrustedProvenance(r)) continue;
    const md = r.metadata || {};
    const targetId = md[DISPOSITION_KEY];
    if (!targetId) continue; // no key, no claim — a record we cannot attribute governs nothing
    const deferredAt = md.deferred_at || r.created_at || null;
    const prev = out.get(targetId);
    if (prev && Date.parse(prev.deferredAt) >= Date.parse(deferredAt)) continue;
    out.set(targetId, {
      targetId,
      deferredAt,
      decidedBy: md.decided_by || null,
      decisionType: md.decision_type || null,
      snoozedUntil: r.snoozed_until || null,
      basis: r.description || r.title || null,
      sourceId: r.id
    });
  }
  return out;
}

/**
 * The effective age clock for a row: the deferral if one exists, otherwise creation.
 * THIS IS THE WHOLE POINT — the queue ages every row from created_at, so a decision the chairman
 * deferred yesterday still presents as 56 days stale and escalates on that basis.
 *
 * @returns {{since: string|null, source: 'deferral'|'creation', disposition: object|null}}
 */
export function ageClockFor(row, dispositions) {
  const id = row?.id;
  const d = id && dispositions instanceof Map ? dispositions.get(id) : null;
  if (d && d.deferredAt) return { since: d.deferredAt, source: 'deferral', disposition: d };
  return { since: row?.created_at || null, source: 'creation', disposition: null };
}

/**
 * Is this row under an ACTIVE hold right now?
 * A deferral with a snoozed_until in the future is held until then. A deferral without one is an
 * open-ended "not now": it restarts the clock (see ageClockFor) but does not suppress the row,
 * because suppressing indefinitely on an unbounded record would hide decisions permanently.
 */
export function isHeld(row, dispositions, now = new Date()) {
  const id = row?.id;
  const d = id && dispositions instanceof Map ? dispositions.get(id) : null;
  if (!d || !d.snoozedUntil) return false;
  const until = Date.parse(d.snoozedUntil);
  return Number.isFinite(until) && until > now.getTime();
}

/**
 * The authority for retiring a row, or null. FR-3: absence of authority BLOCKS retirement rather
 * than defaulting it, so this returns null rather than a permissive object and every caller must
 * handle null explicitly.
 *
 * Returns the citation a retirement must record — never a bare boolean, because "retired" without
 * a basis is exactly the unattributable stamp this SD exists to remove.
 */
export function retirementAuthority(row, dispositions) {
  const id = row?.id;
  const d = id && dispositions instanceof Map ? dispositions.get(id) : null;
  if (!d) return null;
  if (!d.deferredAt || !d.decidedBy) return null; // an unattributable record authorises nothing
  return {
    targetId: d.targetId,
    citedRecord: d.sourceId,
    decidedBy: d.decidedBy,
    decidedAt: d.deferredAt,
    basis: d.basis,
    disposition: 'deferred'
  };
}
