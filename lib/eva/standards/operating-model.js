/**
 * EHG Operating-Model SSOT — canonical cost-side assumptions for venture financial modeling.
 * SD-LEO-INFRA-S16-OPERATING-MODEL-COST-GROUNDING-001
 *
 * WHY: generic SaaS cost defaults (human payroll, $1.5–5.5k hosting, paid-ads marketing)
 * overstate EHG venture burn 8–50x and INVERT GO/KILL decisions. EHG's real operating model is:
 *   - ZERO human payroll — work is done by AI agents; the only "labor" cost is LLM/compute.
 *   - Hosting on the chairman-ratified venture-hosting-standard stack — Cloudflare-default
 *     (Cloudflare Pages/Workers + R2 + D1→Neon / Clerk / Gemini / Sentry; Replit is a prototyping opt-in).
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
  // FR-2: hosting grounded in the venture-hosting-standard stack (Cloudflare-default).
  hosting: Object.freeze({
    monthly_usd_band: [5, 50],
    stack: Object.freeze(['Cloudflare', 'D1->Neon', 'Clerk', 'Gemini', 'Sentry']),
    basis: 'Chairman-ratified Cloudflare-default venture-hosting-standard stack (Pages/Workers + R2 + D1->Neon) — ~$5/mo early (vs ~$55/mo on Replit), scaling ~$50 as Neon graduates and Workers usage grows. Replit is a prototyping opt-in. See CD30_stack_cloudflare.',
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

/**
 * Ground a monthly REVENUE figure in the S7 unit-economics (SD-LEO-INFRA-S16-REVENUE-GROUNDING-001),
 * the revenue companion to groundCostBreakdown. The PRICE is the ratified S7 arpa (DERIVED); the
 * customer VOLUME is a transparent, conservative adoption ramp (ESTIMATE) — NOT an LLM-invented
 * trajectory. Each figure is epistemic-tagged so the evidence-gate can distinguish a grounded price
 * from an estimated volume.
 *
 * Returns null when S7 has no usable arpa, so the caller keeps the LLM revenue tagged ESTIMATE rather
 * than fabricating a DERIVED price. The volume is monotonic non-decreasing and bounded by an optional
 * S7 funnel/SAM ceiling.
 *
 * @param {Object} opts
 * @param {Object} [opts.s7economics] - persisted S7 unit-economics ({ arpa, funnel_ceiling|sam_customers, ... }).
 * @param {number} [opts.month=1] - 1-based projection month.
 * @param {number} [opts.priorCustomers=0] - prior month's customer count, carried forward for a continuous ramp.
 * @returns {{ revenue:number, customers:number, provenance:{price:string, volume:string} } | null}
 */
export function groundRevenue({ s7economics = {}, month = 1, priorCustomers = 0 } = {}) {
  const arpa = Number(s7economics?.arpa);
  if (!Number.isFinite(arpa) || arpa <= 0) return null; // no ratified price → caller keeps the LLM ESTIMATE
  const m = Math.max(1, Math.trunc(Number(month) || 1));
  const SEED = 1;        // 1 customer in month 1 (early-stage realism)
  const GROWTH = 0.30;   // +30%/mo nominal adoption (transparent, conservative — an ESTIMATE)
  const ceilRaw = Number(s7economics?.funnel_ceiling ?? s7economics?.sam_customers);
  const CEIL = Number.isFinite(ceilRaw) && ceilRaw > 0 ? ceilRaw : Infinity;
  let customers;
  if (priorCustomers > 0) {
    // Continuous ramp: always grow by at least one customer so the curve never stalls on rounding.
    customers = Math.max(priorCustomers + 1, Math.ceil(priorCustomers * (1 + GROWTH)));
  } else {
    customers = m <= 1 ? SEED : Math.max(SEED, Math.round(SEED * Math.pow(1 + GROWTH, m - 1)));
  }
  customers = Math.min(Math.max(0, customers), CEIL);
  const revenue = Math.round(arpa * customers);
  return {
    revenue,
    customers,
    provenance: { price: PROVENANCE.DERIVED, volume: PROVENANCE.ESTIMATE },
  };
}

export default OPERATING_MODEL;
