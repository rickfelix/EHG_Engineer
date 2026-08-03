// D3 + D4 — the two defects the EXEC SECURITY sub-agent found in FR-1's own code.
// SD-FDBK-FIX-HEAL-BEFORE-COMPLETE-001.
//
// Neither was live-exploitable when found: resolveEffectiveThreshold is merged but wired into no
// gate. Both are PRE-WIRING fixes, which is the only cheap moment to make them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  identifyRubric,
  identifyRubricChecked,
  resolveEffectiveThreshold,
} from '../../lib/handoff/threshold-resolver.js';
import { buildFastHealDimensionScores } from '../../scripts/modules/handoff/executors/plan-to-lead/gates/heal-before-complete.js';

const HEAL_5 = ['capabilities_present', 'key_changes_delivered', 'smoke_tests_pass', 'success_criteria_met', 'success_metrics_achieved'];
const VISION_18 = ['A01','A02','A03','A04','A05','A06','A07','V01','V02','V03','V04','V05','V06','V07','V08','V09','V10','V11'];

const score = (keys, addressed = keys.length) =>
  Object.fromEntries(keys.map((k, i) => [k, i < addressed ? 80 : 20]));

describe('D3 — the vision family rule is a classifier, not a leniency lever', () => {
  it('THE ATTACK: renaming heal keys to A01..A05 no longer buys the lenient rubric', () => {
    // This is the whole finding, expressed as the attacker would perform it. The heal payload is
    // unchanged in every way that matters — same five values, same meaning — and only the KEY NAMES
    // move. Before the width floor this classified as vision-av-v1 and dropped the bugfix bar from
    // 92 to 67, flipping 493 of 2537 real heal rows (19.4%) from FAIL to PASS.
    const genuineHeal = score(HEAL_5);
    const renamed = score(['A01', 'A02', 'A03', 'A04', 'A05']);

    expect(identifyRubric(genuineHeal)).toBe('sd-heal-5dim-v1');
    expect(identifyRubric(renamed)).not.toBe('vision-av-v1');
    expect(identifyRubric(renamed)).toBe('unregistered');
  });

  it('a one-key A/V payload cannot claim the most lenient rubric', () => {
    // `keys.every(...)` is VACUOUSLY TRUE on a single key — that is how {A01:90} passed.
    expect(identifyRubric({ A01: 90 })).toBe('unregistered');
  });

  it('and the spoof is REFUSED rather than silently scored', () => {
    // Classification is only half the fix; what matters is that nothing downstream hands the
    // payload a threshold anyway.
    expect(() => resolveEffectiveThreshold('bugfix', score(['A01','A02','A03','A04','A05'])))
      .toThrow(/unregistered/i);
  });

  it('the GENUINE instrument is untouched at every width it actually emits', () => {
    // Both arms. A floor set too high would "fix" the spoof by breaking the real rubric, and a test
    // that only asserted the spoof is rejected would not notice.
    expect(identifyRubric(score(VISION_18))).toBe('vision-av-v1');
    for (const width of [11, 12, 13, 14, 15, 16, 17, 18]) {
      const keys = Array.from({ length: width }, (_, i) => `V${String(i + 1).padStart(2, '0')}`);
      expect(identifyRubric(score(keys)), `width ${width}`).toBe('vision-av-v1');
    }
  });

  it('the floor sits exactly at the measured boundary — 10 out, 11 in', () => {
    const keys = (n) => Array.from({ length: n }, (_, i) => `V${String(i + 1).padStart(2, '0')}`);
    expect(identifyRubric(score(keys(10)))).toBe('unregistered');
    expect(identifyRubric(score(keys(11)))).toBe('vision-av-v1');
  });
});

describe('D3 — the declared rubric is cross-checked, and an ABSENT label is not a disagreement', () => {
  it('agrees when the label matches the key set', () => {
    const r = identifyRubricChecked(score(VISION_18), { rubric: 'vision-av-v1' });
    expect(r).toEqual({ rubric: 'vision-av-v1', declared: 'vision-av-v1', agrees: true });
  });

  it('DISAGREES when a row declares one rubric and its keys derive another', () => {
    // The spoof signature seen from the other side: the writer stamps its own label while the model
    // chooses the keys, so a payload that changes the key set alone shows up here.
    const r = identifyRubricChecked(score(VISION_18), { rubric: 'eva-5dim-v1' });
    expect(r.agrees).toBe(false);
    expect(r.declared).toBe('eva-5dim-v1');
    expect(r.rubric).toBe('vision-av-v1');
  });

  it('treats an unlabelled row as agreeing — 95.2% of rows declare nothing', () => {
    // Both arms matter: a cross-check that called "undeclared" a mismatch would refuse almost the
    // entire table. That is a denial of service wearing a security fix.
    for (const snap of [null, undefined, {}, 'a raw prompt string', { mode: 'sd-heal' }]) {
      expect(identifyRubricChecked(score(VISION_18), snap).agrees, String(snap)).toBe(true);
    }
  });
});

describe('D4 — the gate no longer writes the signature its own resolver refuses', () => {
  // fastAutoHeal returns details:{structural, semantic, elapsed_ms} and that object went straight
  // into dimension_scores. Wired, that is a livelock authored by one function in this file and
  // sprung by another: write latency row -> refuse -> FAIL -> retry -> identical row.
  //
  // THESE ASSERTIONS EXECUTE THE BUILDER. The first version of this block regexed the gate source,
  // and a mutant that reverted the payload to `fastResult.details` SURVIVED it — the destructuring
  // line was still present, only its USE had changed. That is precisely the defect class this SD
  // is about, reproduced by me one file over, so the inline code became an exported function.
  // DELIBERATELY NOT 100/70. Those are the builder's own fallback defaults, and the first version of
  // this fixture used them — so a mutant that threw the real scores away and returned a fresh
  // {structural:100, semantic:70} SURVIVED, because the expected values coincided with the constant.
  // Realistic-looking fixture values that happen to equal the defaults cannot detect a constant.
  const fastResult = {
    score: 88,
    mode: 'fast-haiku',
    details: { structural: { score: 93 }, semantic: { score: 61 }, elapsed_ms: 1200 },
  };

  it('strips elapsed_ms from what will be written as dimension_scores', () => {
    const dims = buildFastHealDimensionScores(fastResult);
    expect(Object.keys(dims).sort()).toEqual(['semantic', 'structural']);
    expect(dims).not.toHaveProperty('elapsed_ms');
  });

  it('and the KEPT dimensions are unchanged — the strip is surgical, not a rebuild', () => {
    // A builder that returned a fresh hard-coded object would pass the assertion above while
    // silently discarding the real scores.
    const dims = buildFastHealDimensionScores(fastResult);
    expect(dims.structural).toEqual({ score: 93 });
    expect(dims.semantic).toEqual({ score: 61 });
  });

  it('what it produces is CLASSIFIABLE — the whole point of the strip', () => {
    // If this still read latency-3dim the livelock would survive the fix.
    const dims = buildFastHealDimensionScores(fastResult);
    expect(identifyRubric(dims)).not.toBe('latency-3dim');
  });

  it('falls back to a scored payload when details are absent', () => {
    const dims = buildFastHealDimensionScores({ structuralScore: 90, semanticScore: 60 });
    expect(dims).toEqual({ structural: { score: 90 }, semantic: { score: 60 } });
    expect(identifyRubric(dims)).not.toBe('latency-3dim');
  });

  it('elapsed_ms is STILL preserved in rubric_snapshot.details — nothing is lost', () => {
    // The fix is only free because the timing fact survives elsewhere on the same insert. If that
    // duplication were ever removed this fix would start destroying data, and this says so.
    const GATE = path.join(process.cwd(), 'scripts/modules/handoff/executors/plan-to-lead/gates/heal-before-complete.js');
    expect(fs.readFileSync(GATE, 'utf8')).toMatch(/details: fastResult\.details/);
  });

  it('a raw latency payload is still refused, so the resolver half is intact', () => {
    expect(identifyRubric({ structural: 90, semantic: 85, elapsed_ms: 1200 })).toBe('latency-3dim');
    expect(() => resolveEffectiveThreshold('feature', { structural: 90, semantic: 85, elapsed_ms: 1200 }))
      .toThrow(/latency|not a quality score/i);
  });
});
