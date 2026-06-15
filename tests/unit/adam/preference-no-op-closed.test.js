/**
 * SD-LEO-INFRA-ADAM-PRIORITY-ANCHORING-001 (FIX 3) — the chairman directive is
 * NO LONGER a no-op.
 *
 * Proves end-to-end that a REAL briefing candidate (built by summarizeHarness)
 * receives a non-1.0 weight from the seeded standing directive, via the
 * candidate-SOURCE-class -> directive-TOPIC-class bridge (candidatePreferenceClass).
 * Pure + DB-free: candidates are built from injected KR rows; the directive value
 * is taken from STANDING_WORKER_CAPABILITY_DIRECTIVE (no live seed, no live DB).
 */
import { describe, it, expect } from 'vitest';
import { summarizeHarness } from '../../../lib/adam/briefings/harness.js';
import {
  candidatePreferenceClass,
  STANDING_WORKER_CAPABILITY_DIRECTIVE,
  CLAMP_HI,
  CLAMP_LO,
} from '../../../lib/adam/preference-model.js';
import { selectAdvisory, statusTierOf } from '../../../lib/adam/rationale-bar.js';

// Live KR rows per O-GOV objective (the shape fetchKrByObjective returns).
function krByObjective({ g1 = 'on_track', g2 = 'on_track', g3 = 'on_track' } = {}) {
  return new Map([
    ['O-GOV-1', [{ id: 'kr-1', code: 'KR-GOV-1', status: g1 }]],
    ['O-GOV-2', [{ id: 'kr-2', code: 'KR-GOV-2', status: g2 }]],
    ['O-GOV-3', [{ id: 'kr-3', code: 'KR-GOV-3', status: g3 }]],
  ]);
}

// A harness briefing with all three signal classes present.
function fullBriefing(krMap) {
  return summarizeHarness({
    backlog: [{ id: 'b1' }, { id: 'b2' }], // harness-backlog -> O-GOV-1
    gateRecs: [{ recommendation: 'INCREASE threshold X' }], // gate-tuning -> O-GOV-2
    evaRecs: [{ action_type: 'create_sd' }], // eva-consultant -> O-GOV-3
    krByObjective: krMap,
  });
}

describe('candidatePreferenceClass bridges real candidates to the directive vocabulary', () => {
  it('a real gate-tuning (O-GOV-2) candidate maps to worker-capability', () => {
    const { candidates } = fullBriefing(krByObjective());
    const gate = candidates.find((c) => c.class === 'gate-tuning');
    expect(gate).toBeDefined();
    expect(gate.objective_kr.objective).toBe('O-GOV-2');
    expect(candidatePreferenceClass(gate)).toBe('worker-capability');
  });

  it('a real eva-consultant (O-GOV-3) candidate maps to adam-autonomy', () => {
    const { candidates } = fullBriefing(krByObjective());
    const eva = candidates.find((c) => c.class === 'eva-consultant');
    expect(eva).toBeDefined();
    expect(eva.objective_kr.objective).toBe('O-GOV-3');
    expect(candidatePreferenceClass(eva)).toBe('adam-autonomy');
  });

  it('a real harness-backlog (O-GOV-1) candidate is neutral (no topic -> identity)', () => {
    const { candidates } = fullBriefing(krByObjective());
    const backlog = candidates.find((c) => c.class === 'harness-backlog');
    expect(backlog).toBeDefined();
    expect(candidatePreferenceClass(backlog)).toBeNull();
  });
});

describe('FIX 3: the seeded directive is no longer a no-op on a REAL candidate', () => {
  it('at least one real briefing candidate receives a non-1.0 weight from the seeded directive', () => {
    // The seeded directive value keyed on the TOPIC vocabulary.
    const prefWeights = STANDING_WORKER_CAPABILITY_DIRECTIVE.value;
    expect(prefWeights['worker-capability']).toBe(CLAMP_HI);
    expect(prefWeights['adam-autonomy']).toBe(CLAMP_LO);

    const { candidates } = fullBriefing(krByObjective());
    // Resolve each real candidate's effective weight the way selectAdvisory does.
    const applied = candidates.map((c) => {
      const topic = candidatePreferenceClass(c);
      const w = topic && prefWeights[topic] != null ? prefWeights[topic] : 1.0;
      return { class: c.class, topic, weight: w };
    });
    const nonIdentity = applied.filter((a) => a.weight !== 1.0);
    // PROOF the directive now bites: gate-tuning (HI) and eva-consultant (LO) both differ from 1.0.
    expect(nonIdentity.length).toBeGreaterThanOrEqual(1);
    const gate = applied.find((a) => a.class === 'gate-tuning');
    const eva = applied.find((a) => a.class === 'eva-consultant');
    expect(gate.weight).toBe(CLAMP_HI); // boosted
    expect(eva.weight).toBe(CLAMP_LO); // demoted
  });

  it('the now-live directive STILL cannot invert off-track signal (FIX 1 + FIX 3 together)', () => {
    // gate-tuning is boosted (worker-capability=HI) but anchored to an ON-TRACK KR;
    // eva-consultant is demoted (adam-autonomy=LO) but anchored to an OFF-TRACK KR.
    // The off-track eva-consultant MUST still surface despite being demoted.
    const krMap = krByObjective({ g2: 'on_track', g3: 'off_track' });
    const { candidates } = fullBriefing(krMap);
    const eva = candidates.find((c) => c.class === 'eva-consultant');
    const gate = candidates.find((c) => c.class === 'gate-tuning');
    expect(statusTierOf(eva)).toBe(5); // off_track
    expect(statusTierOf(gate)).toBe(2); // on_track

    const r = selectAdvisory(candidates, {
      openSdKeys: new Set(),
      prefWeights: STANDING_WORKER_CAPABILITY_DIRECTIVE.value,
    });
    // Even though eva-consultant is demoted (LO) and gate-tuning is boosted (HI),
    // the off-track eva-consultant wins on statusTier dominance.
    expect(r.surfaced.class).toBe('eva-consultant');
  });
});
