/**
 * SD-LEO-INFRA-ADAM-GAUGE-ESTATE-SOURCING-001 (FR-2/FR-4/FR-5) — THE SPINE WIRE capability_gap term.
 *
 * Proves the gauge-as-a-lens is ADDITIVE and TIER-SAFE:
 *  (a) a low-build% capability raises a candidate's rank WITHIN its status tier, but NEVER overrides
 *      a higher KR-status-tier item (cross-tier no-inversion),
 *  (c) toggling the term measurably changes ranking (emits a perturbation trace),
 *  (d) preferences + roadmap remain the dominant terms (capability_gap is just another bounded
 *      intra-tier multiplier — the statusTier sort still dominates),
 *  + a byte-identical no-op baseline when opts.capabilityGap is absent (zero regression),
 *  + FR-4: candidates still pass through evaluateCandidate -> passesConstSelfCheck (CONST-002),
 *  + FR-1: readCapabilityGaps excludes 'unknown' and fails soft.
 */
import { describe, it, expect } from 'vitest';
import {
  selectAdvisory,
  capabilityGapTerm,
} from '../../../lib/adam/rationale-bar.js';
import { CLAMP_HI } from '../../../lib/adam/preference-model.js';
import { readCapabilityGaps } from '../../../lib/adam/gauge-lens.js';

const base = (over = {}) => ({
  scope_key: 'harness',
  class: 'default',
  opportunity: 'op', evidence: 'ev', rationale: 'ra', risk: 'ri', counterfactual: 'cf',
  objective_kr: { objective: 'O-GOV', kr: 'KR', kr_status: 'on_track', off_track_delta: null },
  contribution_type: 'enabling', // raw 10 on_track
  confidence: 0.5,
  ...over,
});

describe('FR-2: capabilityGapTerm — pure, self-gating, bounded (mirrors waveAlignmentTerm)', () => {
  it('1.0 no-op when no data, no candidate.capability, or an unknown/excluded capability', () => {
    expect(capabilityGapTerm(base({ capability: 'X' }), undefined)).toEqual({ active: false, multiplier: 1.0, buildPct: null });
    expect(capabilityGapTerm(base(), { gaps: { X: 0 } })).toEqual({ active: false, multiplier: 1.0, buildPct: null }); // candidate has no capability
    expect(capabilityGapTerm(base({ capability: 'NotMeasured' }), { gaps: { X: 0 } })).toEqual({ active: false, multiplier: 1.0, buildPct: null }); // capability excluded (unknown)
  });

  it('lower build% => higher multiplier, bounded by CLAMP_HI (built=1.0, unbuilt=CLAMP_HI, partial=midpoint)', () => {
    const built = capabilityGapTerm(base({ capability: 'C' }), { gaps: { C: 100 } });
    const partial = capabilityGapTerm(base({ capability: 'C' }), { gaps: { C: 50 } });
    const unbuilt = capabilityGapTerm(base({ capability: 'C' }), { gaps: { C: 0 } });
    expect(built.multiplier).toBeCloseTo(1.0, 6);
    expect(unbuilt.multiplier).toBeCloseTo(CLAMP_HI, 6);
    expect(partial.multiplier).toBeCloseTo(1.0 + (CLAMP_HI - 1.0) * 0.5, 6);
    // monotonic: lower build% strictly higher multiplier
    expect(unbuilt.multiplier).toBeGreaterThan(partial.multiplier);
    expect(partial.multiplier).toBeGreaterThan(built.multiplier);
    expect(unbuilt.multiplier).toBeLessThanOrEqual(CLAMP_HI);
  });

  it('clamps out-of-range build% (>100 => 1.0; <0 => CLAMP_HI) and never exceeds the bound', () => {
    expect(capabilityGapTerm(base({ capability: 'C' }), { gaps: { C: 200 } }).multiplier).toBeCloseTo(1.0, 6);
    expect(capabilityGapTerm(base({ capability: 'C' }), { gaps: { C: -50 } }).multiplier).toBeCloseTo(CLAMP_HI, 6);
  });

  it('defense-in-depth: a non-number gaps value (null/empty/false/NaN) self-gates to 1.0 (NO phantom max-boost)', () => {
    for (const bad of [null, '', false, NaN, '0', undefined]) {
      const r = capabilityGapTerm(base({ capability: 'C' }), { gaps: { C: bad } });
      expect(r.multiplier).toBe(1.0); // never the 1.25 a coerced-to-0 value would produce
      expect(r.active).toBe(false);
    }
  });
});

describe('FR-5(a/c): low-build% capability raises rank WITHIN a tier + emits a trace', () => {
  it('a low-build% candidate overtakes a high-build% same-tier candidate when the term is applied', () => {
    // Two SAME-tier (on_track, tier 2) same-raw (enabling=10) candidates; baseline order breaks on confidence.
    const lowBuild = base({ class: 'low', dedup_key: 'low', capability: 'Weak cap', confidence: 0.5, objective_kr: { objective: 'O', kr: 'KR-low', kr_status: 'on_track' } });
    const highBuild = base({ class: 'high', dedup_key: 'high', capability: 'Strong cap', confidence: 0.9, objective_kr: { objective: 'O', kr: 'KR-high', kr_status: 'on_track' } });

    const baseline = selectAdvisory([lowBuild, highBuild], { openSdKeys: new Set() });
    expect(baseline.surfaced.dedup_key).toBe('high'); // tie on raw -> higher confidence wins
    expect(baseline.trace).toEqual([]);

    const gapped = selectAdvisory([lowBuild, highBuild], {
      openSdKeys: new Set(),
      capabilityGap: { gaps: { 'Weak cap': 0, 'Strong cap': 100 } },
    });
    // low: 10 * CLAMP_HI ; high: 10 * 1.0 -> low overtakes (intra-tier nudge).
    expect(gapped.surfaced.dedup_key).toBe('low');
    const moved = gapped.trace.find((t) => t.final_rank === 0);
    expect(moved).toBeDefined();
    expect(moved.base_rank).not.toBe(moved.final_rank);
    expect(moved.moved_by_weight).toBe(true);
    expect(moved.weight).toBeCloseTo(CLAMP_HI, 6);
  });
});

describe('FR-5(a/d): cross-tier NO-INVERSION — KR-status tier always dominates capability_gap', () => {
  it('an on_track UNBUILT-capability candidate NEVER overrides an off_track BUILT-capability item', () => {
    // on_track + lowest build% (max capability_gap boost) vs off_track + highest build% (no boost).
    const onTrackWeakCap = base({
      class: 'on', dedup_key: 'on', capability: 'Weak', confidence: 0.9, contribution_type: 'direct', // raw 15 on_track
      objective_kr: { objective: 'O', kr: 'KR-on', kr_status: 'on_track' },
    });
    const offTrackBuiltCap = base({
      class: 'off', dedup_key: 'off', capability: 'Strong', confidence: 0.5, contribution_type: 'supporting', // raw 15 off_track
      objective_kr: { objective: 'O', kr: 'KR-off', kr_status: 'off_track' },
    });
    const r = selectAdvisory([onTrackWeakCap, offTrackBuiltCap], {
      openSdKeys: new Set(),
      capabilityGap: { gaps: { Weak: 0, Strong: 100 } },
    });
    // Even with the on_track candidate getting the MAX capability_gap multiplier and the off_track
    // one getting 1.0, the off_track (tier 5) candidate still surfaces over on_track (tier 2).
    expect(r.surfaced.dedup_key).toBe('off');
  });

  it('the capability_gap term composes with preferences but neither overrides the tier (preferences+roadmap stay dominant)', () => {
    const onTrack = base({ class: 'on', dedup_key: 'on', capability: 'Weak', objective_kr: { objective: 'O', kr: 'KR-on', kr_status: 'on_track' } });
    const atRisk = base({ class: 'ar', dedup_key: 'ar', capability: 'Strong', objective_kr: { objective: 'O', kr: 'KR-ar', kr_status: 'at_risk' } });
    const r = selectAdvisory([onTrack, atRisk], {
      openSdKeys: new Set(),
      prefWeights: { on: CLAMP_HI, ar: 1.0 },           // preference favors on_track
      capabilityGap: { gaps: { Weak: 0, Strong: 100 } }, // capability_gap favors on_track
    });
    // Both intra-tier boosts pile onto the on_track candidate, yet at_risk (tier 4) still wins over on_track (tier 2).
    expect(r.surfaced.dedup_key).toBe('ar');
  });
});

describe('FR-5: byte-identical no-op baseline (zero regression when capabilityGap absent)', () => {
  it('absent capabilityGap yields the same selection + empty trace as the no-opts baseline', () => {
    const cands = [
      base({ class: 'a', dedup_key: 'a', capability: 'Weak', objective_kr: { objective: 'O', kr: 'KR-a', kr_status: 'on_track' } }),
      base({ class: 'b', dedup_key: 'b', capability: 'Strong', confidence: 0.9, objective_kr: { objective: 'O', kr: 'KR-b', kr_status: 'on_track' } }),
    ];
    const baseline = selectAdvisory(cands, { openSdKeys: new Set() });
    const noGap = selectAdvisory(cands, { openSdKeys: new Set() }); // no capabilityGap opt
    expect(noGap.surfaced.dedup_key).toBe(baseline.surfaced.dedup_key);
    expect(noGap.trace).toEqual([]);
    // even when a gauge map is supplied, candidates with capabilities NOT in the map stay no-op
    const unmatched = selectAdvisory(cands, { openSdKeys: new Set(), capabilityGap: { gaps: { 'Some other cap': 0 } } });
    expect(unmatched.surfaced.dedup_key).toBe(baseline.surfaced.dedup_key);
    expect(unmatched.trace).toEqual([]);
  });
});

describe('FR-4: CONST-002 preserved through selectAdvisory (capability_gap adds no bypass)', () => {
  it('an approve-action candidate is rejected even with a capability_gap boost', () => {
    const violating = base({ class: 'v', dedup_key: 'v', capability: 'Weak', action: 'auto-approve', objective_kr: { objective: 'O', kr: 'KR-v', kr_status: 'on_track' } });
    const clean = base({ class: 'c', dedup_key: 'c', capability: 'Strong', objective_kr: { objective: 'O', kr: 'KR-c', kr_status: 'on_track' } });
    const r = selectAdvisory([violating, clean], { openSdKeys: new Set(), capabilityGap: { gaps: { Weak: 0, Strong: 100 } } });
    // The CONST-violating candidate cannot surface despite the max capability_gap boost.
    expect(r.surfaced.dedup_key).toBe('c');
    const ev = r.evaluated.find((e) => e.candidate.dedup_key === 'v');
    expect(ev.clears).toBe(false);
    expect(ev.reasons.join(' ')).toMatch(/CONST-002/);
  });
});

describe('FR-1: readCapabilityGaps — excludes unknown, maps status->build%, fail-soft', () => {
  const fakeGauge = (components, available = true, overall_pct = 50) => async () => ({ available, components, overall_pct });

  it('maps built/partial/unbuilt to 100/50/0 and EXCLUDES unknown (never build%=0)', async () => {
    const components = [
      { capability: 'Built cap', status: 'built', score: 1 },
      { capability: 'Partial cap', status: 'partial', score: 0.5 },
      { capability: 'Unbuilt cap', status: 'unbuilt', score: 0 },
      { capability: 'Unknown cap', status: 'unknown', score: null },
    ];
    const out = await readCapabilityGaps({}, { computeBuildGauge: fakeGauge(components) });
    expect(out.available).toBe(true);
    expect(out.gaps).toEqual({ 'Built cap': 100, 'Partial cap': 50, 'Unbuilt cap': 0 });
    expect(out.gaps).not.toHaveProperty('Unknown cap'); // unknown excluded, NOT coerced to 0
  });

  it('fails soft to { available:false, gaps:{} } when the gauge is unavailable or throws', async () => {
    const unavail = await readCapabilityGaps({}, { computeBuildGauge: fakeGauge([], false) });
    expect(unavail).toEqual({ available: false, gaps: {}, overall_pct: null });
    const thrown = await readCapabilityGaps({}, { computeBuildGauge: async () => { throw new Error('db down'); } });
    expect(thrown).toEqual({ available: false, gaps: {}, overall_pct: null });
  });
});
