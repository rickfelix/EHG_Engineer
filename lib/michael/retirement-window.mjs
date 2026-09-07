// lib/michael/retirement-window.mjs — computes whether the fourteen-morning success window
// (vision doc 01-VISION.md §8) has elapsed, gating step 4 of the _Cowork retirement
// (SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-I). Modeled on lib/ship/witness-adoption.mjs's
// computeAdoptionReadiness SHAPE only, deliberately NOT its semantics: that model skips
// evidence-free days (a PR-adoption streak has no meaning gap-free), but this window gates an
// IRREVERSIBLE host folder deletion, so ANY missing/unverified date BREAKS the streak instead
// (PLAN-TO-EXEC TESTING finding A5, testing-agent:a4cc2b598c73322da).
//
// A "successful morning" is BOTH: a michael_brief_runs row for that et_date with verified = true,
// AND a michael_feedback_ledger row for that same et_date. NOT michael_brief_runs.surfaced_at,
// which is declared in the schema (database/migrations/20260906_michael_tables.sql:276) but never
// written by any code in scripts/michael or lib/michael (confirmed dead by construction at LEAD).
//
// windowStartEtDate has no derivation source anywhere in code or DB -- no go-live/parallel-read
// marker exists yet -- so it is always an explicit, validated CALLER input, never auto-detected.
// requiredConsecutiveDays is never exposed as a CLI flag by retire-cowork.mjs: lowering the
// fourteen-morning guarantee is not a per-run decision.

import { todayEt } from './db.mjs';

export const MIN_REQUIRED_CONSECUTIVE_DAYS = 14;

const ET_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Pure: is `s` a real calendar date in YYYY-MM-DD form (rejects 2026-13-01, 2026-02-30, etc.)? */
export function isValidEtDate(s) {
  if (typeof s !== 'string' || !ET_DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Pure: the ET date `days` after `etDate` (YYYY-MM-DD). UTC-midnight arithmetic — the same idiom
 * as scripts/michael/retention.mjs's cutoffEtDate, run forward instead of backward. DST-safe by
 * construction: this never touches a local-timezone Date, only UTC calendar-day increments.
 */
export function addEtDays(etDate, days) {
  const d = new Date(`${etDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Pure: the ordered list of `requiredConsecutiveDays` ET dates starting at windowStartEtDate. */
export function windowDates(windowStartEtDate, requiredConsecutiveDays) {
  return Array.from({ length: requiredConsecutiveDays }, (_, i) => addEtDays(windowStartEtDate, i));
}

/**
 * Pure. `briefRunsByDate` / `ledgerByDate` are plain objects keyed by et_date; a brief_runs entry
 * counts only when `.verified === true`. `today` is the caller's own todayEt() result — injected,
 * never computed inside this function, so a wrong "now" is the caller's bug, not a hidden one here.
 *
 * Returns { ready, consecutiveDays, reason, ... }. Any gap in the window BREAKS the streak (the
 * opposite of the witness-adoption.mjs model this was shaped after) — never silently skipped.
 */
export function computeRetirementWindow({
  windowStartEtDate,
  today = todayEt(),
  briefRunsByDate = {},
  ledgerByDate = {},
  requiredConsecutiveDays = MIN_REQUIRED_CONSECUTIVE_DAYS,
} = {}) {
  if (!isValidEtDate(windowStartEtDate)) {
    return { ready: false, consecutiveDays: 0, reason: 'INVALID_WINDOW_START', detail: `windowStartEtDate ${JSON.stringify(windowStartEtDate)} is not a valid YYYY-MM-DD ET date` };
  }
  if (!isValidEtDate(today)) {
    return { ready: false, consecutiveDays: 0, reason: 'INVALID_TODAY', detail: `today ${JSON.stringify(today)} is not a valid YYYY-MM-DD ET date` };
  }
  if (!Number.isInteger(requiredConsecutiveDays) || requiredConsecutiveDays < MIN_REQUIRED_CONSECUTIVE_DAYS) {
    return { ready: false, consecutiveDays: 0, reason: 'REQUIRED_DAYS_BELOW_FLOOR', detail: `requiredConsecutiveDays ${requiredConsecutiveDays} is below the ${MIN_REQUIRED_CONSECUTIVE_DAYS}-day floor — never CLI-lowerable` };
  }

  const dates = windowDates(windowStartEtDate, requiredConsecutiveDays);
  const windowEnd = dates[dates.length - 1];
  if (windowEnd > today) {
    return { ready: false, consecutiveDays: 0, reason: 'WINDOW_NOT_YET_ELAPSED', detail: `window runs ${windowStartEtDate}..${windowEnd}, today is only ${today}` };
  }

  let consecutiveDays = 0;
  for (const d of dates) {
    const brief = briefRunsByDate[d];
    const verified = Boolean(brief && brief.verified === true);
    const ledgered = Boolean(ledgerByDate[d]);
    if (verified && ledgered) { consecutiveDays++; continue; }
    const gapReason = !verified && !ledgered ? 'NO_VERIFIED_BRIEF_AND_NO_LEDGER_ENTRY'
      : !verified ? 'NO_VERIFIED_BRIEF'
      : 'NO_LEDGER_ENTRY';
    return { ready: false, consecutiveDays, reason: 'WINDOW_HAS_GAP', gapDate: d, gapReason, detail: `${d}: ${gapReason}` };
  }
  return { ready: true, consecutiveDays, reason: 'WINDOW_ELAPSED', windowStartEtDate, windowEnd };
}
