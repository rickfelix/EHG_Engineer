// SD-LEO-INFRA-S7-DERIVED-UNIT-ECON-PERSIST-001 — derived unit-economics + resilient reality gate.
import { describe, it, expect } from 'vitest';
import { deriveUnitEconomics } from '../../../../lib/eva/stage-templates/unit-economics.js';
import { evaluateRealityGate } from '../../../../lib/eva/stage-templates/stage-09.js';
import { BMC_BLOCKS } from '../../../../lib/eva/stage-templates/stage-08.js';

// Valid Stage 06 / Stage 08 so the gate verdict turns purely on the S7 unit-economics under test.
const goodStage06 = { risks: Array.from({ length: 10 }, (_, i) => ({ id: i })) };
const goodStage08 = Object.fromEntries(BMC_BLOCKS.map((b) => [b, { items: [{ x: 1 }] }]));
const tiers = [{ name: 'Pro', price: 49 }];
const gate = (stage07) => evaluateRealityGate({ stage06: goodStage06, stage07, stage08: goodStage08 });

// Venture-1-style healthy inputs.
const HEALTHY = { arpa: 29.01, gross_margin_pct: 75, churn_rate_monthly: 8, cac: 90 };

describe('deriveUnitEconomics (FR-1 helper)', () => {
  it('TS-1: healthy inputs yield finite ltv, cac_ltv_ratio, payback_months', () => {
    const d = deriveUnitEconomics(HEALTHY);
    // monthlyGrossProfit = 29.01 * 0.75 = 21.7575; ltv = 21.7575 / 0.08 ≈ 271.97
    expect(d.ltv).toBeGreaterThan(250);
    expect(d.ltv).toBeLessThan(290);
    expect(d.payback_months).toBeGreaterThan(0);
    expect(d.payback_months).toBeCloseTo(90 / 21.7575, 2);
    expect(d.cac_ltv_ratio).toBeCloseTo(90 / d.ltv, 5);
    expect(d.warnings).toEqual([]);
  });

  it('TS-2: zero-churn -> ltv & cac_ltv_ratio null with a true-negative warning; payback still finite (churn-independent)', () => {
    const d = deriveUnitEconomics({ ...HEALTHY, churn_rate_monthly: 0 });
    expect(d.ltv).toBeNull();
    expect(d.cac_ltv_ratio).toBeNull();
    expect(Number.isFinite(d.payback_months)).toBe(true); // payback does not depend on churn
    expect(d.warnings.join(' ')).toMatch(/churn is zero/i);
    expect(d.ltv).not.toBe(Infinity); // never coerced
  });

  it('TS-2b: zero monthly profit (arpa or margin 0) -> payback null with warning', () => {
    const d = deriveUnitEconomics({ ...HEALTHY, arpa: 0 });
    expect(d.payback_months).toBeNull();
    expect(d.warnings.join(' ')).toMatch(/payback/i);
  });

  it('TS-3: idempotent — pure over raw inputs (two runs are deeply equal)', () => {
    expect(deriveUnitEconomics(HEALTHY)).toEqual(deriveUnitEconomics(HEALTHY));
    // never reads a prior ltv/payback: passing stale derived values does not change the result
    const withStale = deriveUnitEconomics({ ...HEALTHY, ltv: 999999, payback_months: -5 });
    expect(withStale).toEqual(deriveUnitEconomics(HEALTHY));
  });
});

describe('evaluateRealityGate (FR-2 resilient + teeth, FR-3 strings)', () => {
  it('TS-4: derived fields ABSENT but raw inputs present + healthy -> resilient PASS', () => {
    const r = gate({ tiers, ...HEALTHY }); // no ltv / payback_months persisted
    expect(r.pass).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('TS-4b: derived fields PRESENT + viable -> PASS (no regression)', () => {
    const r = gate({ tiers, ltv: 272, payback_months: 4.13, cac: 90, ...HEALTHY });
    expect(r.pass).toBe(true);
  });

  it('TS-5: TEETH — computable but LTV < CAC -> FAIL (not a rubber stamp)', () => {
    // monthlyProfit = 10*0.5 = 5; ltv = 5/0.08 = 62.5; cac = 10000 -> unviable
    const r = gate({ tiers, arpa: 10, gross_margin_pct: 50, churn_rate_monthly: 8, cac: 10000 });
    expect(r.pass).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/below CAC/i);
  });

  it('TS-6: zero-churn -> FAIL with a TRUE-NEGATIVE string, not the misleading "LTV not computed"', () => {
    const r = gate({ tiers, ...HEALTHY, churn_rate_monthly: 0 });
    expect(r.pass).toBe(false);
    const blockers = r.blockers.join(' ');
    expect(blockers).toMatch(/true negative|churn is zero/i);
    expect(blockers).not.toMatch(/LTV not computed \(likely zero churn rate\)/);
  });

  it('TS-6b: non-computable (no inputs, no derived) -> FAIL naming the missing-derived-field cause', () => {
    const r = gate({ tiers, cac: 90 }); // no arpa/margin/churn, no ltv/payback
    expect(r.pass).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/not computable|missing|invalid/i);
  });
});
