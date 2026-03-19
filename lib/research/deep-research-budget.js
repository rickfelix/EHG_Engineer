/**
 * Deep Research Budget Controls
 * SD-LEO-FEAT-DEEP-RESEARCH-API-001 (FR-003)
 *
 * Daily spending caps, pre-submission cost estimation, alert thresholds,
 * and emergency kill-switch for deep research API calls.
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

const DEFAULT_DAILY_CAP = 10.00;
const ALERT_THRESHOLD_PCT = 0.80;

/** Check if a deep research request is within budget. */
export async function checkBudget(provider, estimatedCost) {
  const supabase = createSupabaseServiceClient();
  const today = new Date().toISOString().split('T')[0];

  const { data: killRow } = await supabase
    .from('deep_research_budget')
    .select('kill_switch')
    .eq('date', today)
    .eq('provider', 'aggregate')
    .maybeSingle();

  if (killRow?.kill_switch) {
    return { allowed: false, reason: 'Kill-switch active — all deep research blocked', remaining: 0, spent: 0, cap: 0 };
  }

  const { data: budget } = await supabase
    .from('deep_research_budget')
    .select('total_cost, daily_cap')
    .eq('date', today)
    .eq('provider', 'aggregate')
    .maybeSingle();

  const spent = budget?.total_cost || 0;
  const cap = budget?.daily_cap || DEFAULT_DAILY_CAP;
  const remaining = cap - spent;

  if (spent + estimatedCost > cap) {
    return { allowed: false, reason: `Daily cap exceeded: $${spent.toFixed(2)} spent of $${cap.toFixed(2)} cap`, remaining, spent, cap };
  }

  if ((spent + estimatedCost) / cap >= ALERT_THRESHOLD_PCT) {
    console.warn(`[Budget] Warning: ${Math.round(((spent + estimatedCost) / cap) * 100)}% of daily cap ($${cap.toFixed(2)})`);
  }

  return { allowed: true, reason: null, remaining: remaining - estimatedCost, spent, cap };
}

/** Record spending after a successful deep research call. */
export async function recordSpending(provider, tokensUsed, cost) {
  const supabase = createSupabaseServiceClient();
  const today = new Date().toISOString().split('T')[0];

  await supabase.from('deep_research_budget').upsert({
    date: today, provider, tokens_used: tokensUsed, total_cost: cost, request_count: 1, daily_cap: DEFAULT_DAILY_CAP,
  }, { onConflict: 'date,provider' });

  // Update aggregate
  const { data: allProviders } = await supabase
    .from('deep_research_budget')
    .select('total_cost, tokens_used, request_count')
    .eq('date', today)
    .neq('provider', 'aggregate');

  const totals = (allProviders || []).reduce((acc, row) => ({
    total_cost: acc.total_cost + (row.total_cost || 0),
    tokens_used: acc.tokens_used + (row.tokens_used || 0),
    request_count: acc.request_count + (row.request_count || 0),
  }), { total_cost: 0, tokens_used: 0, request_count: 0 });

  await supabase.from('deep_research_budget').upsert({
    date: today, provider: 'aggregate', ...totals, daily_cap: DEFAULT_DAILY_CAP,
  }, { onConflict: 'date,provider' });
}

/** Activate the emergency kill-switch. */
export async function activateKillSwitch() {
  const supabase = createSupabaseServiceClient();
  const today = new Date().toISOString().split('T')[0];
  await supabase.from('deep_research_budget').upsert({
    date: today, provider: 'aggregate', kill_switch: true, daily_cap: DEFAULT_DAILY_CAP,
  }, { onConflict: 'date,provider' });
}
