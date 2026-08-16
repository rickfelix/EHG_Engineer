/**
 * Regression test for QF-20260812-112.
 *
 * worker-signal-starvation.cjs hardcoded LOOKBACK_MS = 24h on the query feeding
 * detectReplyStarvation. A signal that ages past that window falls out of the query entirely and
 * can never be reported as starved again, however much longer it waits -- the exact
 * "invisible aged-out backlog" failure the module's own header describes as the original
 * 2026-07-26 incident, recurred at the window boundary instead of the visibility-gate boundary.
 *
 * Measured live 2026-08-12: the sweep printed unanswered_over_30m=0 on every tick for 9.5h+
 * straight, while running detectReplyStarvation directly against a 7-day window found 31
 * genuinely unanswered signals, the oldest 67.5h old -- more than 2x the 24h window that was
 * silently dropping them.
 *
 * These tests verify the QUERY CONSTRUCTION (does the .gte() cutoff derive from a wide-enough
 * LOOKBACK_MS), not server-side row filtering -- the fake client here doesn't replicate Supabase's
 * own .gte() filtering (neither does the sibling worker-signal-starvation.test.js's fake), so
 * simulating "row excluded by the DB" would test the fake, not the fix. Capturing the actual
 * cutoff passed to .gte() is what proves LOOKBACK_MS is wide enough to have included the measured
 * 67.5h-old signal, which the pre-fix 24h constant could not.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { reportWorkerSignalStarvation, LOOKBACK_MS } =
  require('../../../lib/coordinator/worker-signal-starvation.cjs');

const NOW = Date.parse('2026-08-12T21:00:00.000Z');
const HOUR_MS = 3600 * 1000;

/** Captures the .gte(column, value) argument on the LIVE-table query. */
function makeCapturingDb() {
  const calls = { liveGte: null, archiveGte: null };
  return {
    calls,
    from(table) {
      const isArchive = table === 'retention_archive';
      const api = {
        select() { return api; },
        eq() { return api; },
        gte(col, val) {
          if (isArchive) calls.archiveGte = val;
          else calls.liveGte = val;
          return api;
        },
        order() { return api; },
        // QF-20260816-023: production code now pages via .range(from, to) instead of .limit(n).
        range() { return Promise.resolve({ data: [] }); },
      };
      return api;
    },
  };
}

describe('LOOKBACK_MS (QF-20260812-112)', () => {
  it('is wide enough to cover the measured 67.5h-old starved signal (was 24h)', () => {
    expect(LOOKBACK_MS).toBeGreaterThan(67.5 * HOUR_MS);
  });

  it('is a realistic, non-binding window rather than unbounded (still a real cap)', () => {
    // Guards against "fixed" by deleting the cap entirely, which trades one hazard (invisible
    // aged-out backlog) for another (an unbounded historical fetch on a busy day).
    expect(LOOKBACK_MS).toBeLessThan(365 * 24 * HOUR_MS);
  });

  it('REGRESSION: the live-table query cutoff is derived from the WIDENED window, not the old 24h', async () => {
    const db = makeCapturingDb();
    await reportWorkerSignalStarvation(db, { now: NOW, log: () => {}, env: {} });
    const cutoffMs = Date.parse(db.calls.liveGte);
    const oldTwentyFourHourCutoff = NOW - 24 * HOUR_MS;
    // The actual cutoff must be OLDER (smaller ms) than what the pre-fix 24h window would have
    // used -- i.e. the query now reaches further back in time, not the same or less.
    expect(cutoffMs).toBeLessThan(oldTwentyFourHourCutoff);
    expect(cutoffMs).toBe(NOW - LOOKBACK_MS);
  });

  it('the archive coarse-bound cutoff widens along with the live cutoff (derives from the same LOOKBACK_MS)', async () => {
    const db = makeCapturingDb();
    await reportWorkerSignalStarvation(db, { now: NOW, log: () => {}, env: {} });
    const archiveCutoffMs = Date.parse(db.calls.archiveGte);
    const oldArchiveCutoffUnderTwentyFourHourWindow = NOW - 24 * HOUR_MS - 2 * HOUR_MS; // + ARCHIVE_COARSE_SLACK_MS
    expect(archiveCutoffMs).toBeLessThan(oldArchiveCutoffUnderTwentyFourHourWindow);
  });
});
