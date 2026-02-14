/**
 * Budget Governor
 * SD-EVA-FEAT-MARKETING-FOUNDATION-001
 *
 * Per-venture per-platform monthly budget enforcement with stop-loss rules.
 * Stop-loss: if daily spend exceeds daily_stop_loss_multiplier × daily_average, halt posting.
 */

/**
 * Check if a platform dispatch is allowed under budget
 * @param {object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {string} platform - Platform name
 * @param {number} [estimatedCostCents=0] - Estimated cost of the dispatch
 * @returns {Promise<{allowed: boolean, reason?: string, budget?: object}>}
 */
export async function checkBudget(supabase, ventureId, platform, estimatedCostCents = 0) {
  const { data: budget, error } = await supabase
    .from('channel_budgets')
    .select('*')
    .eq('venture_id', ventureId)
    .eq('platform', platform)
    .single();

  if (error || !budget) {
    // No budget configured = no restrictions
    return { allowed: true, budget: null };
  }

  // Check if budget month needs reset
  const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
  if (budget.budget_month !== currentMonth) {
    await resetMonthlyBudget(supabase, budget.id, currentMonth);
    return { allowed: true, budget: { ...budget, current_month_spend_cents: 0, current_day_spend_cents: 0 } };
  }

  // Check monthly cap
  if (budget.current_month_spend_cents + estimatedCostCents > budget.monthly_budget_cents) {
    await updateBudgetStatus(supabase, budget.id, 'exceeded');
    return {
      allowed: false,
      reason: `Monthly budget exceeded: ${budget.current_month_spend_cents}/${budget.monthly_budget_cents} cents`,
      budget
    };
  }

  // Check daily limit
  if (budget.daily_limit_cents && budget.current_day_spend_cents + estimatedCostCents > budget.daily_limit_cents) {
    return {
      allowed: false,
      reason: `Daily budget exceeded: ${budget.current_day_spend_cents}/${budget.daily_limit_cents} cents`,
      budget
    };
  }

  // Check stop-loss: daily spend > multiplier × daily average
  const daysInMonth = new Date().getDate();
  const dailyAverage = daysInMonth > 1
    ? budget.current_month_spend_cents / (daysInMonth - 1)
    : budget.current_month_spend_cents;

  if (dailyAverage > 0 && budget.current_day_spend_cents > dailyAverage * budget.daily_stop_loss_multiplier) {
    return {
      allowed: false,
      reason: `Stop-loss triggered: daily spend (${budget.current_day_spend_cents}) exceeds ${budget.daily_stop_loss_multiplier}x daily average (${Math.round(dailyAverage)})`,
      budget
    };
  }

  return { allowed: true, budget };
}

/**
 * Record a spend event
 * @param {object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {string} platform - Platform name
 * @param {number} amountCents - Amount spent in cents
 */
export async function recordSpend(supabase, ventureId, platform, amountCents) {
  const { data: budget } = await supabase
    .from('channel_budgets')
    .select('id, current_month_spend_cents, current_day_spend_cents, monthly_budget_cents')
    .eq('venture_id', ventureId)
    .eq('platform', platform)
    .single();

  if (!budget) return;

  const newMonthSpend = budget.current_month_spend_cents + amountCents;
  const newDaySpend = budget.current_day_spend_cents + amountCents;
  const newStatus = newMonthSpend >= budget.monthly_budget_cents ? 'exceeded' : 'active';

  await supabase
    .from('channel_budgets')
    .update({
      current_month_spend_cents: newMonthSpend,
      current_day_spend_cents: newDaySpend,
      status: newStatus
    })
    .eq('id', budget.id);
}

/**
 * Reset monthly budget counters
 */
async function resetMonthlyBudget(supabase, budgetId, currentMonth) {
  await supabase
    .from('channel_budgets')
    .update({
      current_month_spend_cents: 0,
      current_day_spend_cents: 0,
      budget_month: currentMonth,
      status: 'active'
    })
    .eq('id', budgetId);
}

/**
 * Update budget status
 */
async function updateBudgetStatus(supabase, budgetId, status) {
  await supabase
    .from('channel_budgets')
    .update({ status })
    .eq('id', budgetId);
}

/**
 * Get budget utilization summary for a venture
 * @param {object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<object[]>} Budget status per platform
 */
export async function getBudgetSummary(supabase, ventureId) {
  const { data: budgets } = await supabase
    .from('channel_budgets')
    .select('*')
    .eq('venture_id', ventureId);

  return (budgets || []).map(b => ({
    platform: b.platform,
    monthlyBudget: b.monthly_budget_cents / 100,
    monthlySpend: b.current_month_spend_cents / 100,
    dailySpend: b.current_day_spend_cents / 100,
    utilization: b.monthly_budget_cents > 0
      ? Math.round((b.current_month_spend_cents / b.monthly_budget_cents) * 100)
      : 0,
    status: b.status
  }));
}

/**
 * Reset daily spend counters (to be called daily via cron/rollup)
 * @param {object} supabase - Supabase client
 */
export async function resetDailySpend(supabase) {
  await supabase
    .from('channel_budgets')
    .update({ current_day_spend_cents: 0 })
    .neq('current_day_spend_cents', 0);
}
