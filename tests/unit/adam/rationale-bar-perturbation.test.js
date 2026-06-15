/**
 * SD-LEO-INFRA-ADAM-PRIORITY-ANCHORING-001 (FR-2/FR-3) — selectAdvisory
 * preference weighting + Q2 wave-alignment, with the cardinal-safety guarantees:
 *   - flat all-1.0 weight map == OKR-only baseline (byte-identical selection)
 *   - bounded clamp never zeroes / never inverts off-track below on-track
 *   - perturbation trace {base_rank, final_rank, moved_by_weight, class, weight}
 *   - Q2 term self-gates to no-op on 0 waves
 */
import { describe, it, expect } from 'vitest';
import {
  selectAdvisory,
  evaluateCandidate,
  waveAlignmentTerm,
  LEO_ROADMAP_ID,
} from '../../../lib/adam/rationale-bar.js';
import { CLAMP_LO, CLAMP_HI } from '../../../lib/adam/preference-model.js';

const base = (over = {}) => ({
  scope_key: 'harness',
  class: 'default',
  opportunity: 'op', evidence: 'ev', rationale: 'ra', risk: 'ri', counterfactual: 'cf',
  objective_kr: { objective: 'O-GOV', kr: 'KR', kr_status: 'on_track', off_track_delta: null },
  contribution_type: 'direct',
  confidence: 0.5,
  ...over,
});

// On-track direct = 1.5*1.0*10 = 15 ; off-track direct = 1.5*3.0*10 = 45.
const onTrack = (over) => base({ class: 'on', dedup_key: 'on', objective_kr: { objective: 'O', kr: 'KR-on', kr_status: 'on_track' }, ...over });
const offTrack = (over) => base({ class: 'off', dedup_key: 'off', objective_kr: { objective: 'O', kr: 'KR-off', kr_status: 'off_track' }, ...over });

describe('flat all-1.0 weight map == OKR-only baseline (byte-identical)', () => {
  it('selection + order match the no-opts baseline', () => {
    const cands = [onTrack(), offTrack({ confidence: 0.9 }), base({ class: 'mid', dedup_key: 'mid', objective_kr: { objective: 'O', kr: 'KR-mid', kr_status: 'at_risk' } })];
    const baseline = selectAdvisory(cands, { openSdKeys: new Set() });
    const flat = selectAdvisory(cands, { openSdKeys: new Set(), prefWeights: { on: 1.0, off: 1.0, mid: 1.0, default: 1.0 } });
    expect(flat.surfaced.dedup_key).toBe(baseline.surfaced.dedup_key);
    expect(flat.surfaced.okr_score).toBe(baseline.surfaced.okr_score);
    expect(flat.trace).toEqual([]); // no perturbation
    expect(baseline.trace).toEqual([]);
  });

  it('an EMPTY prefWeights map is also byte-identical (missing class -> identity 1.0)', () => {
    const cands = [onTrack(), offTrack()];
    const baseline = selectAdvisory(cands, { openSdKeys: new Set() });
    const empty = selectAdvisory(cands, { openSdKeys: new Set(), prefWeights: {} });
    expect(empty.surfaced.dedup_key).toBe(baseline.surfaced.dedup_key);
    expect(empty.trace).toEqual([]);
  });
});

describe('demoting weight map re-ranks WITHIN a status tier + emits a trace', () => {
  it('a preferred lower-raw candidate overtakes a higher-raw one in the SAME status tier', () => {
    // FIX 1: preference weighting may only reorder WITHIN a status tier. Use two
    // SAME-tier (both on_track, tier 2) candidates that differ on raw OKR score.
    // 'pref' = supporting on_track = 0.5*1.0*10 = 5 ; 'other' = direct on_track = 15.
    const pref = base({ class: 'pref', dedup_key: 'pref', contribution_type: 'supporting', objective_kr: { objective: 'O', kr: 'KR-p', kr_status: 'on_track' }, confidence: 0.5 });
    const other = base({ class: 'other', dedup_key: 'other', contribution_type: 'direct', objective_kr: { objective: 'O', kr: 'KR-o', kr_status: 'on_track' }, confidence: 0.5 });
    const baseline = selectAdvisory([pref, other], { openSdKeys: new Set() });
    expect(baseline.surfaced.dedup_key).toBe('other'); // raw: 15 > 5

    // Use a same-tier same-raw pair (both enabling on_track = 10) where 'other'
    // ranks first in the BASELINE via its higher confidence, then the intra-tier
    // weight flips 'pref' to the top -> a genuine rank perturbation is traced.
    const prefClose = base({ class: 'pref', dedup_key: 'pref', contribution_type: 'enabling', objective_kr: { objective: 'O', kr: 'KR-p', kr_status: 'on_track' }, confidence: 0.5 }); // raw 10
    const otherClose = base({ class: 'other', dedup_key: 'other', contribution_type: 'enabling', objective_kr: { objective: 'O', kr: 'KR-o', kr_status: 'on_track' }, confidence: 0.9 }); // raw 10, higher conf -> baseline rank 0
    const baselineClose = selectAdvisory([prefClose, otherClose], { openSdKeys: new Set() });
    expect(baselineClose.surfaced.dedup_key).toBe('other'); // tie on raw -> confidence breaks for 'other'

    const weighted = selectAdvisory([prefClose, otherClose], { openSdKeys: new Set(), prefWeights: { pref: CLAMP_HI, other: CLAMP_LO } });
    // 10*1.25=12.5 vs 10*0.8=8 -> pref wins (intra-tier nudge flips the baseline order).
    expect(weighted.surfaced.dedup_key).toBe('pref');
    const moved = weighted.trace.find((t) => t.final_rank === 0);
    expect(moved).toBeDefined();
    expect(moved.base_rank).not.toBe(moved.final_rank);
    expect(moved.moved_by_weight).toBe(true);
    expect(moved.class).toBe('pref');
    expect(typeof moved.weight).toBe('number');
  });
});

describe('bounded clamp: never zeroes, never inverts off-track below on-track', () => {
  it('worst-case (off-track LO vs on-track HI) keeps off-track ahead within same contribution class', () => {
    const on = onTrack({ confidence: 0.5 });   // 15
    const off = offTrack({ confidence: 0.5 });  // 45
    // Attempt to demote off-track and boost on-track to the clamp extremes.
    const r = selectAdvisory([on, off], { openSdKeys: new Set(), prefWeights: { on: 999, off: 0 } });
    // clamped: off 45*0.8=36 ; on 15*1.25=18.75 -> off still wins (no inversion).
    expect(r.surfaced.dedup_key).toBe('off');
  });

  it('a 0/huge weight never zeroes a candidate (clamp floor/ceiling applied)', () => {
    const a = base({ class: 'a', dedup_key: 'a', objective_kr: { objective: 'O', kr: 'KR-a', kr_status: 'on_track' } });
    const r = selectAdvisory([a], { openSdKeys: new Set(), prefWeights: { a: 0 } });
    expect(r.surfaced).not.toBeNull();
    expect(r.surfaced.effective_score).toBeGreaterThan(0); // 15 * 0.8 = 12 > 0
  });
});

describe('FR-3 Q2 wave-alignment self-gating', () => {
  it('waveAlignmentTerm is a 1.0 no-op when there are 0 waves (or no alignment)', () => {
    expect(waveAlignmentTerm(base({ roadmap_wave_ref: 'O-GOV-1' }), { waves: [] })).toEqual({ active: false, multiplier: 1.0, aligned: null });
    expect(waveAlignmentTerm(base(), undefined)).toEqual({ active: false, multiplier: 1.0, aligned: null });
  });

  it('selection equals baseline when the LEO Roadmap has 0 waves (no false-fire)', () => {
    const cands = [onTrack(), offTrack()];
    const baseline = selectAdvisory(cands, { openSdKeys: new Set() });
    const withEmptyWaves = selectAdvisory(cands, { openSdKeys: new Set(), waveAlignment: { waves: [], overall_alignment_pct: 0 } });
    expect(withEmptyWaves.surfaced.dedup_key).toBe(baseline.surfaced.dedup_key);
    expect(withEmptyWaves.trace).toEqual([]);
  });

  it('an EVA-Intake-style alignment with 0 waves on the LEO roadmap never drives the term', () => {
    // The caller keys calculateAlignment on LEO_ROADMAP_ID; if that roadmap has 0
    // waves the injected alignment is {waves:[]} regardless of EVA-Intake having 462.
    expect(LEO_ROADMAP_ID).toBe('3aa2f3e2-75fa-4fc8-a17e-44d553b86674');
    const r = waveAlignmentTerm(base({ roadmap_wave_ref: 'anything' }), { waves: [] });
    expect(r.active).toBe(false);
  });

  it('when waves EXIST: a NON-URGENT (on_track) Q1-pass/Q2-unaligned candidate routes to backlog', () => {
    const waveAlignment = { waves: [{ wave_id: 'w1', okr_ids: ['O-GOV-1'] }], overall_alignment_pct: 100 };
    const aligned = base({ class: 'al', dedup_key: 'al', roadmap_wave_ref: 'O-GOV-1', objective_kr: { objective: 'O', kr: 'KR-al', kr_status: 'on_track' } });
    // A NON-URGENT (on_track) unaligned candidate IS routed to backlog (does not clear).
    const unaligned = base({ class: 'un', dedup_key: 'un', roadmap_wave_ref: 'O-OTHER', objective_kr: { objective: 'O', kr: 'KR-un', kr_status: 'on_track' } });

    const eUn = evaluateCandidate(unaligned, { waveAlignment });
    expect(eUn.clears).toBe(false);
    expect(eUn.waveUnaligned).toBe(true);
    expect(eUn.reasons.join(' ')).toMatch(/Q2 wave-unaligned/);

    // The aligned candidate clears and surfaces.
    const r = selectAdvisory([unaligned, aligned], { openSdKeys: new Set(), waveAlignment });
    expect(r.surfaced.dedup_key).toBe('al');
  });

  it('FIX 2: an OFF-TRACK wave-unaligned candidate is NEVER excluded (genuine signal clears the wave gate)', () => {
    const waveAlignment = { waves: [{ wave_id: 'w1', okr_ids: ['O-GOV-1'] }], overall_alignment_pct: 100 };
    // Off-track AND wave-unaligned: must still clear (urgent objective signal wins).
    const offUnaligned = base({ class: 'off', dedup_key: 'off', roadmap_wave_ref: 'O-OTHER', objective_kr: { objective: 'O', kr: 'KR-off', kr_status: 'off_track' } });
    const eOff = evaluateCandidate(offUnaligned, { waveAlignment });
    expect(eOff.clears).toBe(true);
    expect(eOff.waveUnaligned).toBe(false);
    expect(eOff.reasons).toEqual([]);

    // at_risk is likewise urgent -> also clears despite being wave-unaligned.
    const atRiskUnaligned = base({ class: 'ar', dedup_key: 'ar', roadmap_wave_ref: 'O-OTHER', objective_kr: { objective: 'O', kr: 'KR-ar', kr_status: 'at_risk' } });
    expect(evaluateCandidate(atRiskUnaligned, { waveAlignment }).clears).toBe(true);

    // And when an off-track unaligned competes with an on-track aligned, off-track surfaces.
    const onAligned = base({ class: 'on', dedup_key: 'on', roadmap_wave_ref: 'O-GOV-1', objective_kr: { objective: 'O', kr: 'KR-on', kr_status: 'on_track' } });
    const r = selectAdvisory([onAligned, offUnaligned], { openSdKeys: new Set(), waveAlignment });
    expect(r.surfaced.dedup_key).toBe('off');
  });
});

describe('FIX 1: CROSS-CLASS NO-INVERSION (statusTier dominates preference weight)', () => {
  it('an off-track/supporting candidate STILL surfaces first vs on-track/direct even when weights favor on-track', () => {
    // The exact worst case from the SD: raw tie at 15.
    //   off-track/supporting = 0.5*3.0*10 = 15 (tier 5, off_track)
    //   on-track/direct      = 1.5*1.0*10 = 15 (tier 2, on_track)
    const offSupporting = base({
      class: 'worker-capability', dedup_key: 'off-sup', contribution_type: 'supporting',
      objective_kr: { objective: 'O', kr: 'KR-off', kr_status: 'off_track' }, confidence: 0.5,
    });
    const onDirect = base({
      class: 'on-direct-cls', dedup_key: 'on-dir', contribution_type: 'direct',
      objective_kr: { objective: 'O', kr: 'KR-on', kr_status: 'on_track' }, confidence: 0.9,
    });
    // Demote the off-track one, boost the on-track one to the clamp extremes.
    const prefWeights = { 'worker-capability': CLAMP_LO, 'on-direct-cls': CLAMP_HI };
    const r = selectAdvisory([onDirect, offSupporting], { openSdKeys: new Set(), prefWeights });
    // Under the OLD score-dominant sort: off 15*0.8=12 < on 15*1.25=18.75 -> INVERSION.
    // Under the statusTier-dominant sort: off_track (tier 5) > on_track (tier 2) -> off wins.
    expect(r.surfaced.dedup_key).toBe('off-sup');
  });
});
