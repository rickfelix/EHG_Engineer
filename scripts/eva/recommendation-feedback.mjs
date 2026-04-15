/**
 * EVA Recommendation Feedback Processor — Phase 2 Feedback Loop
 * SD: SD-LEO-INFRA-CONSULTANT-AGENT-PHASE-003
 *
 * Processes chairman accept/defer/reject decisions on recommendations.
 * Updates recommendation status and feeds back into trend confidence
 * scoring for future runs.
 *
 * Usage:
 *   node scripts/eva/recommendation-feedback.mjs list          # Show pending recommendations
 *   node scripts/eva/recommendation-feedback.mjs accept <id>   # Accept a recommendation
 *   node scripts/eva/recommendation-feedback.mjs defer <id>    # Defer a recommendation
 *   node scripts/eva/recommendation-feedback.mjs reject <id>   # Reject a recommendation
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createSupabaseServiceClient();

const CONFIDENCE_BOOST = 0.05; // Per accepted recommendation
const CONFIDENCE_CAP = 1.5; // Max feedback_weight

// ─── List Pending ──────────────────────────────────────────

async function listPending() {
  const { data, error } = await supabase
    .from('eva_consultant_recommendations')
    .select('id, recommendation_date, recommendation_type, title, description, priority_score, action_type, application_domain, status')
    .eq('status', 'pending')
    .order('priority_score', { ascending: false });

  if (error) {
    console.error('Error fetching recommendations:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('No pending recommendations. Run recommendation-engine.mjs to generate new ones.');
    return;
  }

  console.log(`\n📋 Pending Recommendations (${data.length}):\n`);
  for (const rec of data) {
    const prio = (rec.priority_score * 100).toFixed(0);
    console.log(`  ID: ${rec.id}`);
    console.log(`  [${prio}%] ${rec.recommendation_type}: ${rec.title}`);
    console.log(`  Action: ${rec.action_type} | Domain: ${rec.application_domain}`);
    console.log(`  ${rec.description}`);
    console.log();
  }

  console.log('Commands:');
  console.log('  node scripts/eva/recommendation-feedback.mjs accept <id>');
  console.log('  node scripts/eva/recommendation-feedback.mjs defer <id>');
  console.log('  node scripts/eva/recommendation-feedback.mjs reject <id>');
}

// ─── Process Feedback ──────────────────────────────────────

async function processFeedback(action, recId, notes) {
  // Validate action
  if (!['accepted', 'deferred', 'rejected'].includes(action)) {
    console.error(`Invalid action: ${action}. Use accept, defer, or reject.`);
    return;
  }

  // Fetch recommendation
  const { data: rec, error: fetchErr } = await supabase
    .from('eva_consultant_recommendations')
    .select('id, title, trend_id, application_domain, status')
    .eq('id', recId)
    .single();

  if (fetchErr || !rec) {
    console.error(`Recommendation not found: ${recId}`);
    return;
  }

  if (rec.status !== 'pending') {
    console.log(`Recommendation already ${rec.status}. Skipping.`);
    return;
  }

  // Update recommendation
  const { error: updateErr } = await supabase
    .from('eva_consultant_recommendations')
    .update({
      status: action,
      chairman_feedback: notes || null,
      feedback_at: new Date().toISOString()
    })
    .eq('id', recId);

  if (updateErr) {
    console.error(`Error updating recommendation: ${updateErr.message}`);
    return;
  }

  console.log(`✅ Recommendation "${rec.title}" marked as ${action}`);

  // Feedback loop: adjust trend confidence for accepted recommendations
  if (action === 'accepted' && rec.trend_id) {
    await boostTrendConfidence(rec.trend_id);
  }
}

async function boostTrendConfidence(trendId) {
  const { data: trend, error: fetchErr } = await supabase
    .from('eva_consultant_trends')
    .select('id, title, feedback_weight')
    .eq('id', trendId)
    .single();

  if (fetchErr || !trend) {
    console.log('   Could not find linked trend for feedback loop');
    return;
  }

  const currentWeight = trend.feedback_weight || 1.0;
  const newWeight = Math.min(CONFIDENCE_CAP, currentWeight + CONFIDENCE_BOOST);

  const { error: updateErr } = await supabase
    .from('eva_consultant_trends')
    .update({ feedback_weight: newWeight })
    .eq('id', trendId);

  if (updateErr) {
    console.error(`   Error updating trend weight: ${updateErr.message}`);
  } else {
    console.log(`   📈 Trend "${trend.title}" feedback_weight: ${currentWeight} → ${newWeight}`);
  }
}

// ─── Recommendation Decay (SD-EVA-FRIDAY-MEETING-ENHANCEMENT-ORCH-001-C) ──────

const DECAY_AMOUNT = 0.02;
const DECAY_FLOOR = 0.1;

/**
 * Apply relevance decay to pending recommendations that have not been interacted
 * with this cycle. Reduces feedback_weight by DECAY_AMOUNT, floored at DECAY_FLOOR.
 * Idempotent: skips recs where last_decay_at matches cycleDate.
 *
 * @param {string} cycleDate - ISO date string identifying this cycle (e.g. '2026-04-18')
 * @returns {Promise<{ decayed: number }>}
 */
export async function applyRecommendationDecay(cycleDate) {
  if (!cycleDate) return { decayed: 0 };
  // Normalize to ISO date string regardless of whether a Date object or string was passed
  const cycleDateStr = cycleDate instanceof Date
    ? cycleDate.toISOString().slice(0, 10)
    : String(cycleDate).slice(0, 10);

  // Fetch pending recs not yet decayed this cycle
  const { data: recs, error } = await supabase
    .from('eva_consultant_recommendations')
    .select('id, feedback_weight, metadata')
    .eq('status', 'pending');

  if (error) {
    console.error('[recommendation-feedback] applyRecommendationDecay fetch error:', error.message);
    return { decayed: 0 };
  }

  if (!recs || recs.length === 0) return { decayed: 0 };

  const toDecay = recs.filter(r => {
    const lastDecayAt = r.metadata?.last_decay_at;
    return !lastDecayAt || lastDecayAt < cycleDateStr;
  });

  let decayed = 0;
  for (const rec of toDecay) {
    const current = typeof rec.feedback_weight === 'number' ? rec.feedback_weight : 1.0;
    const newWeight = Math.max(DECAY_FLOOR, current - DECAY_AMOUNT);
    const updatedMetadata = { ...(rec.metadata || {}), last_decay_at: cycleDateStr };

    const { error: updateErr } = await supabase
      .from('eva_consultant_recommendations')
      .update({ feedback_weight: newWeight, metadata: updatedMetadata })
      .eq('id', rec.id);

    if (updateErr) {
      console.error(`[recommendation-feedback] decay update failed for ${rec.id}:`, updateErr.message);
    } else {
      decayed++;
    }
  }

  return { decayed };
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'list') {
    await listPending();
    return;
  }

  const actionMap = { accept: 'accepted', defer: 'deferred', reject: 'rejected' };
  const action = actionMap[command];

  if (!action) {
    console.error(`Unknown command: ${command}`);
    console.log('Usage: list | accept <id> | defer <id> | reject <id>');
    return;
  }

  const recId = args[1];
  if (!recId) {
    console.error(`Missing recommendation ID. Usage: ${command} <id>`);
    return;
  }

  const notes = args.slice(2).join(' ') || null;
  await processFeedback(action, recId, notes);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
