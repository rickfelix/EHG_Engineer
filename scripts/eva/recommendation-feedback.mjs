/**
 * EVA Recommendation Feedback Processor — Phase 2
 * SD: SD-LEO-INFRA-CONSULTANT-AGENT-PHASE-003
 *
 * Processes chairman accept/defer/reject decisions on recommendations.
 * Feedback loop: accepted recommendations boost confidence of similar
 * future trends by updating feedback_weight in eva_consultant_trends.
 *
 * Usage:
 *   node scripts/eva/recommendation-feedback.mjs                   # Interactive review
 *   node scripts/eva/recommendation-feedback.mjs --accept <id>     # Accept specific
 *   node scripts/eva/recommendation-feedback.mjs --defer <id>      # Defer specific
 *   node scripts/eva/recommendation-feedback.mjs --reject <id>     # Reject specific
 *   node scripts/eva/recommendation-feedback.mjs --status          # Show pending count
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Feedback weight adjustments
const ACCEPT_BOOST = 0.15;   // Boost similar trend confidence by 15%
const REJECT_PENALTY = -0.1; // Reduce similar trend confidence by 10%
const DEFER_NEUTRAL = 0.0;   // No change for deferred

// ─── Data Fetching ─────────────────────────────────────────

async function fetchPendingRecommendations() {
  const { data, error } = await supabase
    .from('eva_consultant_recommendations')
    .select('id, recommendation_date, trend_id, recommendation_type, title, description, priority_score, action_type, application_domain')
    .eq('status', 'pending')
    .order('priority_score', { ascending: false });

  if (error) {
    console.error('Error fetching recommendations:', error.message);
    return [];
  }

  return data || [];
}

async function fetchRecommendationById(id) {
  const { data, error } = await supabase
    .from('eva_consultant_recommendations')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error(`Error fetching recommendation ${id}:`, error.message);
    return null;
  }

  return data;
}

// ─── Feedback Processing ──────────────────────────────────

async function processFeedback(recId, status, notes = null) {
  // 1. Update recommendation status
  const updateData = {
    status,
    chairman_feedback: notes,
    feedback_at: new Date().toISOString()
  };

  const { data: rec, error: fetchErr } = await supabase
    .from('eva_consultant_recommendations')
    .select('trend_id, application_domain, recommendation_type')
    .eq('id', recId)
    .single();

  if (fetchErr) {
    console.error(`Error fetching recommendation: ${fetchErr.message}`);
    return false;
  }

  const { error: updateErr } = await supabase
    .from('eva_consultant_recommendations')
    .update(updateData)
    .eq('id', recId);

  if (updateErr) {
    console.error(`Error updating recommendation: ${updateErr.message}`);
    return false;
  }

  console.log(`   ✅ Recommendation ${recId} → ${status}`);

  // 2. Apply feedback loop: adjust trend confidence weights
  if (rec.trend_id) {
    await adjustTrendWeight(rec.trend_id, status);
  }

  // 3. Boost/penalize similar trends in same domain
  if (rec.application_domain) {
    await adjustDomainWeights(rec.application_domain, rec.recommendation_type, status);
  }

  return true;
}

async function adjustTrendWeight(trendId, status) {
  const adjustment = status === 'accepted' ? ACCEPT_BOOST
    : status === 'rejected' ? REJECT_PENALTY
    : DEFER_NEUTRAL;

  if (adjustment === 0) return;

  // Fetch current weight
  const { data: trend, error: fetchErr } = await supabase
    .from('eva_consultant_trends')
    .select('feedback_weight')
    .eq('id', trendId)
    .single();

  if (fetchErr || !trend) return;

  const currentWeight = parseFloat(trend.feedback_weight) || 1.0;
  const newWeight = Math.round(Math.min(9.99, Math.max(0.01, currentWeight + adjustment)) * 100) / 100;

  const { error } = await supabase
    .from('eva_consultant_trends')
    .update({ feedback_weight: newWeight })
    .eq('id', trendId);

  if (error) {
    console.error(`   Error adjusting trend weight: ${error.message}`);
  } else {
    console.log(`   📈 Trend weight: ${currentWeight} → ${newWeight} (${adjustment > 0 ? '+' : ''}${adjustment})`);
  }
}

async function adjustDomainWeights(domain, recType, status) {
  if (status === 'deferred') return; // No domain-level adjustment for deferred

  const adjustment = status === 'accepted' ? ACCEPT_BOOST * 0.5 : REJECT_PENALTY * 0.5;

  // Find recent trends in same domain with same type pattern
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data: relatedTrends, error } = await supabase
    .from('eva_consultant_trends')
    .select('id, feedback_weight')
    .eq('application_domain', domain)
    .gte('trend_date', since.toISOString().slice(0, 10))
    .limit(10);

  if (error || !relatedTrends || relatedTrends.length === 0) return;

  let adjusted = 0;
  for (const trend of relatedTrends) {
    const currentWeight = parseFloat(trend.feedback_weight) || 1.0;
    const newWeight = Math.round(Math.min(9.99, Math.max(0.01, currentWeight + adjustment)) * 100) / 100;

    if (newWeight !== currentWeight) {
      await supabase
        .from('eva_consultant_trends')
        .update({ feedback_weight: newWeight })
        .eq('id', trend.id);
      adjusted++;
    }
  }

  if (adjusted > 0) {
    console.log(`   🔄 Adjusted ${adjusted} related trend(s) in domain "${domain}"`);
  }
}

// ─── CLI Processing ───────────────────────────────────────

async function showStatus() {
  const { data, error } = await supabase
    .from('eva_consultant_recommendations')
    .select('status')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  const counts = { pending: 0, accepted: 0, deferred: 0, rejected: 0 };
  for (const rec of data || []) {
    counts[rec.status] = (counts[rec.status] || 0) + 1;
  }

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  EVA Recommendation Status                             ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`   ⏳ Pending:  ${counts.pending}`);
  console.log(`   ✅ Accepted: ${counts.accepted}`);
  console.log(`   ⏸️  Deferred: ${counts.deferred}`);
  console.log(`   ❌ Rejected: ${counts.rejected}`);
}

async function showPending() {
  const pending = await fetchPendingRecommendations();

  if (pending.length === 0) {
    console.log('\n✅ No pending recommendations. Run recommendation-engine.mjs to generate new ones.');
    return;
  }

  console.log(`\n📋 ${pending.length} Pending Recommendations:\n`);

  for (const rec of pending) {
    const score = ((rec.priority_score || 0) * 100).toFixed(0);
    console.log(`  ┌─ ${rec.id}`);
    console.log(`  │  [${score}%] ${rec.recommendation_type} → ${rec.action_type}`);
    console.log(`  │  ${rec.title}`);
    console.log(`  │  ${rec.description || '(no description)'}`);
    console.log(`  │  Domain: ${rec.application_domain || 'unknown'}`);
    console.log(`  └─ Date: ${rec.recommendation_date}`);
    console.log();
  }

  console.log('Commands:');
  console.log('  node scripts/eva/recommendation-feedback.mjs --accept <id>');
  console.log('  node scripts/eva/recommendation-feedback.mjs --defer <id>');
  console.log('  node scripts/eva/recommendation-feedback.mjs --reject <id>');
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--status')) {
    await showStatus();
    return;
  }

  const acceptIdx = args.indexOf('--accept');
  if (acceptIdx >= 0 && args[acceptIdx + 1]) {
    const recId = args[acceptIdx + 1];
    const notes = args.slice(acceptIdx + 2).join(' ') || null;
    console.log(`Accepting recommendation ${recId}...`);
    await processFeedback(recId, 'accepted', notes);
    return;
  }

  const deferIdx = args.indexOf('--defer');
  if (deferIdx >= 0 && args[deferIdx + 1]) {
    const recId = args[deferIdx + 1];
    const notes = args.slice(deferIdx + 2).join(' ') || null;
    console.log(`Deferring recommendation ${recId}...`);
    await processFeedback(recId, 'deferred', notes);
    return;
  }

  const rejectIdx = args.indexOf('--reject');
  if (rejectIdx >= 0 && args[rejectIdx + 1]) {
    const recId = args[rejectIdx + 1];
    const notes = args.slice(rejectIdx + 2).join(' ') || null;
    console.log(`Rejecting recommendation ${recId}...`);
    await processFeedback(recId, 'rejected', notes);
    return;
  }

  // Default: show pending recommendations
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  EVA Recommendation Feedback — Phase 2                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  await showStatus();
  await showPending();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
