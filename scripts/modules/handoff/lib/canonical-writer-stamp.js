/**
 * SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 / FR-4.
 *
 * handoff.js's registry identity for the canonical-writer choke on strategic_directives_v2.
 *
 * Every own-UPDATE site under scripts/modules/handoff/** that writes status, current_phase, or
 * completion_date must include `lifecycle_write_token: CANONICAL_WRITER_STAMP` in the SAME update
 * payload — the guard trigger validates the value within that one statement, and a stamp sent in a
 * separate statement is no stamp at all.
 *
 * ONE identity covers all of them, including BOTH rollback/compensation branches: a rollback is the
 * compensating write for the same transition, not a distinct writer.
 *
 * The literal lives here and nowhere else. It must match a writer_identity row in
 * public.sd_canonical_writer_policy() exactly (see
 * database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql); a second copy
 * of it in a call site is the drift FR-5's SSOT contract exists to prevent.
 *
 * ⚠️ THIS MODULE REQUIRES A DATABASE MIGRATION TO BE APPLIED FIRST.
 *
 *     database/chairman-gated/20260824_strategic_directives_lifecycle_write_token_column.sql
 *
 * Nothing in this file works until strategic_directives_v2.lifecycle_write_token EXISTS. That is a
 * hard prerequisite for MERGING this code, not merely for the guard trigger to function later.
 *
 * An earlier version of this comment claimed the opposite — that sending the column was "harmless
 * before the migration applies". THAT WAS FALSE, and it was corrected by measurement (security-agent
 * EXEC review, then re-measured here 2026-08-24 with a zero-write probe — predicate matched no row):
 *
 *   .update({ lifecycle_write_token: 'handoff.js', status: 'draft' }).eq('id', '<no such row>')
 *     -> { data: null, error: { code: 'PGRST204', message: "Could not find the
 *          'lifecycle_write_token' column of 'strategic_directives_v2' in the schema cache" } }
 *   ...while the same call carrying only pre-existing columns returns { data: [], error: null }.
 *
 * PostgREST validates the payload against its schema cache BEFORE matching any row, so if this code
 * ships while the column is absent, EVERY wired site fails on its first real call — every handoff
 * transition, not a subset. And PGRST204 is not SDCW1, so isCanonicalWriteRejection() returns FALSE
 * and the two compensation paths fall straight back to log-and-swallow: the silent-rollback outcome
 * FR-4's F8 amendment exists to prevent, reached through a different door.
 *
 * REQUIRED ORDER:
 *   1. Apply database/chairman-gated/20260824_strategic_directives_lifecycle_write_token_column.sql
 *      and CONFIRM the column is present. That migration is deliberately separate from the guard
 *      ceremony precisely so it can land first.
 *   2. Then deploy this code.
 *   3. Then, later, run the guard ceremony (…_canonical_writer_choke.sql).
 *
 * A MODE 1 rollback of step 3 is safe and needs no code revert — it retains the column on purpose,
 * so these payloads keep succeeding against an unvalidated column. Reverting step 1 is NOT safe
 * while this code is deployed.
 */
export const CANONICAL_WRITER_STAMP = 'handoff.js';

/**
 * SQLSTATE raised by aaa_/zzz_enforce_canonical_lifecycle_write for BOTH rejection cases
 * (missing stamp, and stamp value absent from the registry). They are distinguished by message
 * text, never by code.
 */
export const CANONICAL_WRITE_SQLSTATE = 'SDCW1';

/**
 * True when a Supabase/PostgREST error object is the guard rejecting an unstamped or
 * unregistered protected-column write.
 *
 * MEASURED END TO END, not assumed — TS-29 Stage 1, live against PostgREST + supabase-js on
 * 2026-08-24 (scripts/sdcw1-sqlstate-roundtrip-probe.mjs; raw observations in
 * database/evidence/canonical-writer-choke/TS-29-stage1-sqlstate-roundtrip.json). The open question
 * was whether a CUSTOM 5-character SQLSTATE in the unassigned range survives PostgREST's
 * error-translation layer, since every prior "it round-trips" datapoint used STANDARD codes. It does:
 *   - a rejection arrives as `{code:'SDCW1', message, details, hint}` — code and message VERBATIM,
 *     HTTP 400 (PostgREST maps an unknown SQLSTATE to Bad Request, NOT 500)
 *   - a lost CAS race / zero-row predicate arrives as `error: null` with `data: []`
 * So `error !== null` genuinely discriminates the two, and no message-text fallback is needed.
 *
 * LATENT TRAP, ALSO CONFIRMED LIVE: on a REJECTION that also calls `.select()`, supabase-js returns
 * `data: null` — NOT `[]`. Only the zero-row case returns `[]`. Any code reading `data.length` near a
 * rejection path must guard with `Array.isArray(data)` first; cas-completion.js already does.
 *
 * FIELD-NAME TRAP: the DETAIL payload is `error.details` (plural) through supabase-js/PostgREST, but
 * `error.detail` (singular) through node-postgres in the DDL tier. Same value, different key — do not
 * "unify" them.
 *
 * This predicate never inspects `message`: skip-and-continue.js already discriminates on message
 * text, and a second message-shaped reader would give the same string two owners.
 *
 * @param {{code?: string} | null | undefined} error
 * @returns {boolean}
 */
export function isCanonicalWriteRejection(error) {
  return Boolean(error) && error.code === CANONICAL_WRITE_SQLSTATE;
}
