/**
 * Shared, PURE derivation of S7 unit-economics (LTV, CAC:LTV, payback months).
 * SD-LEO-INFRA-S7-DERIVED-UNIT-ECON-PERSIST-001.
 *
 * Single source of truth reused by:
 *   - the S7 persistence path (analysis-steps/stage-07-pricing-strategy.js) — FR-1
 *   - the S9 reality gate fallback (stage-09.js evaluateRealityGate) — FR-2
 * so persist-side and gate-side derivation can never drift.
 *
 * Formulas (canonical, per stage-07.js header):
 *   LTV            = (ARPA * gross_margin_pct/100) / (churn_rate_monthly / 100)   // churn as decimal
 *   cac_ltv_ratio  = CAC / LTV
 *   payback_months = CAC / (ARPA * gross_margin_pct/100)                          // churn-independent
 *
 * Edge cases yield NULL metrics + a warning (a true negative — never coerced to 0/Infinity):
 *   - churn <= 0 / non-finite  -> ltv = null (unbounded lifetime), cac_ltv_ratio = null
 *   - monthly gross profit <= 0 / non-finite -> payback_months = null
 *
 * PURE over the four raw inputs only (never reads a prior ltv/payback) -> idempotent / retry-safe.
 *
 * @param {{ arpa?: number, gross_margin_pct?: number, churn_rate_monthly?: number, cac?: number }} inputs
 * @returns {{ ltv: number|null, cac_ltv_ratio: number|null, payback_months: number|null, warnings: string[] }}
 */
export function deriveUnitEconomics({ arpa, gross_margin_pct, churn_rate_monthly, cac } = {}) {
  const warnings = [];
  const a = Number(arpa);
  const gm = Number(gross_margin_pct);
  const churn = Number(churn_rate_monthly);
  const c = Number(cac);

  // Monthly gross profit per account (ARPA × gross margin). Drives both payback and LTV.
  const monthlyGrossProfit =
    Number.isFinite(a) && Number.isFinite(gm) ? a * (gm / 100) : NaN;

  let ltv = null;
  let cac_ltv_ratio = null;
  let payback_months = null;

  // LTV depends on churn: average customer lifetime = 1 / churn_decimal months.
  if (Number.isFinite(monthlyGrossProfit) && Number.isFinite(churn) && churn > 0) {
    ltv = monthlyGrossProfit / (churn / 100);
  } else if (Number.isFinite(churn) && churn <= 0) {
    warnings.push(
      'LTV not computed: monthly churn is zero — customer lifetime is unbounded, so LTV is a genuine null (true negative), not a missing field.'
    );
  } else {
    warnings.push('LTV not computed: ARPA, gross margin, or churn rate is missing or invalid.');
  }

  // Payback depends only on monthly gross profit (independent of churn).
  if (Number.isFinite(monthlyGrossProfit) && monthlyGrossProfit > 0 && Number.isFinite(c)) {
    payback_months = c / monthlyGrossProfit;
  } else {
    warnings.push(
      'Payback months not computed: monthly gross profit (ARPA × gross margin) is zero or invalid.'
    );
  }

  // CAC:LTV ratio (lower is better; < 1 means LTV exceeds CAC).
  if (ltv !== null && ltv > 0 && Number.isFinite(c)) {
    cac_ltv_ratio = c / ltv;
  }

  return { ltv, cac_ltv_ratio, payback_months, warnings };
}
