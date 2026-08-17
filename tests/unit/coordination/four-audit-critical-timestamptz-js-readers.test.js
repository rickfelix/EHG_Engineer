/**
 * SD-LEO-INFRA-FOUR-AUDIT-CRITICAL-001 FR-3 / PRD TS-3 — regression tests for the 3 confirmed
 * unguarded readers of the naive columns being migrated: lib/coordinator/strand-age-gauge.cjs's
 * tsMs()-turned-pgTimestampMs() path, and scripts/modules/sd-next/claim-analysis.js's
 * hasActiveWorkEvidence() and checkEnrichmentSignal(). Reuses the ambient-TZ pin-effectiveness
 * guard pattern from tests/unit/time/pg-timestamp-tz.test.js (this host's ambient zone is
 * America/New_York, so a naive TZ=America/New_York pin is a no-op unless verified first).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { hasActiveWorkEvidence, checkEnrichmentSignal } from '../../../scripts/modules/sd-next/claim-analysis.js';

const require = createRequire(import.meta.url);
const { planStrandAgeGauge } = require('../../../lib/coordinator/strand-age-gauge.cjs');

const TZ = 'America/New_York';
const OFFSET_HOURS = 4; // EDT; fixtures sit in July, DST in effect.
const NAIVE = '2026-07-29T05:25:20.028';
const TRUE_INSTANT = Date.parse(NAIVE + 'Z');
const DST_BOUNDARY_NAIVE = '2026-03-08T06:59:00.000'; // straddles US spring-forward (2am local, Mar 8 2026)

let originalTZ;
beforeAll(() => {
  originalTZ = process.env.TZ;
  process.env.TZ = TZ;
});
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

it('pin-effectiveness guard: the TZ pin is actually in effect for this file too', () => {
  const localParsed = Date.parse(NAIVE);
  const shiftHours = (localParsed - TRUE_INSTANT) / 3600000;
  expect(shiftHours).toBe(OFFSET_HOURS);
});

// ---------------------------------------------------------------------------
// claim-analysis.js: hasActiveWorkEvidence() (strategic_directives_v2.updated_at,
// sd_phase_handoffs.created_at)
// ---------------------------------------------------------------------------
describe('claim-analysis.js hasActiveWorkEvidence() under a pinned non-UTC timezone', () => {
  function fakeSupabase(handoffRows) {
    return {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          limit: async () => ({ data: handoffRows }),
        };
      },
    };
  }

  it('a naive updated_at 20m old (by true UTC instant) is correctly recognized as recent', async () => {
    const nowMs = TRUE_INSTANT + 20 * 60000;
    const realNow = Date.now;
    Date.now = () => nowMs;
    try {
      const sd = { current_phase: 'PLAN', progress_percentage: 0, updated_at: NAIVE };
      const { hasEvidence, reasons } = await hasActiveWorkEvidence(fakeSupabase([]), 'sd-id', sd, 30);
      expect(hasEvidence).toBe(true);
      expect(reasons[0]).toMatch(/updated 20m ago/);
    } finally {
      Date.now = realNow;
    }
  });

  it('the same fixture WOULD have been wrongly excluded by raw Date.parse (the defect, pinned)', () => {
    const nowMs = TRUE_INSTANT + 20 * 60000;
    const brokenAgeMinutes = (nowMs - Date.parse(NAIVE)) / 60000;
    // Broken: local-time misparse makes this look like it happened OFFSET_HOURS in the future,
    // producing a large negative age that a `< 30` recency window rejects.
    expect(brokenAgeMinutes).toBeLessThan(0);
  });

  it('null/absent updated_at does not throw and contributes no reason', async () => {
    const sd = { current_phase: 'PLAN', progress_percentage: 0, updated_at: null };
    const { hasEvidence, reasons } = await hasActiveWorkEvidence(fakeSupabase([]), 'sd-id', sd, 30);
    expect(hasEvidence).toBe(false);
    expect(reasons).toEqual([]);
  });

  it('malformed updated_at (pgTimestampMs -> NaN) does not throw and does not falsely count as recent', async () => {
    const sd = { current_phase: 'PLAN', progress_percentage: 0, updated_at: 'not-a-timestamp' };
    const { hasEvidence, reasons } = await hasActiveWorkEvidence(fakeSupabase([]), 'sd-id', sd, 30);
    expect(hasEvidence).toBe(false);
    expect(reasons).toEqual([]);
  });

  it('handoff created_at (sd_phase_handoffs, a distinct naive column) is normalized correctly', async () => {
    const nowMs = TRUE_INSTANT + 5 * 60000;
    const realNow = Date.now;
    Date.now = () => nowMs;
    try {
      const sd = { current_phase: 'PLAN', progress_percentage: 0, updated_at: null };
      const handoffs = [{ from_phase: 'PLAN', to_phase: 'EXEC', created_at: NAIVE }];
      const { hasEvidence, reasons } = await hasActiveWorkEvidence(fakeSupabase(handoffs), 'sd-id', sd, 30);
      expect(hasEvidence).toBe(true);
      expect(reasons[0]).toMatch(/handoff PLAN→EXEC 5m ago/);
    } finally {
      Date.now = realNow;
    }
  });

  it('DST-boundary naive timestamp is still normalized to the correct true instant', () => {
    // Not a hasActiveWorkEvidence()-shaped assertion (which only needs age-vs-now), but proves
    // the underlying normalizer the fixed call sites depend on handles the boundary correctly.
    const { pgTimestampMs } = require('../../../lib/time/pg-timestamp.cjs');
    expect(pgTimestampMs(DST_BOUNDARY_NAIVE)).toBe(Date.parse(DST_BOUNDARY_NAIVE + 'Z'));
  });
});

// ---------------------------------------------------------------------------
// claim-analysis.js: checkEnrichmentSignal() (strategic_directives_v2.updated_at) — the third
// unguarded site found by prospective TESTING review, outside FR-3's originally-cited ranges.
// ---------------------------------------------------------------------------
describe('claim-analysis.js checkEnrichmentSignal() under a pinned non-UTC timezone', () => {
  it('a naive updated_at within the window is correctly recognized as in-progress', () => {
    const nowMs = TRUE_INSTANT + 3 * 60000;
    const realNow = Date.now;
    Date.now = () => nowMs;
    try {
      const sd = { updated_by: 'session-abc', updated_at: NAIVE };
      const activeSessions = [{ session_id: 'session-abc', status: 'active' }];
      const result = checkEnrichmentSignal({ sd, activeSessions, recencyMinutes: 10 });
      expect(result.inProgress).toBe(true);
      expect(result.ageMin).toBe(3);
    } finally {
      Date.now = realNow;
    }
  });

  it('malformed updated_at returns invalid_updated_at rather than throwing or misclassifying', () => {
    const sd = { updated_by: 'session-abc', updated_at: 'garbage' };
    const result = checkEnrichmentSignal({ sd, activeSessions: [], recencyMinutes: 10 });
    expect(result.inProgress).toBe(false);
    expect(result.reason).toBe('invalid_updated_at');
  });
});

// ---------------------------------------------------------------------------
// strand-age-gauge.cjs: planStrandAgeGauge() (strategic_directives_v2.updated_at/created_at,
// sd_phase_handoffs.resolved_at fallback)
// ---------------------------------------------------------------------------
describe('strand-age-gauge.cjs planStrandAgeGauge() under a pinned non-UTC timezone', () => {
  function fakeSupabase({ candidates, handoffRows }) {
    return {
      from(table) {
        if (table === 'strategic_directives_v2') {
          return {
            select() { return this; },
            eq() { return this; },
            order() { return this; },
            range: async () => ({ data: candidates, error: null }),
          };
        }
        return {
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          limit: async () => ({ data: handoffRows }),
        };
      },
    };
  }

  it('a naive updated_at newer than created_at is normalized correctly (not local-time-shifted)', async () => {
    const nowMs = TRUE_INSTANT + 15 * 60000;
    const candidates = [{ sd_key: 'SD-A', id: 'uuid-a', updated_at: NAIVE, created_at: '2026-07-28T00:00:00.000' }];
    const { rows } = await planStrandAgeGauge(
      fakeSupabase({ candidates, handoffRows: [] }),
      { nowMs }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].ageMs).toBe(15 * 60000);
    expect(rows[0].ageSource).toBe('updated_at');
  });

  it('malformed updated_at (NaN from pgTimestampMs) falls back to the handoff resolved_at, not a false pass', async () => {
    // Regression for the finding: the prior `!== null` guard let NaN through silently, since
    // Date.parse('garbage') is NaN and NaN !== null is true — the fallback never fired.
    const nowMs = TRUE_INSTANT + 60000;
    const candidates = [{ sd_key: 'SD-B', id: 'uuid-b', updated_at: 'not-a-real-timestamp', created_at: '2026-07-28T00:00:00.000' }];
    const handoffRows = [{ resolved_at: '2026-07-29T05:25:20.028Z' }]; // already tz-aware column
    const { rows } = await planStrandAgeGauge(
      fakeSupabase({ candidates, handoffRows }),
      { nowMs }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].ageSource).toBe('latest_handoff_resolved_at');
    expect(Number.isFinite(rows[0].ageMs)).toBe(true);
  });

  it('null updated_at and no handoff falls back to created_at', async () => {
    const nowMs = TRUE_INSTANT + 30 * 60000;
    const candidates = [{ sd_key: 'SD-C', id: 'uuid-c', updated_at: null, created_at: NAIVE }];
    const { rows } = await planStrandAgeGauge(
      fakeSupabase({ candidates, handoffRows: [] }),
      { nowMs }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].ageSource).toBe('created_at');
    expect(rows[0].ageMs).toBe(30 * 60000);
  });
});
