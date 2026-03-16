/**
 * Operations Mode Transition Engine.
 * Evaluates venture metrics against configurable thresholds to determine
 * when ventures should change lifecycle modes. All transitions require
 * chairman approval via pending_ceo_handoffs.
 *
 * @module lib/eva/operations/mode-transition-engine
 */

/**
 * Threshold configs for each transition path.
 * Values based on brainstorm/2026-03-15-operations-mode-design.md
 */
export const TRANSITION_THRESHOLDS = {
  'operations→growth': {
    mom_growth_pct: 20,        // MoM growth >20%
    min_months_growth: 3,      // Sustained for 3+ months
    min_customers: 100,
    max_churn_pct: 5,
  },
  'growth→scaling': {
    min_arr: 100000,           // ARR >$100K
    min_ltv_cac_ratio: 3.0,    // LTV:CAC >3.0
    min_months_sustained: 6,
  },
  'scaling→exit_prep': {
    min_exit_readiness_score: 70,
    min_quarters_above: 2,
  },
  'exit_prep→divesting': {
    chairman_approval_required: true,  // Chairman approves buyer/deal
  },
  'divesting→sold': {
    transaction_complete: true,
  },
  'any→parked': {
    chairman_decision: true,
  },
  'any→killed': {
    chairman_decision: true,
  },
};

/**
 * Evaluate whether a venture qualifies for a mode transition.
 *
 * @param {string} currentMode - Current venture mode
 * @param {object} metrics - Venture metrics snapshot
 * @param {number} [metrics.mom_growth_pct] - Month-over-month growth %
 * @param {number} [metrics.consecutive_growth_months] - Months of sustained growth
 * @param {number} [metrics.customer_count] - Active customers
 * @param {number} [metrics.churn_pct] - Monthly churn %
 * @param {number} [metrics.arr] - Annual Recurring Revenue
 * @param {number} [metrics.ltv_cac_ratio] - LTV to CAC ratio
 * @param {number} [metrics.exit_readiness_score] - Exit readiness score (0-100)
 * @param {number} [metrics.quarters_above_exit_threshold] - Quarters with exit score ≥70
 * @returns {{ eligible: boolean, targetMode: string|null, reasons: string[] }}
 */
export function evaluateTransition(currentMode, metrics) {
  const transitions = getTransitionsFrom(currentMode);

  for (const { path, target, thresholds } of transitions) {
    const reasons = [];
    let eligible = true;

    if (thresholds.chairman_decision || thresholds.chairman_approval_required || thresholds.transaction_complete) {
      // These are chairman-only transitions, not metric-driven
      continue;
    }

    if (thresholds.mom_growth_pct !== undefined) {
      if ((metrics.mom_growth_pct || 0) > thresholds.mom_growth_pct) {
        reasons.push(`MoM growth ${metrics.mom_growth_pct}% > ${thresholds.mom_growth_pct}%`);
      } else { eligible = false; }
    }
    if (thresholds.min_months_growth !== undefined) {
      if ((metrics.consecutive_growth_months || 0) >= thresholds.min_months_growth) {
        reasons.push(`${metrics.consecutive_growth_months} months sustained growth`);
      } else { eligible = false; }
    }
    if (thresholds.min_customers !== undefined) {
      if ((metrics.customer_count || 0) >= thresholds.min_customers) {
        reasons.push(`${metrics.customer_count} customers`);
      } else { eligible = false; }
    }
    if (thresholds.max_churn_pct !== undefined) {
      if ((metrics.churn_pct || 100) <= thresholds.max_churn_pct) {
        reasons.push(`Churn ${metrics.churn_pct}% ≤ ${thresholds.max_churn_pct}%`);
      } else { eligible = false; }
    }
    if (thresholds.min_arr !== undefined) {
      if ((metrics.arr || 0) >= thresholds.min_arr) {
        reasons.push(`ARR $${metrics.arr} ≥ $${thresholds.min_arr}`);
      } else { eligible = false; }
    }
    if (thresholds.min_ltv_cac_ratio !== undefined) {
      if ((metrics.ltv_cac_ratio || 0) >= thresholds.min_ltv_cac_ratio) {
        reasons.push(`LTV:CAC ${metrics.ltv_cac_ratio} ≥ ${thresholds.min_ltv_cac_ratio}`);
      } else { eligible = false; }
    }
    if (thresholds.min_exit_readiness_score !== undefined) {
      if ((metrics.exit_readiness_score || 0) >= thresholds.min_exit_readiness_score) {
        reasons.push(`Exit readiness ${metrics.exit_readiness_score} ≥ ${thresholds.min_exit_readiness_score}`);
      } else { eligible = false; }
    }
    if (thresholds.min_quarters_above !== undefined) {
      if ((metrics.quarters_above_exit_threshold || 0) >= thresholds.min_quarters_above) {
        reasons.push(`${metrics.quarters_above_exit_threshold} quarters above threshold`);
      } else { eligible = false; }
    }

    if (eligible && reasons.length > 0) {
      return { eligible: true, targetMode: target, reasons };
    }
  }

  return { eligible: false, targetMode: null, reasons: [] };
}

/**
 * Submit a mode transition for chairman approval.
 *
 * @param {object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {string} fromMode - Current mode
 * @param {string} toMode - Target mode
 * @param {string[]} reasons - Evaluation reasons
 * @returns {Promise<{id: string, status: string}>}
 */
export async function submitTransitionForApproval(supabase, ventureId, fromMode, toMode, reasons) {
  const { data, error } = await supabase
    .from('pending_ceo_handoffs')
    .insert({
      venture_id: ventureId,
      from_stage: `mode:${fromMode}`,
      to_stage: `mode:${toMode}`,
      handoff_data: { type: 'mode_transition', from: fromMode, to: toMode, reasons, evaluated_at: new Date().toISOString() },
      status: 'pending',
      proposed_at: new Date().toISOString(),
    })
    .select('id, status')
    .single();

  if (error) throw new Error(`Failed to submit transition: ${error.message}`);
  return data;
}

function getTransitionsFrom(mode) {
  const results = [];
  for (const [path, thresholds] of Object.entries(TRANSITION_THRESHOLDS)) {
    const [from, target] = path.split('→');
    if (from === mode || from === 'any') {
      results.push({ path, target, thresholds });
    }
  }
  return results;
}
