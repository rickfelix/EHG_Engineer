/**
 * Stage-0 Decision Activation Consumer
 *
 * The resume seam for the paused 'ready' flow: chairman-review.js persistVentureBrief creates
 * ready ventures PAUSED with a PENDING chairman_decisions row (lifecycle_stage=0,
 * decision_type='stage_gate'). The chairman resolves that decision on ANY surface
 * (eva-decisions.js CLI, dashboard, API) — none of which carry venture-side effects — so this
 * poll-side consumer applies the verdict on the queue processor's tick:
 *
 *   approved -> venture status 'active' + activation provenance (traceable to the decision id)
 *   rejected -> parkVenture (nursery, per SD-LEO-INFRA-STAGE0-NURSERY-PARK-PATH-001) + 'cancelled'
 *
 * Poll-side (not bolted into one approval CLI) so every approval surface is covered — Solomon's
 * reach-not-mechanism lesson: governance wired to ONE path while three run ungoverned.
 *
 * Advisory rows are excluded by the decision_type filter: createAdvisoryNotification writes
 * status='approved' decision_type='advisory' rows and must NEVER activate a venture.
 *
 * Idempotent: only ventures still paused with metadata.stage_zero.awaiting_chairman_decision=true
 * are touched; a second tick over an activated/cancelled venture is a no-op.
 *
 * Part of SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001 (Delta-C1 / Solomon FIX-2).
 */

import { parkVenture } from './venture-nursery.js';

/**
 * Rebuild a park-able brief from the paused venture's typed columns + stage_zero metadata.
 * @param {Object} venture - ventures row
 * @returns {Object} brief shape parkVenture consumes
 */
export function briefFromVenture(venture) {
  const sz = venture.metadata?.stage_zero || {};
  return {
    name: venture.name,
    problem_statement: venture.problem_statement || venture.description,
    solution: venture.solution || sz.solution,
    target_market: venture.target_market,
    origin_type: venture.origin_type,
    raw_chairman_intent: venture.raw_chairman_intent || sz.raw_chairman_intent,
    archetype: sz.synthesis_archetype || venture.archetype,
    moat_strategy: venture.moat_strategy,
    portfolio_synergy_score: venture.portfolio_synergy_score,
    time_horizon_classification: venture.time_horizon_classification,
    build_estimate: venture.build_estimate,
    discovery_strategy: venture.discovery_strategy,
    // Rejected at the ready gate -> parks at the weakest maturity (mirrors the sibling SD's
    // blocked/nursery -> 'seed' mapping).
    maturity: 'seed',
    metadata: venture.metadata,
  };
}

/**
 * Apply resolved Stage-0 gate decisions to their paused-awaiting ventures.
 *
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client (service role)
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<{processed: number, activated: number, parked: number, errors: number}>}
 */
export async function processStageZeroDecisions({ supabase, logger = console }) {
  const summary = { processed: 0, activated: 0, parked: 0, errors: 0 };
  if (!supabase) throw new Error('supabase client is required');

  const { data: decisions, error } = await supabase
    .from('chairman_decisions')
    .select('id, venture_id, status, rationale')
    .eq('lifecycle_stage', 0)
    .eq('decision_type', 'stage_gate')
    .in('status', ['approved', 'rejected']);

  if (error) {
    logger.warn(`[Stage0Activation] Decision scan failed (retry next tick): ${error.message}`);
    summary.errors += 1;
    return summary;
  }
  if (!decisions?.length) return summary;

  const ventureIds = [...new Set(decisions.map(d => d.venture_id).filter(Boolean))];
  const { data: ventures, error: vErr } = await supabase
    .from('ventures')
    .select('*')
    .in('id', ventureIds)
    .eq('status', 'paused');

  if (vErr) {
    logger.warn(`[Stage0Activation] Venture scan failed (retry next tick): ${vErr.message}`);
    summary.errors += 1;
    return summary;
  }

  const awaiting = new Map(
    (ventures || [])
      .filter(v => v.metadata?.stage_zero?.awaiting_chairman_decision === true)
      .map(v => [v.id, v])
  );
  if (!awaiting.size) return summary;

  for (const decision of decisions) {
    const venture = awaiting.get(decision.venture_id);
    if (!venture) continue; // already applied, or not a paused-awaiting venture — no-op
    summary.processed += 1;

    try {
      if (decision.status === 'approved') {
        const { error: upErr } = await supabase
          .from('ventures')
          .update({
            status: 'active',
            metadata: {
              ...(venture.metadata || {}),
              stage_zero: {
                ...(venture.metadata?.stage_zero || {}),
                awaiting_chairman_decision: false,
                activation: {
                  decision_id: decision.id,
                  activated_at: new Date().toISOString(),
                  activated_by: 'chairman-approval',
                },
              },
            },
          })
          .eq('id', venture.id)
          .eq('status', 'paused'); // guard: never flip a venture something else already moved
        if (upErr) throw upErr;
        summary.activated += 1;
        logger.log(`[Stage0Activation] Venture ${venture.id} ACTIVATED by chairman decision ${decision.id}`);
      } else {
        // rejected -> park first, cancel second. A park failure leaves the venture PAUSED
        // (retryable next tick) — never cancel a venture that has no nursery row, or the idea
        // is silently lost (the exact strand class the nursery exists to prevent).
        await parkVenture(
          briefFromVenture(venture),
          {
            reason: `Chairman rejected at Stage 0 gate${decision.rationale ? `: ${decision.rationale}` : ''}`,
            triggerConditions: [],
            reviewSchedule: '90d',
          },
          { supabase, logger }
        );
        const { error: cancelErr } = await supabase
          .from('ventures')
          .update({
            status: 'cancelled',
            metadata: {
              ...(venture.metadata || {}),
              stage_zero: {
                ...(venture.metadata?.stage_zero || {}),
                awaiting_chairman_decision: false,
                cancellation: {
                  decision_id: decision.id,
                  reason: 'chairman_rejected',
                  cancelled_at: new Date().toISOString(),
                },
              },
            },
          })
          .eq('id', venture.id)
          .eq('status', 'paused');
        if (cancelErr) throw cancelErr;
        summary.parked += 1;
        logger.log(`[Stage0Activation] Venture ${venture.id} PARKED+CANCELLED by chairman decision ${decision.id}`);
      }
    } catch (err) {
      summary.errors += 1;
      logger.warn(`[Stage0Activation] Failed applying decision ${decision.id} to venture ${venture.id} (retry next tick): ${err.message}`);
    }
  }

  return summary;
}
