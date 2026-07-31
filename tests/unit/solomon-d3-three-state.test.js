/**
 * SD-FDBK-INFRA-SOLOMON-SCORECARD-MEASURES-001 — FR-2 (TS-3, TS-4, TS-14).
 *
 * D3 (silence/cost-discipline) was the ONLY unmeasured dimension and the ONLY one
 * that actually breached — 193 sends against the cap on 2026-07-29. The scorecard
 * could not see the thing that failed.
 *
 * The three-state contract is the substance of this FR, not the number:
 *   signal unavailable -> null -> INCONCLUSIVE, lowers coverage
 *   real count, none over cap -> 0 -> passing, honestly
 *   real count, N over cap    -> N -> scored down, honestly
 *
 * The middle and last cases are easy. The FIRST is the one that matters: consuming
 * a fail-open source naively would make a DB outage score as perfect cost-discipline,
 * which is this SD's own defect class reproduced one layer up.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const { SOLOMON_CONFIG } = require_(join(here, '..', '..', 'lib', 'solomon', 'self-score-config.cjs'));

const scoreD3 = (signals) => SOLOMON_CONFIG.scorers.D3_silence_cost_discipline(signals);

describe('D3 scores the three states distinctly', () => {
  it('UNKNOWN: a null signal is inconclusive, NOT a pass', () => {
    const r = scoreD3({ quota_breach_count: null });
    expect(r.score).toBeNull();
    expect(r.provenance).toMatch(/inconclusive/i);
  });

  it('an absent signal is also inconclusive (undefined, not just null)', () => {
    const r = scoreD3({});
    expect(r.score).toBeNull();
  });

  it('CLEAN: zero breaches scores full marks', () => {
    const r = scoreD3({ quota_breach_count: 0 });
    expect(r.score).toBe(5);
    expect(r.red_flag).toBe(false);
  });

  it('BREACHED: over-cap sends score down and raise a red flag', () => {
    expect(scoreD3({ quota_breach_count: 1 }).score).toBe(3);
    const bad = scoreD3({ quota_breach_count: 173 });   // the real 2026-07-29 shape: 193 vs 20
    expect(bad.score).toBe(1);
    expect(bad.red_flag).toBe(true);
  });

  it('UNKNOWN and CLEAN are not the same verdict — the whole point', () => {
    const unknown = scoreD3({ quota_breach_count: null });
    const clean = scoreD3({ quota_breach_count: 0 });
    expect(unknown.score).not.toBe(clean.score);
    // Before FR-1/FR-2 these were indistinguishable at the source: a failed query
    // and a quiet day both produced a bare { allowed: true }.
  });
});

describe('TS-3: a genuinely failing signal reports UNKNOWN, not compliance', () => {
  // This drives the REAL derivation in gatherSignals through an injected client
  // that actually throws — not a mocked scorer. TS-3 asks for an induced failure
  // precisely because mocking the scorer would prove only that null maps to null,
  // never that the writer PRODUCES null when the query dies.
  const { gatherSignals } = require_(join(here, '..', '..', 'scripts', 'solomon-self-assessment-writer.cjs'));

  const brokenClient = () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ gte: () => ({ limit: () => { throw new Error('connection refused'); } }) }),
        not: () => ({ order: () => { throw new Error('connection refused'); } }),
      }),
    }),
  });

  it('yields null (UNKNOWN) rather than 0 when the quota query throws', async () => {
    const signals = await gatherSignals(brokenClient());
    expect(signals.quota_breach_count).toBeNull();
  });

  it('and that null scores inconclusive end-to-end', async () => {
    const signals = await gatherSignals(brokenClient());
    const r = scoreD3(signals);
    expect(r.score).toBeNull();
    // The failure mode being prevented: a DB outage scoring as perfect
    // cost-discipline on the one dimension that actually breached.
    expect(r.score).not.toBe(5);
  });
});

describe('the writer derives the signal without re-querying', () => {
  const source = (() => {
    // eslint-disable-next-line no-undef
    const { readFileSync } = require_('node:fs');
    return readFileSync(join(here, '..', '..', 'scripts', 'solomon-self-assessment-writer.cjs'), 'utf8');
  })();

  it('imports checkConsultQuota rather than rebuilding the count', () => {
    // TS-13: an independent query would silently drop the cc_originator dedup
    // exclusion and D3's volume would diverge from the volume the send path records.
    expect(source).toMatch(/require\('\.\/solomon-advisory\.cjs'\)/);
    expect(source).toMatch(/checkConsultQuota\(sb\)/);
  });

  it('treats anything other than available===true as UNKNOWN', () => {
    // Pins the anti-fail-open branch: the guard must be an explicit availability
    // check, not a truthiness test on the count (0 is falsy and legitimate).
    expect(source).toMatch(/q\.available !== true\) return null/);
  });

  it('derives breaches from the gate\'s own cap, not a hardcoded literal', () => {
    // TR-4: a second hardcoded ceiling (notably 150) would drift from the value
    // the runtime actually enforces-by-measuring.
    expect(source).toMatch(/q\.perDayMax/);
    expect(source).not.toMatch(/quota_breach_count[\s\S]{0,400}?\b150\b/);
  });
});
