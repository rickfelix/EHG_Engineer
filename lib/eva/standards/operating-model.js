/**
 * EHG Operating-Model SSOT — canonical cost-side assumptions for venture financial modeling.
 * SD-LEO-INFRA-S16-OPERATING-MODEL-COST-GROUNDING-001
 *
 * WHY: generic SaaS cost defaults (human payroll, $1.5–5.5k hosting, paid-ads marketing)
 * overstate EHG venture burn 8–50x and INVERT GO/KILL decisions. EHG's real operating model is:
 *   - ZERO human payroll — work is done by AI agents; the only "labor" cost is LLM/compute.
 *   - Hosting on the chairman-ratified venture-hosting-standard stack (Replit/Neon/Clerk/Gemini/Sentry).
 *   - Organic-first GTM (X/Bluesky + Stage-18 AI copy), paid acquisition is a later opt-in.
 *   - Solo $0-salary founder (sweat equity) early.
 *
 * This module is the FIRST-CLASS, QUERYABLE context block consumed by the Stage-16 producer for
 * EVERY venture (FR-5), so cost-side grounding happens automatically — not by an agent remembering
 * to fetch it. Each grounded figure is tagged with provenance: DERIVED-from-operating-model vs ESTIMATE.
 *
 * Companion to lib/eva/standards/venture-stack-policy.js (the infrastructure-stack SSOT).
 */

export const PROVENANCE = Object.freeze({
  DERIVED: 'DERIVED-from-operating-model',
  ESTIMATE: 'ESTIMATE',
});

/**
 * Canonical operating-model cost assumptions. Monthly USD bands are [early, scaling].
 */
export const OPERATING_MODEL = Object.freeze({
  version: '1.0.0',
  // FR-1: no human payroll — only variable LLM/compute cost (sourced from model_usage_log / llm-pricing).
  ai_operations: Object.freeze({
    monthly_usd_band: [3, 60],
    basis: 'Variable LLM/compute cost (token usage via model_usage_log + lib/cost/llm-pricing.js). NO human payroll.',
    provenance: PROVENANCE.DERIVED,
  }),
  // FR-2: hosting grounded in the venture-hosting-standard stack.
  hosting: Object.freeze({
    monthly_usd_band: [25, 85],
    stack: Object.freeze(['Replit', 'Neon', 'Clerk', 'Gemini', 'Sentry']),
    basis: 'Chairman-ratified venture-hosting-standard stack with stage-based bands (early ~$25, scaling ~$85+).',
    provenance: PROVENANCE.DERIVED,
  }),
  // FR-3: organic-first GTM. Paid acquisition is an explicit later-stage opt-in, NOT the default.
  marketing: Object.freeze({
    monthly_usd_band: [0, 200],
    model: 'Organic-first: X/Bluesky + Stage-18 AI-generated copy. Paid acquisition is a later-stage opt-in.',
    caveat: 'Organic-only acquisition has a known weak-standalone-acquisition risk (venture1 triangulation) — model as baseline but DO NOT assume it guarantees traction.',
    provenance: PROVENANCE.DERIVED,
  }),
  // FR-4: solo $0-salary founder + real "other" (payment processing, domain, monitoring).
  founder_salary: Object.freeze({
    monthly_usd: 0,
    basis: 'Solo founder, sweat equity — $0 salary early.',
    provenance: PROVENANCE.DERIVED,
  }),
  other: Object.freeze({
    payment_processing_pct: 2.9,
    domain_monthly_usd: 1.5,
    monitoring: 'Sentry free/low tier (counted in hosting)',
    basis: 'Payment processing (~2.9% of revenue), domain, incidental monitoring.',
    provenance: PROVENANCE.DERIVED,
  }),
});

/**
 * A compact prompt block injecting the operating model into the Stage-16 LLM call so the model
 * emits grounded numbers (FR-5: consumed for every venture).
 * @returns {string}
 */
export function getOperatingModelPromptBlock() {
  const om = OPERATING_MODEL;
  return [
    'EHG OPERATING MODEL (ground ALL cost assumptions in this — generic SaaS defaults are WRONG for EHG):',
    `- AI operations (NOT human payroll): $${om.ai_operations.monthly_usd_band[0]}-${om.ai_operations.monthly_usd_band[1]}/mo. ${om.ai_operations.basis}`,
    `- Hosting: $${om.hosting.monthly_usd_band[0]}-${om.hosting.monthly_usd_band[1]}/mo on ${om.hosting.stack.join('/')} (NOT generic $1.5-5.5k).`,
    `- Marketing: $${om.marketing.monthly_usd_band[0]}-${om.marketing.monthly_usd_band[1]}/mo organic-first (${om.marketing.model}). CAVEAT: ${om.marketing.caveat}`,
    `- Founder salary: $${om.founder_salary.monthly_usd}/mo (sweat equity).`,
    `- Other: ~${om.other.payment_processing_pct}% payment processing of revenue + domain + monitoring.`,
    'Use cost_breakdown keys: ai_operations, infrastructure, marketing, other, founder_salary. Do NOT include a human "personnel" payroll line.',
  ].join('\n');
}

/**
 * Ground a monthly cost_breakdown in the operating model (FR-1..FR-4) with provenance tags.
 * Used as the canonical fallback when the LLM omits a breakdown, and to sanity-band the totals.
 *
 * @param {Object} opts
 * @param {number} [opts.month=1] - 1-based projection month (drives early-vs-scaling band).
 * @param {number} [opts.revenue=0] - month revenue (drives payment-processing in "other").
 * @returns {{ breakdown: Object, provenance: Object, monthly_total: number }}
 */
export function groundCostBreakdown({ month = 1, revenue = 0 } = {}) {
  const om = OPERATING_MODEL;
  // Early months use the low end; scale toward the high end over the first year.
  const t = Math.min(1, Math.max(0, (Number(month) - 1) / 12));
  const band = ([lo, hi]) => Math.round(lo + (hi - lo) * t);

  const ai_operations = band(om.ai_operations.monthly_usd_band);
  const infrastructure = band(om.hosting.monthly_usd_band);
  const marketing = band(om.marketing.monthly_usd_band);
  const founder_salary = om.founder_salary.monthly_usd;
  const paymentProcessing = Math.round((Math.max(0, Number(revenue) || 0) * om.other.payment_processing_pct) / 100);
  const other = paymentProcessing + Math.round(om.other.domain_monthly_usd);

  const breakdown = { ai_operations, infrastructure, marketing, other, founder_salary };
  const provenance = {
    ai_operations: om.ai_operations.provenance,
    infrastructure: om.hosting.provenance,
    marketing: om.marketing.provenance,
    other: om.other.provenance,
    founder_salary: om.founder_salary.provenance,
  };
  const monthly_total = ai_operations + infrastructure + marketing + other + founder_salary;
  return { breakdown, provenance, monthly_total };
}

export default OPERATING_MODEL;
