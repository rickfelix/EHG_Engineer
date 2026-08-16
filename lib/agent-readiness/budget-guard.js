/**
 * lib/agent-readiness/budget-guard.js
 * SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 FR-6 / US-011.
 *
 * lib/cost/governor.js is observe-only and fails open (decideTier never blocks, governor.js:106/:114).
 * lib/research/deep-research-budget.js is the only ENFORCING pre-submission cap in the codebase, but
 * it is scoped to deep-research. This module reuses it under its own provider key ('agent-readiness-audit')
 * so audit spend is tracked and capped independently of deep-research's own budget.
 *
 * Verified firsthand (not from a secondhand summary): checkBudget/recordCost/getBudgetStatus are all
 * ASYNC and hit the deep_research_budget table directly; checkBudget takes no cap parameter — it reads
 * daily_cap_usd from today's row for the given provider, defaulting to DEEP_RESEARCH_DAILY_CAP_USD ($10)
 * if no row exists. AUDIT_BUDGET_CAP_USD would otherwise be a config nobody reads, so ensureCapSeeded()
 * upserts it into today's row before the first check each day.
 *
 * The check MUST run BEFORE any fan-out — a post-hoc check cannot halt spend that already happened.
 */

import { createClient } from '@supabase/supabase-js';
import { estimateCost, checkBudget, recordCost, getBudgetStatus } from '../research/deep-research-budget.js';

export const AUDIT_PROVIDER_KEY = 'agent-readiness-audit';
const ALERT_THRESHOLD_RATIO = 0.9;
const FALLBACK_CAP_USD = 5;

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function capFromEnv(env = process.env) {
  const parsed = env.AUDIT_BUDGET_CAP_USD !== undefined ? Number(env.AUDIT_BUDGET_CAP_USD) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_CAP_USD;
}

/**
 * Upsert AUDIT_BUDGET_CAP_USD into today's deep_research_budget row for our provider key, so
 * checkBudget() (which reads daily_cap_usd from the row, not from an env var) actually enforces it.
 * Idempotent per day: only writes daily_cap_usd, never touches total_cost_usd/call_count.
 */
export async function ensureCapSeeded(env = process.env) {
  const supabase = getSupabase();
  const capUsd = capFromEnv(env);
  const { data: existing } = await supabase
    .from('deep_research_budget')
    .select('id, daily_cap_usd')
    .eq('date', today())
    .eq('provider', AUDIT_PROVIDER_KEY)
    .maybeSingle();

  if (existing) {
    if (existing.daily_cap_usd !== capUsd) {
      await supabase.from('deep_research_budget').update({ daily_cap_usd: capUsd }).eq('id', existing.id);
    }
  } else {
    await supabase.from('deep_research_budget').insert({
      date: today(),
      provider: AUDIT_PROVIDER_KEY,
      total_cost_usd: 0,
      call_count: 0,
      daily_cap_usd: capUsd
    });
  }
  return capUsd;
}

/**
 * Extracts the provider family from a "family:model" entry (e.g. "anthropic:claude-opus-5" -> "anthropic").
 * Throws on malformed input rather than silently returning the whole string — matching
 * audit-runner.js's familyModel() contract exactly. Caught by a second adversarial review pass:
 * a lenient parser here would have let a malformed modelSet entry pass budget preflight (silently
 * costed at the Anthropic rate) and cause registerAuditRun()'s real DB write to happen, only for
 * the SAME malformed entry to throw later in the cells-building loop via familyModel() — leaving
 * an orphaned audit_run row (expected_sample_count set, zero samples ever written). Throwing here,
 * before that DB write, closes the gap at the earliest point instead of leaving two parsers that
 * disagree on the same input shape.
 */
function familyOf(entry) {
  const idx = String(entry).indexOf(':');
  if (idx < 0) throw new Error(`Model set entry must be "family:model" form, got: ${entry}`);
  return entry.slice(0, idx);
}

/**
 * Pre-flight budget check for a planned audit run. Call BEFORE any fan-out (AC-011-1/AC-011-2).
 *
 * Estimates PER MODEL FAMILY, not a single flat rate. Caught by adversarial review on PR #7113:
 * AUDIT_PROVIDER_KEY ('agent-readiness-audit') is not a key in deep-research-budget.js's
 * COST_ESTIMATES, so estimateCost(AUDIT_PROVIDER_KEY, ...) always silently fell back to the
 * Anthropic rate (COST_ESTIMATES[provider] || COST_ESTIMATES.anthropic) regardless of what was
 * actually in modelSet -- understating cost for any openai/google cells in the fan-out.
 * @param {{promptCount:number, modelSet:string[], samplesPerCell:number, estimatedInputTokens?:number, estimatedOutputTokens?:number, env?:object}} params
 * @returns {Promise<{allowed:boolean, estimatedCostUsd:number, capUsd:number, reason?:string}>}
 */
export async function preflightBudgetCheck({
  promptCount,
  modelSet,
  samplesPerCell,
  estimatedInputTokens = 400,
  estimatedOutputTokens = 200,
  env = process.env
} = {}) {
  const capUsd = await ensureCapSeeded(env);
  const cellsPerModel = promptCount * samplesPerCell;
  const estimatedCostUsd = modelSet.reduce((sum, entry) => {
    const perCallCost = estimateCost(familyOf(entry), estimatedInputTokens, estimatedOutputTokens);
    return sum + perCallCost * cellsPerModel;
  }, 0);

  const budget = await checkBudget(AUDIT_PROVIDER_KEY, estimatedCostUsd);
  if (!budget.allowed) {
    return { allowed: false, estimatedCostUsd, capUsd, reason: budget.reason };
  }
  return { allowed: true, estimatedCostUsd, capUsd };
}

/** Record actual spend after the run, so the cap is measured against reality, not only the estimate. */
export async function recordActualCost(actualCostUsd) {
  return recordCost(AUDIT_PROVIDER_KEY, actualCostUsd);
}

/**
 * Mid-run check: has spend crossed 90% of the cap? Callers poll this between batches (AC-011-3).
 * @returns {Promise<{alert:boolean, spentUsd:number, capUsd:number, ratio:number}>}
 */
export async function midRunAlertCheck(env = process.env) {
  const capUsd = capFromEnv(env);
  const statuses = await getBudgetStatus();
  const mine = statuses.find((s) => s.provider === AUDIT_PROVIDER_KEY);
  const spentUsd = mine?.total_cost_usd ?? 0;
  const effectiveCap = mine?.daily_cap_usd ?? capUsd;
  const ratio = effectiveCap > 0 ? spentUsd / effectiveCap : 0;
  return { alert: ratio >= ALERT_THRESHOLD_RATIO, spentUsd, capUsd: effectiveCap, ratio };
}

export const _internal = { capFromEnv, today, familyOf };
