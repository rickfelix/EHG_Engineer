/**
 * EVA Recommendation Engine — Phase 2 LLM-Assisted Recommendation Generation
 * SD: SD-LEO-INFRA-CONSULTANT-AGENT-PHASE-003
 *
 * Reads detected trends from Phase 1, generates actionable recommendations
 * via LLM batch prompts, and stores them with priority scores.
 * Incorporates feedback history to boost/reduce priority of similar patterns.
 *
 * Cost target: <$0.10 per run using Haiku-tier model.
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { getClassificationClient } from '../../lib/llm/client-factory.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createSupabaseServiceClient();

const MIN_CONFIDENCE = 0.4; // Only recommend from trends above this confidence
const MAX_TRENDS_PER_BATCH = 10; // Keep batches small for local LLM
const LLM_TIMEOUT_MS = 180000; // 3 minutes for local models

// ─── Data Fetching ─────────────────────────────────────────

async function fetchRecentTrends() {
  const { data, error } = await supabase
    .from('eva_consultant_trends')
    .select('id, trend_date, trend_type, title, description, confidence_score, corroborating_items, application_domain, feedback_weight')
    .gte('confidence_score', MIN_CONFIDENCE)
    .order('confidence_score', { ascending: false })
    .limit(MAX_TRENDS_PER_BATCH);

  if (error) {
    console.error('Error fetching trends:', error.message);
    return [];
  }
  return data || [];
}

async function fetchFeedbackHistory() {
  const { data, error } = await supabase
    .from('eva_consultant_recommendations')
    .select('application_domain, status, recommendation_type')
    .in('status', ['accepted', 'rejected']);

  if (error) {
    console.error('Error fetching feedback history:', error.message);
    return { accepted: {}, rejected: {} };
  }

  const history = { accepted: {}, rejected: {} };
  for (const row of data || []) {
    const domain = row.application_domain || 'unknown';
    if (row.status === 'accepted') {
      history.accepted[domain] = (history.accepted[domain] || 0) + 1;
    } else if (row.status === 'rejected') {
      history.rejected[domain] = (history.rejected[domain] || 0) + 1;
    }
  }
  return history;
}

// ─── LLM Recommendation Generation ────────────────────────

function buildRecommendationPrompt(trends) {
  const trendSummaries = trends.map((t, i) => {
    const items = (t.corroborating_items || []).length;
    return `${i + 1}. [${t.application_domain}] "${t.title}" (${t.trend_type}, confidence: ${t.confidence_score}, ${items} corroborating items)\n   ${t.description}`;
  }).join('\n');

  return `Based on these ${trends.length} detected trends, generate 1-3 actionable recommendations per trend (max 10 total).

Trends:
${trendSummaries}

For each recommendation, provide:
- trend_index: which trend number (1-indexed) this recommendation addresses
- recommendation_type: one of "strategic" (long-term direction), "tactical" (near-term action), "research" (needs investigation), "operational" (process change)
- title: concise recommendation name (max 100 chars)
- description: 1-3 sentence explanation of what to do and why
- action_type: one of "create_sd" (create a strategic directive), "research" (investigate further), "review" (schedule review), "defer" (note for later), "discuss" (bring to next meeting)
- priority: 0.0-1.0 based on urgency and potential impact

Focus on actionable, specific recommendations. Avoid vague suggestions like "continue monitoring" or "keep doing what you're doing."

Respond with ONLY valid JSON:
{
  "recommendations": [
    {
      "trend_index": 1,
      "recommendation_type": "strategic",
      "title": "Example recommendation",
      "description": "Specific action to take...",
      "action_type": "create_sd",
      "priority": 0.85
    }
  ]
}`;
}

async function generateRecommendations(trends) {
  if (trends.length === 0) {
    console.log('   No trends to process');
    return [];
  }

  const client = await getClassificationClient();
  const prompt = buildRecommendationPrompt(trends);

  let timeoutId;
  try {
    const response = await Promise.race([
      client.complete(
        'You are a strategic business advisor. Generate specific, actionable recommendations from detected trends. Respond with only valid JSON.',
        prompt,
        { maxTokens: 4096, timeout: LLM_TIMEOUT_MS }
      ),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('LLM timeout')), LLM_TIMEOUT_MS + 10000);
        if (timeoutId.unref) timeoutId.unref();
      })
    ]);
    clearTimeout(timeoutId);

    const text = typeof response === 'string' ? response : response?.content;
    return parseRecommendationResponse(text, trends);
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`   LLM error: ${err.message}`);
    return [];
  }
}

function parseRecommendationResponse(text, trends) {
  if (!text) return [];

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('   Failed to parse JSON from LLM response');
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const recs = parsed.recommendations || [];

    return recs
      .filter(rec => rec.trend_index >= 1 && rec.trend_index <= trends.length)
      .map(rec => {
        const trend = trends[rec.trend_index - 1];
        return {
          trend_id: trend.id,
          recommendation_type: rec.recommendation_type,
          title: rec.title,
          description: rec.description,
          action_type: rec.action_type,
          priority_base: rec.priority || 0.5,
          application_domain: trend.application_domain
        };
      });
  } catch (err) {
    console.error(`   JSON parse error: ${err.message}`);
    return [];
  }
}

// ─── Priority Adjustment ──────────────────────────────────

function adjustPriority(rec, feedbackHistory, trend) {
  let priority = rec.priority_base;

  // Boost for trends with high feedback_weight (previously accepted)
  const feedbackWeight = trend?.feedback_weight || 1.0;
  if (feedbackWeight > 1.0) priority = Math.min(1, priority + 0.05);
  else if (feedbackWeight < 0.8) priority = Math.max(0, priority - 0.1);

  // Boost for domains with historically accepted recommendations
  const domain = rec.application_domain || 'unknown';
  const acceptedCount = feedbackHistory.accepted[domain] || 0;
  const rejectedCount = feedbackHistory.rejected[domain] || 0;

  if (acceptedCount > rejectedCount) priority = Math.min(1, priority + 0.05);
  else if (rejectedCount > acceptedCount * 2) priority = Math.max(0, priority - 0.1);

  // Boost for "create_sd" actions (most actionable)
  if (rec.action_type === 'create_sd') priority = Math.min(1, priority + 0.05);

  return Math.round(priority * 100) / 100;
}

// ─── Persistence ───────────────────────────────────────────

async function saveRecommendations(recommendations) {
  const today = new Date().toISOString().slice(0, 10);
  let saved = 0;

  for (const rec of recommendations) {
    const record = {
      recommendation_date: today,
      trend_id: rec.trend_id,
      recommendation_type: rec.recommendation_type,
      title: rec.title,
      description: rec.description,
      priority_score: rec.priority,
      action_type: rec.action_type,
      application_domain: rec.application_domain,
      status: 'pending'
    };

    const { error } = await supabase
      .from('eva_consultant_recommendations')
      .upsert(record, { onConflict: 'recommendation_date,title' });

    if (error) {
      console.error(`   Error saving "${rec.title}": ${error.message}`);
    } else {
      saved++;
    }
  }

  return saved;
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  EVA Recommendation Engine — Phase 2                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  // 1. Fetch trends
  console.log(`📊 Fetching trends (confidence >= ${MIN_CONFIDENCE})...`);
  const trends = await fetchRecentTrends();
  console.log(`   Found ${trends.length} trends`);

  if (trends.length === 0) {
    console.log('\n⚠️  No qualifying trends found. Run trend-detector.mjs first.');
    return;
  }

  // 2. Fetch feedback history
  console.log('\n📋 Loading feedback history...');
  const feedbackHistory = await fetchFeedbackHistory();
  const totalAccepted = Object.values(feedbackHistory.accepted).reduce((a, b) => a + b, 0);
  const totalRejected = Object.values(feedbackHistory.rejected).reduce((a, b) => a + b, 0);
  console.log(`   ${totalAccepted} accepted, ${totalRejected} rejected historically`);

  // 3. Generate recommendations via LLM
  console.log('\n🤖 Generating recommendations...');
  const rawRecs = await generateRecommendations(trends);
  console.log(`   LLM produced ${rawRecs.length} recommendations`);

  if (rawRecs.length === 0) {
    console.log('\n⚠️  No recommendations generated.');
    return;
  }

  // 4. Adjust priorities
  for (const rec of rawRecs) {
    const trend = trends.find(t => t.id === rec.trend_id);
    rec.priority = adjustPriority(rec, feedbackHistory, trend);
  }

  // 5. Save
  console.log(`\n💾 Saving ${rawRecs.length} recommendations...`);
  const saved = await saveRecommendations(rawRecs);
  console.log(`   ✅ ${saved}/${rawRecs.length} recommendations saved`);

  // 6. Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Recommendations:');
  for (const rec of rawRecs.sort((a, b) => b.priority - a.priority)) {
    const prio = (rec.priority * 100).toFixed(0);
    console.log(`    [${prio}%] ${rec.recommendation_type}: ${rec.title}`);
    console.log(`         Action: ${rec.action_type} | Domain: ${rec.application_domain}`);
    console.log(`         ${rec.description}`);
  }
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n✅ Recommendation generation complete.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
