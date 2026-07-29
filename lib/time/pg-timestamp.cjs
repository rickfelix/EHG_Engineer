/**
 * SD-LEO-INFRA-REPO-WIDE-TIMEZONE-001 FR-1 — the canonical timezone normalizer.
 *
 * THE BUG THIS CLOSES. Several columns on quick_fixes and strategic_directives_v2 are
 * `timestamp without time zone`, so PostgREST returns them with NO designator:
 * "2026-07-29T05:25:20.028". JavaScript parses a naive string as LOCAL time, so any
 * client-side row-vs-NOW age is shifted by the host's UTC offset. On a UTC-4 host every
 * age reads four hours younger, and anything younger than four hours reads NEGATIVE. No
 * error is thrown — `if (error)` cannot catch it — so the wrong number renders as fact.
 *
 * WHY THIS FILE IS .cjs, WHICH IS THE ONLY DESIGN DECISION HERE.
 * The class was fixed four times without ever reaching the claim path, and the recorded
 * belief for why is that CJS cannot require ESM. THAT BELIEF IS FALSE — require(esm) has
 * been stable since Node 22.12 and this fleet runs 24; requiring the existing ESM
 * parseAsUTC from a .cjs works today. It was tested, not assumed.
 *
 * The real constraint is narrower: require() of ESM fails with ERR_REQUIRE_ASYNC_MODULE
 * against any module carrying a TOP-LEVEL AWAIT, and one file in this repo
 * (scripts/hooks/stop-subagent-enforcement.js:99) genuinely has one. So an ESM home for
 * the canonical helper would impose a permanent, invisible "never add a top-level await
 * to this file" constraint on every future editor — a constraint nothing in the code
 * would state and no test would catch. A CJS home removes it: ESM can `import` CJS
 * unconditionally, with no equivalent restriction.
 *
 * Corroborating, and the reason this is not a coin flip: at least seven CJS files had
 * already reinvented this same append-Z logic privately under local names (toMs, tsMs)
 * rather than reuse anything. The demand on the CJS side is demonstrated, not predicted.
 *
 * DO NOT restate "CJS cannot require ESM" in a comment or commit message. It is refuted,
 * and repeating it is what produced four incomplete passes and one documented verbatim
 * copy (scripts/worker-checkin.cjs:585-587).
 *
 * SCOPE — read this before reaching for it.
 *   USE IT for ROW-vs-NOW: comparing a naive DB timestamp against Date.now().
 *   DO NOT USE IT for ROW-vs-ROW: two naive timestamps compared to each other both shift
 *     identically, so the ordering is already correct. Normalizing them changes nothing
 *     and risks a ranking regression for no defect closed.
 *   DO NOT USE IT on tz-aware columns. quick_fixes.not_before,
 *     strategic_directives_v2.completion_date and .quality_checked_at are TIMESTAMPTZ
 *     (verified against information_schema, not inferred from migrations) and already
 *     parse correctly. Passing them through here is harmless — see the hasTZ guard — but
 *     touching those call sites is churn.
 *   SERVER-SIDE FILTERS ARE NOT AFFECTED. A .gte('updated_at', isoString) is evaluated by
 *     Postgres, where the naive column's digits already equal UTC, so it compares
 *     correctly. Only client-side arithmetic on a returned string is broken.
 */

/**
 * Interpret a PostgREST timestamp as UTC.
 *
 * Already-tz-aware inputs (trailing Z, or a +HH:MM / +HHMM offset) are passed through
 * untouched — appending Z to those would corrupt them, which is how a naive "just add Z"
 * fix creates the very churn this SD forbids.
 *
 * @param {string|Date|null|undefined} ts
 * @returns {Date|null} null for null/undefined/empty; an Invalid Date is returned as-is so
 *   callers keep their existing Number.isFinite / isNaN guards rather than silently
 *   receiving a plausible wrong instant.
 */
function parsePgTimestamp(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts !== 'string') return null;
  const hasTZ = /Z$|[+-]\d{2}:?\d{2}$/.test(ts);
  return new Date(hasTZ ? ts : `${ts}Z`);
}

/**
 * Epoch milliseconds for a PostgREST timestamp, or NaN.
 *
 * The ms form exists because nearly every defect site does `nowMs - parsed` arithmetic and
 * would otherwise write `.getTime()` at each call — a small per-site step that is exactly
 * where the previous copies diverged from each other.
 *
 * @param {string|Date|null|undefined} ts
 * @returns {number} epoch ms, or NaN when unparseable/absent. NaN (not 0, not null) so an
 *   existing `Number.isFinite(x)` guard keeps working and a missing timestamp can never be
 *   mistaken for 1970.
 */
function pgTimestampMs(ts) {
  const d = parsePgTimestamp(ts);
  return d ? d.getTime() : NaN;
}

/**
 * Age in milliseconds of a naive PostgREST timestamp relative to now.
 *
 * @param {string|Date|null|undefined} ts
 * @param {number} [nowMs=Date.now()] injectable clock — REQUIRED for the TZ regression test
 *   and for any pure predicate that already takes a now parameter.
 * @returns {number} age in ms, or NaN when the timestamp is absent/unparseable.
 *
 * A NEGATIVE RETURN IS THE SIGNATURE OF THIS BUG, so callers should not clamp it. A
 * Math.max(0, ...) on this value at scripts/fleet-dashboard.cjs:760 printed "0h" for every
 * impossible age and hid the defect for an entire night — the clamp that made the display
 * look sane suppressed the only self-evident symptom.
 */
function pgTimestampAgeMs(ts, nowMs = Date.now()) {
  const ms = pgTimestampMs(ts);
  return Number.isFinite(ms) ? nowMs - ms : NaN;
}

module.exports = { parsePgTimestamp, pgTimestampMs, pgTimestampAgeMs };
