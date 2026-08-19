/**
 * Shared LLM pricing snapshot + model-name resolver.
 * SD-LEO-INFRA-FACTORY-COST-UNIT-001 (FR-1) — extracted from scripts/llm-cost-report.mjs
 * so the cost report CLI, the coordinator email cost panel, and tests share ONE source.
 *
 * IMPORTANT: these are static ESTIMATE rates (USD per 1M tokens, snapshot 2026-06).
 * Cache discounts and provider billing nuances are NOT modeled — label every derived
 * figure an ESTIMATE. No pricing DB table in v1 (LEAD scope decision).
 *
 * @module lib/cost/llm-pricing
 */

// input, output per 1M tokens (USD). Cached input handled separately (cache_hit rows
// cost ~0 here because the logger records 0 tokens for response-cache hits).
export const PRICING = {
  'gemini-2.5-pro':            { in: 1.25, out: 10.00 },
  'gemini-2.5-flash':          { in: 0.30, out: 2.50 },
  'gemini-2.5-flash-lite':     { in: 0.10, out: 0.40 },
  // QF-20260818-343: intro rate, through 2026-12-31. See GEMINI_3_7_FLASH_STEPPED below
  // for the 2027-01-01 rate -- priceFor() switches on the current date, not this entry.
  'gemini-3.7-flash':          { in: 0.75, out: 3.75 },
  'gemini-embedding-001':      { in: 0.15, out: 0.00 },
  'gpt-5.5':                   { in: 5.00, out: 30.00 },
  'gpt-5.4':                   { in: 2.50, out: 15.00 },
  'gpt-5.4-mini':              { in: 0.75, out: 4.50 },
  'gpt-5.4-nano':              { in: 0.20, out: 1.25 },
  'claude-opus':               { in: 15.00, out: 75.00 },
  'claude-sonnet':             { in: 3.00, out: 15.00 },
  'claude-haiku':              { in: 1.00, out: 5.00 },
  'local':                     { in: 0.00, out: 0.00 },
};

// QF-20260818-343: stepped rate effective 2027-01-01 (Google's published price change).
// Kept separate from PRICING (a flat table with no date concept) so the step is a real,
// live-evaluated switch, not inert documentation someone has to remember to apply.
export const GEMINI_3_7_FLASH_STEPPED = { in: 1.50, out: 7.50 };
const GEMINI_3_7_FLASH_STEP_DATE = Date.UTC(2027, 0, 1); // 2027-01-01T00:00:00Z

/**
 * Fuzzy-resolve a reported model name to a pricing tier.
 * Mirrors the original llm-cost-report.mjs matcher exactly (behavior-identical).
 * @param {string} modelName e.g. 'gemini-2.5-flash', 'Opus 4.8 (1M context)', 'qwen3-coder:30b'
 * @returns {{in: number, out: number}|null} null = unknown model (counted in tokens, $0 estimate)
 */
export function priceFor(modelName) {
  if (!modelName) return null;
  const m = String(modelName).toLowerCase();
  if (m.includes('qwen') || m.includes('ollama') || m.includes('llama') || m.includes('local')) return PRICING.local;
  if (m.includes('flash-lite')) return PRICING['gemini-2.5-flash-lite'];
  // QF-20260818-343: MUST run before the generic 'gemini'+'flash' fallback below, which
  // would otherwise silently misprice every gemini-3.7-flash row at the 2.5-flash rate
  // (2.5x too cheap) -- the exact "governor lies to itself" class this QF was asked to close.
  if (m.includes('gemini') && m.includes('3.7') && m.includes('flash')) {
    return Date.now() >= GEMINI_3_7_FLASH_STEP_DATE ? GEMINI_3_7_FLASH_STEPPED : PRICING['gemini-3.7-flash'];
  }
  if (m.includes('gemini') && m.includes('flash')) return PRICING['gemini-2.5-flash'];
  if (m.includes('gemini') && m.includes('pro')) return PRICING['gemini-2.5-pro'];
  if (m.includes('embedding')) return PRICING['gemini-embedding-001'];
  if (m.includes('gpt-5.5')) return PRICING['gpt-5.5'];
  if (m.includes('nano')) return PRICING['gpt-5.4-nano'];
  if (m.includes('mini')) return PRICING['gpt-5.4-mini'];
  if (m.includes('gpt-5.4') || m.includes('gpt-5')) return PRICING['gpt-5.4'];
  if (m.includes('opus')) return PRICING['claude-opus'];
  if (m.includes('sonnet')) return PRICING['claude-sonnet'];
  if (m.includes('haiku')) return PRICING['claude-haiku'];
  return null; // unknown → counted in tokens, $0 estimate
}

/**
 * Estimate the USD cost of one model_usage_log row.
 * @param {{reported_model_name?: string, metadata?: {input_tokens?: number, output_tokens?: number}}} r
 * @returns {{usd: number, inT: number, outT: number, known: boolean}}
 */
export function rowCost(r) {
  const p = priceFor(r?.reported_model_name);
  const inT = Number(r?.metadata?.input_tokens || 0);
  const outT = Number(r?.metadata?.output_tokens || 0);
  if (!p) return { usd: 0, inT, outT, known: false };
  return { usd: (inT / 1e6) * p.in + (outT / 1e6) * p.out, inT, outT, known: true };
}

/** Hard-coded caveat line — every cost surface must print/render this. */
export const COST_CAVEAT =
  'ESTIMATE: programmatic LLM calls only — Claude Code main-session tokens (the dominant factory cost) are NOT captured; pricing is a static snapshot.';

export default { PRICING, priceFor, rowCost, COST_CAVEAT, GEMINI_3_7_FLASH_STEPPED };
