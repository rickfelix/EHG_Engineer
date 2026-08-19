/**
 * Minimal cron-hour-field parser and gap-subtraction helper.
 * SD-FDBK-ENH-PERIODIC-LIVENESS-WATCHER-001, FR-1/FR-2/TR-1.
 *
 * NOT a general-purpose cron library -- covers only this repo's actual cron shapes ('*',
 * '*_/N' step intervals, and comma-separated hour lists/ranges like '0-2,10-23'), confirmed by
 * LEAD-phase Explore-agent discovery to be the full set in use. All times are evaluated in UTC,
 * matching GitHub Actions' own cron scheduling timezone.
 *
 * PRECISION NOTE: gapAdjustedAgeMs() operates on hour-aligned buckets, not the cron's actual
 * minute field -- a fire at 02:15 is treated as "hour 2 is covered" for the whole 02:00-03:00
 * bucket. This is a deliberate simplification (TR-1: minimal, not exhaustive), and it is biased
 * SAFE: it can only under-count a gap (slightly over-count staleness) by up to one hour at each
 * boundary, never the reverse -- it never hides genuine staleness to make a dead process look
 * healthier than bucket-level truth.
 */

function parseHourField(hourField) {
  const hours = new Set();
  if (hourField === '*') {
    for (let h = 0; h < 24; h++) hours.add(h);
    return hours;
  }
  const stepMatch = /^\*\/(\d+)$/.exec(hourField);
  if (stepMatch) {
    const step = Number(stepMatch[1]);
    if (step > 0) {
      for (let h = 0; h < 24; h += step) hours.add(h);
    }
    return hours;
  }
  for (const part of hourField.split(',')) {
    const rangeMatch = /^(\d+)-(\d+)$/.exec(part);
    if (rangeMatch) {
      const a = Number(rangeMatch[1]);
      const b = Number(rangeMatch[2]);
      // SECURITY review (EXEC-TO-PLAN, PR #7300/#7304 follow-up): an out-of-domain or malformed
      // range (e.g. '24-30', or a typo'd '0-3000000') used to add hours getUTCHours() can NEVER
      // match, so every bucket in gapAdjustedAgeMs's walk read as "gap" and staleness pinned at
      // 0 forever -- a silent, PERMANENT alarm suppression, exactly the fabricated-gap failure
      // mode this file's own doc comment says is impossible. Reject the whole range instead of
      // partially/incorrectly adding it -- the reader below still resolves this to "no usable
      // gap data" (raw elapsed time), the safe direction, never a wrong-but-plausible one. The
      // in-domain bound also closes an unbounded-loop cost for a large malformed range.
      if (Number.isInteger(a) && Number.isInteger(b) && a >= 0 && a <= 23 && b >= 0 && b <= 23 && a <= b) {
        for (let h = a; h <= b; h++) hours.add(h);
      }
    } else if (/^\d+$/.test(part)) {
      const h = Number(part);
      if (h >= 0 && h <= 23) hours.add(h);
    }
    // Any other shape (step-within-range, named lists, out-of-domain values, etc.) is silently
    // skipped -- an empty or partial result reads as "no usable gap data" via the size checks
    // below, never as a fabricated gap that could wrongly suppress a real alarm.
  }
  return hours;
}

/**
 * @param {string} cronExpr - five-field cron expression, e.g. '15 0-2,10-23 * * *'
 * @returns {Set<number>|null} hours-of-day (UTC) the cron fires in, or null if unparseable
 */
export function parseCronHours(cronExpr) {
  if (typeof cronExpr !== 'string') return null;
  const parts = cronExpr.trim().split(/\s+/);
  // SECURITY review: this parser only understands standard 5-field cron (see file doc comment).
  // A 6+ field expression (e.g. a seconds-first variant) used to pass the old `< 5` check and
  // silently read the WRONG field as "hours" -- exact field count, not a minimum, so a shape this
  // module doesn't understand falls back to "unparseable" (raw elapsed time) instead of a
  // plausible-looking wrong answer.
  if (parts.length !== 5) return null;
  const hours = parseHourField(parts[1]);
  return hours.size > 0 ? hours : null;
}

/** True when the cron expression declares a genuine gap (does not fire in every hour of the day). */
export function hasDeclaredGap(cronExpr) {
  const hours = parseCronHours(cronExpr);
  return !!hours && hours.size < 24;
}

/**
 * Width in seconds of the largest contiguous non-firing hour range in a day (0 if the cron fires
 * every hour). Walks the 24h cycle twice to correctly measure a gap that wraps midnight (e.g. a
 * cron active only 10-23 has one true gap spanning 00-09, not two separate pieces). Used by the
 * arm-time coverage guard (FR-4) -- an approximation for a sanity-check warning, not a precise
 * inter-fire silence duration (which also depends on the minute field).
 */
export function largestDeclaredGapSeconds(cronExpr) {
  const hours = parseCronHours(cronExpr);
  if (!hours || hours.size >= 24) return 0;
  let longest = 0;
  let current = 0;
  for (let i = 0; i < 48; i++) {
    if (!hours.has(i % 24)) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return Math.min(longest, 24) * 3600;
}

/**
 * Gap-subtracted elapsed time between sinceMs and atMs: hours the cron does not fire in do not
 * count against staleness. Falls back to plain elapsed time when cronExpr is absent/unparseable
 * or declares no gap -- safe no-op for every row that predates this fix.
 *
 * MONOTONIC BY CONSTRUCTION (TS-9): this subtracts gap time from a FIXED [sinceMs, atMs] window
 * -- it never resets sinceMs, so a dead process's gap-adjusted staleness keeps growing every tick
 * outside gap hours, across any number of gap cycles. Callers must never treat "currently inside
 * a declared gap" as a signal to reset consecutive-miss state; only an actual fresh last_fired_at
 * may do that -- gap-awareness suppresses the alarm at a given tick, it must not erase the
 * underlying staleness signal a later tick needs to detect a genuinely dead process.
 *
 * @param {string|undefined|null} cronExpr
 * @param {number} sinceMs
 * @param {number} atMs
 * @returns {number} gap-adjusted elapsed milliseconds (never negative, never exceeds atMs-sinceMs)
 */
export function gapAdjustedAgeMs(cronExpr, sinceMs, atMs) {
  const rawAgeMs = Math.max(0, atMs - sinceMs);
  const hours = parseCronHours(cronExpr);
  if (!hours || hours.size >= 24 || rawAgeMs === 0) return rawAgeMs;

  const ONE_HOUR_MS = 3_600_000;
  let gapMs = 0;
  let cursor = sinceMs;
  while (cursor < atMs) {
    const bucketStart = Math.floor(cursor / ONE_HOUR_MS) * ONE_HOUR_MS;
    const bucketEnd = bucketStart + ONE_HOUR_MS;
    const segmentEnd = Math.min(bucketEnd, atMs);
    if (!hours.has(new Date(bucketStart).getUTCHours())) {
      gapMs += segmentEnd - cursor;
    }
    cursor = segmentEnd;
  }
  return rawAgeMs - gapMs;
}
