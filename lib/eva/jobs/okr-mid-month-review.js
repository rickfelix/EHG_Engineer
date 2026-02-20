/**
 * OKR Mid-Month Review Handler
 *
 * SD: SD-EHG-ORCH-GOVERNANCE-STACK-001-D (US-005)
 *
 * Runs on Day 15 to assess KR progress, flag at-risk items,
 * and emit EVA events for dashboard consumption.
 *
 * @module lib/eva/jobs/okr-mid-month-review
 */

/**
 * Run mid-month OKR review.
 *
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client (service-role)
 * @param {Object} [deps.logger]  - Logger (defaults to console)
 * @returns {Promise<{reviewedKRs: number, atRisk: number, onTrack: number}>}
 */
export async function runOkrMidMonthReview({ supabase, logger = console }) {
  const reviewDate = new Date().toISOString().slice(0, 10);

  // 1. Fetch all active KRs with their objectives
  const { data: krs, error } = await supabase
    .from('key_results')
    .select('id, code, title, objective_id, baseline_value, current_value, target_value, direction, status, vision_dimension_code')
    .eq('is_active', true);

  if (error) {
    throw new Error(`Failed to fetch key results: ${error.message}`);
  }

  if (!krs || krs.length === 0) {
    logger.log('[OKR-Review] No active KRs found — skipping review');
    return { reviewedKRs: 0, atRisk: 0, onTrack: 0 };
  }

  let atRisk = 0;
  let onTrack = 0;

  for (const kr of krs) {
    const progress = computeProgress(kr);
    // Mid-month: if progress < 40%, flag as at_risk
    const newStatus = progress < 40 ? 'at_risk' : progress >= 80 ? 'on_track' : kr.status;

    if (newStatus !== kr.status) {
      await supabase
        .from('key_results')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', kr.id);
    }

    if (newStatus === 'at_risk') {
      atRisk++;
    } else {
      onTrack++;
    }
  }

  // Emit review event
  try {
    await supabase.from('eva_scheduler_metrics').insert({
      event_type: 'okr.mid_month_review.completed',
      metadata: { review_date: reviewDate, total_krs: krs.length, at_risk: atRisk, on_track: onTrack },
      scheduler_instance_id: 'okr-mid-month-review',
      occurred_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn(`[OKR-Review] Event emit failed: ${err.message}`);
  }

  logger.log(`[OKR-Review] Complete: ${krs.length} KRs reviewed, ${atRisk} at-risk, ${onTrack} on-track`);
  return { reviewedKRs: krs.length, atRisk, onTrack };
}

function computeProgress(kr) {
  const baseline = kr.baseline_value ?? 0;
  const current = kr.current_value ?? 0;
  const target = kr.target_value ?? 100;

  const range = target - baseline;
  if (range === 0) return current >= target ? 100 : 0;

  const raw = ((current - baseline) / range) * 100;
  const progress = kr.direction === 'decrease' ? 100 - raw : raw;
  return Math.max(0, Math.min(100, progress));
}
