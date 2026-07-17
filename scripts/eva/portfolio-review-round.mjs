/**
 * Portfolio Review EVA Round — board-as-cadence.
 * SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-C (chairman build-vs-instantiate
 * correction 2026-07-16: BUILD + RUN the cadence now; only STAFFED board roles
 * stay deferred — trigger 2+ live-revenue ventures, see
 * docs/reference/portfolio-review-cadence.md).
 *
 * Consumes venture/CEO state together with the chairman-governed
 * portfolio-strategy artifact (eva_vision_documents VISION-PORTFOLIO-STRATEGY-001,
 * Child A) and produces exactly ONE pending chairman decision packet per cadence
 * window — board proposes (recommendation enum), chairman decides. Chairman-only
 * decision columns are never written; recordPendingDecision is the only write path.
 * Durable review record: management_reviews (review_type='portfolio') — NOT
 * eva_updates, which has no type column, so a same-day upsert there would clobber
 * the Friday-meeting row.
 *
 * Manual trigger: node scripts/eva/portfolio-review-round.mjs [--dry-run]
 */

import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { loadPortfolioStrategy } from '../../lib/eva/stage-zero/strategic-context-loader.js';
import { recordPendingDecision } from '../../lib/chairman/record-pending-decision.mjs';

dotenv.config();

export const PORTFOLIO_REVIEW_DECISION_TYPE = 'portfolio_review';
// management_reviews.review_type CHECK allows only weekly|monthly|ad_hoc; a
// dedicated 'portfolio' value needs chairman-gated DDL (deferred). 'ad_hoc'
// avoids the UNIQUE(review_date,'weekly') collision with the management review;
// the decisions.kind marker identifies portfolio rows.
export const PORTFOLIO_REVIEW_TYPE = 'ad_hoc';
export const CADENCE_WINDOW_DAYS = 7;

// ventures is ~half unflagged synthetic (is_demo=false test rows like
// "Pipeline-Test-*" / "TS-fixture-*") — name-pattern exclusion is required until
// SYNTHETIC-DATA-HYGIENE-001 lands a trustworthy flag.
const SYNTHETIC_NAME_RE = /\b(test|fixture|demo|synthetic|e2e)\b|pipeline-test|ts-fixture|hcgate|realdb|^__|-\d{10,}\b/i;

export function isRealVenture(v) {
  if (!v || v.is_demo === true) return false;
  return !SYNTHETIC_NAME_RE.test(v.name || '');
}

/**
 * PURE packet composer — board proposes, chairman decides.
 * A missing/inactive strategy artifact degrades to a packet that names the gap
 * (recommendation 'fix'); it never blocks the governance loop.
 */
export function composeReviewPacket({ strategy, ventures, reviewDate }) {
  const strategyActive = !!strategy;
  const recommendation = strategyActive ? 'proceed' : 'fix';

  const lines = [];
  lines.push('# Portfolio Review (board-as-cadence)');
  lines.push(`Review Date: ${reviewDate}`);
  lines.push('');
  lines.push('## Strategy Artifact');
  lines.push(strategyActive
    ? `- ${strategy.vision_key}: ACTIVE (chairman-ratified)`
    : '- VISION-PORTFOLIO-STRATEGY-001: MISSING or not chairman-ratified — board proposes fixing the strategy artifact before portfolio moves');
  lines.push('');
  lines.push('## Ventures (real, active)');
  if (ventures.length === 0) {
    lines.push('- none');
  }
  for (const v of ventures) {
    lines.push(`- ${v.name}: stage ${v.current_lifecycle_stage}`);
  }
  lines.push('');
  lines.push('## Venture-CEO Org State');
  lines.push('- Staffed board/CEO roles: deferred (trigger: 2+ live-revenue ventures; duty_cycle/honest_idle required when built)');
  lines.push('');
  lines.push(`## Board Proposal: ${recommendation.toUpperCase()}`);
  lines.push(strategyActive
    ? 'Portfolio tracks the active strategy artifact; chairman decides disposition.'
    : 'Activate/ratify the portfolio-strategy artifact so the next review can score ventures against it.');

  return {
    title: `Portfolio review ${reviewDate} — board proposes ${recommendation.toUpperCase()}`,
    recommendation,
    narrative: lines.join('\n'),
    sections: {
      review_date: reviewDate,
      strategy_active: strategyActive,
      strategy_vision_key: strategyActive ? strategy.vision_key : null,
      ventures: ventures.map(v => ({ id: v.id, name: v.name, stage: v.current_lifecycle_stage })),
      staffing: 'deferred — 2+ live-revenue-ventures trigger; duty_cycle/honest_idle required when built',
    },
  };
}

/**
 * The portfolio review round handler.
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false] - compose + return packet, ZERO writes
 * @param {Object} [options.supabase] - injected client (tests)
 * @param {Object} [options.deps] - test seams { loadStrategy, record }
 */
export async function portfolioReviewHandler({ dryRun = false, supabase = null, deps = {} } = {}) {
  const db = supabase || createSupabaseServiceClient();
  const loadStrategy = deps.loadStrategy || loadPortfolioStrategy;
  const record = deps.record || recordPendingDecision;
  const reviewDate = new Date().toISOString().split('T')[0];

  const strategy = await loadStrategy(db, console);

  const { data: allVentures, error: ventureErr } = await db
    .from('ventures')
    .select('id, name, status, is_demo, current_lifecycle_stage')
    .eq('status', 'active');
  if (ventureErr) throw new Error(`ventures read failed: ${ventureErr.message}`);
  const ventures = (allVentures || []).filter(isRealVenture);

  const packet = composeReviewPacket({ strategy, ventures, reviewDate });

  if (dryRun) {
    return { dryRun: true, wrote: false, packet };
  }

  // One packet per cadence window: if a pending portfolio-review packet already
  // exists in the window (daemon restart, manual re-run), refresh the durable
  // record but do NOT insert a second packet.
  const windowStart = new Date(Date.now() - CADENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: existing, error: existErr } = await db
    .from('chairman_decisions')
    .select('id')
    .eq('decision_type', PORTFOLIO_REVIEW_DECISION_TYPE)
    .eq('status', 'pending')
    .gte('created_at', windowStart)
    .limit(1);
  if (existErr) throw new Error(`idempotency check failed: ${existErr.message}`);

  let packetId = existing?.[0]?.id || null;
  let insertedPacket = false;
  if (!packetId) {
    const res = await record(db, {
      title: packet.title,
      decisionType: PORTFOLIO_REVIEW_DECISION_TYPE,
      context: packet.sections,
      recommendation: packet.recommendation,
      blocking: false,
      raisedBy: 'eva_portfolio_review',
    });
    if (!res.recorded) throw new Error(`packet record failed: ${res.error}`);
    packetId = res.id;
    insertedPacket = true;
  }

  const { error: reviewErr } = await db
    .from('management_reviews')
    .upsert({
      review_date: reviewDate,
      review_type: PORTFOLIO_REVIEW_TYPE,
      actual_ventures: ventures.length,
      strategy_health: {
        strategy_active: !!strategy,
        vision_key: strategy?.vision_key || null,
      },
      decisions: { kind: PORTFOLIO_REVIEW_DECISION_TYPE, packet_id: packetId, recommendation: packet.recommendation },
      eva_narrative: packet.narrative,
    }, { onConflict: 'review_date,review_type' });
  if (reviewErr) throw new Error(`review record failed: ${reviewErr.message}`);

  return {
    reviewDate,
    packetId,
    insertedPacket,
    ventures: ventures.length,
    strategyActive: !!strategy,
  };
}

/**
 * Register the portfolio review round in an EvaMasterScheduler instance.
 * @param {Object} scheduler - EvaMasterScheduler with registerRound()
 */
export function registerPortfolioReviewRound(scheduler) {
  scheduler.registerRound('portfolio_review', {
    description: 'Recurring board-as-cadence portfolio review: venture state + governed strategy artifact -> ONE chairman decision packet per cadence',
    cadence: 'weekly',
    handler: portfolioReviewHandler,
  });
}

// CLI: manual trigger
if (process.argv[1]?.replace(/\\/g, '/').endsWith('portfolio-review-round.mjs')) {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`Portfolio Review Round - Manual Trigger${dryRun ? ' (dry-run)' : ''}`);
  console.log('='.repeat(50));

  portfolioReviewHandler({ dryRun })
    .then(result => {
      if (result.dryRun) {
        console.log('\n[dry-run] Composed packet (no writes):\n');
        console.log(result.packet.narrative);
        console.log(`\nRecommendation: ${result.packet.recommendation}`);
      } else {
        console.log(`\nReview stored for ${result.reviewDate}`);
        console.log(`  Packet: ${result.packetId} (${result.insertedPacket ? 'new' : 'existing — idempotent skip'})`);
        console.log(`  Ventures: ${result.ventures}`);
        console.log(`  Strategy artifact active: ${result.strategyActive}`);
      }
    })
    .catch(err => {
      console.error('Fatal:', err.message);
      process.exit(1);
    });
}
