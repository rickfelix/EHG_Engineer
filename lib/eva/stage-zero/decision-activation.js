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
 * Scan shape (adversarial-review round 1): the pass is anchored on PAUSED-AWAITING VENTURES,
 * not on resolved decisions — the decision table accumulates history forever (including the
 * pre-fix machine-forged lifecycle_stage=0 approved rows), so a decision-first scan would grow
 * unbounded and silently truncate at the PostgREST row cap, wedging fresh approvals outside the
 * window. The awaiting-venture set is small by construction (bounded by ventures actually
 * paused at the gate), and each venture is re-read fresh immediately before its guarded update
 * to shrink the lossy read-modify-write window on metadata.
 *
 * Advisory rows are excluded by the decision_type filter: createAdvisoryNotification writes
 * status='approved' decision_type='advisory' rows and must NEVER activate a venture.
 *
 * Idempotent: only ventures still paused with metadata.stage_zero.awaiting_chairman_decision=true
 * are touched; a second tick over an activated/cancelled venture is a no-op; a re-processed
 * rejection reuses the existing un-promoted nursery row instead of parking a duplicate.
 *
 * Part of SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001 (Delta-C1 / Solomon FIX-2).
 */

import { parkVenture } from './venture-nursery.js';

/** Safety bound on one pass — anything beyond carries to the next tick. */
const MAX_PER_PASS = 200;

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
 * Re-read the venture immediately before applying a verdict so the guarded update writes the
 * freshest metadata available (the whole-object metadata write is still last-writer-wins — a
 * JSONB merge RPC is the full fix; this shrinks the window from tick-length to milliseconds).
 * Returns null when the venture is no longer paused (someone else applied a transition).
 */
async function readPausedVenture(supabase, ventureId) {
  const { data, error } = await supabase
    .from('ventures')
    .select('*')
    .eq('id', ventureId)
    .eq('status', 'paused')
    .maybeSingle();
  if (error) throw error;
  return data || null;
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

  // Anchor on the (small) paused-awaiting venture set — never on unbounded decision history.
  const { data: ventures, error: vErr } = await supabase
    .from('ventures')
    .select('*')
    .eq('status', 'paused')
    .eq('metadata->stage_zero->>awaiting_chairman_decision', 'true')
    .limit(MAX_PER_PASS);

  if (vErr) {
    logger.warn(`[Stage0Activation] Venture scan failed (retry next tick): ${vErr.message}`);
    summary.errors += 1;
    return summary;
  }
  if (!ventures?.length) return summary;

  const awaiting = new Map(ventures.map(v => [v.id, v]));

  const { data: decisions, error: dErr } = await supabase
    .from('chairman_decisions')
    .select('id, venture_id, status, rationale')
    .in('venture_id', [...awaiting.keys()])
    .eq('lifecycle_stage', 0)
    .eq('decision_type', 'stage_gate')
    .in('status', ['approved', 'rejected'])
    .order('updated_at', { ascending: true })
    .limit(MAX_PER_PASS);

  if (dErr) {
    logger.warn(`[Stage0Activation] Decision scan failed (retry next tick): ${dErr.message}`);
    summary.errors += 1;
    return summary;
  }
  if (!decisions?.length) return summary;

  for (const decision of decisions) {
    if (!awaiting.has(decision.venture_id)) continue;
    summary.processed += 1;

    try {
      // Fresh read inside the pass: skip if the venture already transitioned (idempotency /
      // concurrent-instance race — the loser sees no paused row and does nothing).
      const venture = await readPausedVenture(supabase, decision.venture_id);
      if (!venture || venture.metadata?.stage_zero?.awaiting_chairman_decision !== true) {
        summary.processed -= 1;
        continue;
      }

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
        // Park is DEDUPED: a prior tick (or concurrent instance) whose cancel failed after a
        // successful park must reuse its un-promoted nursery row, not insert a duplicate.
        const { data: existingPark, error: parkLookupErr } = await supabase
          .from('venture_nursery')
          .select('id')
          .eq('name', venture.name)
          .is('promoted_to_venture_id', null)
          .limit(1)
          .maybeSingle();
        if (parkLookupErr) throw parkLookupErr;

        if (existingPark) {
          logger.log(`[Stage0Activation] Reusing existing nursery row ${existingPark.id} for ${venture.name} (park already applied)`);
        } else {
          await parkVenture(
            briefFromVenture(venture),
            {
              reason: `Chairman rejected at Stage 0 gate${decision.rationale ? `: ${decision.rationale}` : ''}`,
              triggerConditions: [],
              reviewSchedule: '90d',
            },
            { supabase, logger }
          );
        }

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
      logger.warn(`[Stage0Activation] Failed applying decision ${decision.id} to venture ${decision.venture_id} (retry next tick): ${err.message}`);
    }
  }

  return summary;
}
