/**
 * EVA Recommendation Engine — Phase 2 Trend-to-Recommendation Pipeline
 * SD: SD-LEO-INFRA-CONSULTANT-AGENT-PHASE-003
 *
 * Reads recent trends from eva_consultant_trends, uses LLM to generate
 * prioritized recommendations (create_sd, research, review, defer, discuss),
 * and stores them in eva_consultant_recommendations.
 *
 * Priority scoring combines trend confidence with domain relevance
 * and historical feedback patterns (feedback_weight from trends table).
 */

import { createClient } from '@supabase/supabase-js';
import { getClassificationClient } from '../../lib/llm/client-factory.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TREND_WINDOW_DAYS = 14;
const MIN_CONFIDENCE = 0.3;
const LLM_TIMEOUT_MS = 120000;
const MAX_TRENDS_PER_BATCH = 20;

// ─── Data Fetching ─────────────────────────────────────────

async function fetchRecentTrends(windowDays = TREND_WINDOW_DAYS) {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const { data, error } = await supabase
    .from('eva_consultant_trends')
    .select('id, trend_date, trend_type, title, description, confidence_score, corroborating_items, application_domain, feedback_weight')
    .gte('trend_date', since.toISOString().slice(0, 10))
    .gte('confidence_score', MIN_CONFIDENCE)
    .order('confidence_score', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching trends:', error.message);
    return [];
  }

  return data || [];
}

async function fetchExistingRecommendations(today) {
  const { data, error } = await supabase
    .from('eva_consultant_recommendations')
    .select('trend_id, title')
    .eq('recommendation_date', today);

  if (error) {
    console.error('Error fetching existing recommendations:', error.message);
    return [];
  }

  return data || [];
}

async function fetchFeedbackHistory() {
  const { data, error } = await supabase
    .from('eva_consultant_recommendations')
    .select('recommendation_type, action_type, status, application_domain')
    .in('status', ['accepted', 'deferred', 'rejected'])
    .order('feedback_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching feedback history:', error.message);
    return [];
  }

  return data || [];
}

// ─── Priority Scoring ─────────────────────────────────────

function computePriorityScore(trend, feedbackHistory) {
  // Base: trend confidence (0-1)
  let score = parseFloat(trend.confidence_score) || 0.5;

  // Boost from feedback_weight (default 1.0, boosted by past accepted feedback)
  const feedbackWeight = parseFloat(trend.feedback_weight) || 1.0;
  score *= feedbackWeight;

  // Domain relevance boost: domains with historically accepted recommendations score higher
  const domainAccepted = feedbackHistory.filter(
    f => f.application_domain === trend.application_domain && f.status === 'accepted'
  ).length;
  const domainTotal = feedbackHistory.filter(
    f => f.application_domain === trend.application_domain
  ).length;

  if (domainTotal > 0) {
    const acceptanceRate = domainAccepted / domainTotal;
    score *= (0.8 + 0.4 * acceptanceRate); // 0.8x to 1.2x multiplier
  }

  // Trend type boost: gaps and emerging trends are more actionable
  const typeBoost = {
    gap: 1.15,
    emerging: 1.1,
    acceleration: 1.05,
    convergence: 1.0,
    decline: 0.9
  };
  score *= (typeBoost[trend.trend_type] || 1.0);

  // Corroboration boost: more supporting items = higher priority
  const itemCount = (trend.corroborating_items || []).length;
  if (itemCount >= 5) score *= 1.1;
  else if (itemCount >= 3) score *= 1.05;

  // Clamp to 0-1
  return Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;
}

// ─── LLM Recommendation Generation ───────────────────────

function buildRecommendationPrompt(trends) {
  const trendSummaries = trends.map((t, i) => {
    const items = (t.corroborating_items || []).length;
    return `${i + 1}. [${t.trend_type}] "${t.title}" (confidence: ${t.confidence_score}, domain: ${t.application_domain}, ${items} corroborating items)\n   ${t.description}`;
  }).join('\n');

  return `You are a strategic consultant for a multi-venture AI-powered company. Analyze these detected trends and generate actionable recommendations.

Trends:
${trendSummaries}

For each trend, generate ONE recommendation with:
- recommendation_type: "strategic" (long-term initiative), "tactical" (short-term action), "research" (investigation needed), or "operational" (process improvement)
- title: concise recommendation title (max 100 chars)
- description: 1-3 sentence explanation of what to do and why
- action_type: "create_sd" (create a strategic directive), "research" (investigate further), "review" (schedule a review), "defer" (monitor but not act), or "discuss" (needs chairman discussion)

Respond with ONLY valid JSON:
{
  "recommendations": [
    {
      "trend_index": 1,
      "recommendation_type": "strategic",
      "title": "Example recommendation",
      "description": "What to do and why...",
      "action_type": "create_sd"
    }
  ]
}`;
}

async function generateRecommendationsFromLLM(trends) {
  if (trends.length === 0) return [];

  const client = await getClassificationClient();
  const prompt = buildRecommendationPrompt(trends.slice(0, MAX_TRENDS_PER_BATCH));

  let timeoutId;
  try {
    const response = await Promise.race([
      client.complete(
        'You are a strategic consultant analyzing business trends. Generate actionable recommendations. Respond with only valid JSON.',
        prompt,
        { maxTokens: 4096 }
      ),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('LLM timeout')), LLM_TIMEOUT_MS);
        if (timeoutId.unref) timeoutId.unref();
      })
    ]);
    clearTimeout(timeoutId);

    const text = typeof response === 'string' ? response : response?.content;
    return parseRecommendationResponse(text, trends);
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`LLM error: ${err.message}`);
    return [];
  }
}

function parseRecommendationResponse(text, trends) {
  if (!text) return [];

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('Failed to parse JSON from LLM response');
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
          trend,
          recommendation_type: rec.recommendation_type,
          title: rec.title,
          description: rec.description,
          action_type: rec.action_type
        };
      });
  } catch (err) {
    console.error(`JSON parse error: ${err.message}`);
    return [];
  }
}

// ─── Persistence ───────────────────────────────────────────

async function saveRecommendations(recommendations, today) {
  let saved = 0;

  for (const rec of recommendations) {
    const record = {
      recommendation_date: today,
      trend_id: rec.trend_id,
      recommendation_type: rec.recommendation_type,
      title: rec.title,
      description: rec.description,
      priority_score: rec.priority_score,
      action_type: rec.action_type,
      status: 'pending',
      application_domain: rec.trend.application_domain
    };

    const { error } = await supabase
      .from('eva_consultant_recommendations')
      .upsert(record, { onConflict: 'recommendation_date,title' });

    if (error) {
      console.error(`Error saving "${rec.title}": ${error.message}`);
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

  const today = new Date().toISOString().slice(0, 10);

  // 1. Fetch recent trends
  console.log(`📊 Fetching trends (last ${TREND_WINDOW_DAYS} days, confidence >= ${MIN_CONFIDENCE})...`);
  const trends = await fetchRecentTrends();
  console.log(`   Found ${trends.length} qualifying trends`);

  if (trends.length === 0) {
    console.log('\n⚠️  No qualifying trends. Run trend-detector.mjs first.');
    return;
  }

  // 2. Check for already-generated recommendations today
  const existing = await fetchExistingRecommendations(today);
  const existingTrendIds = new Set(existing.map(r => r.trend_id));
  const newTrends = trends.filter(t => !existingTrendIds.has(t.id));

  console.log(`   Already generated: ${existing.length} for today`);
  console.log(`   New trends to process: ${newTrends.length}`);

  if (newTrends.length === 0) {
    console.log('\n✅ All trends already have recommendations for today.');
    return;
  }

  // 3. Fetch feedback history for priority scoring
  console.log('\n📋 Loading feedback history...');
  const feedbackHistory = await fetchFeedbackHistory();
  console.log(`   ${feedbackHistory.length} historical feedback records`);

  // 4. Generate recommendations via LLM
  console.log('\n🤖 Generating recommendations...');
  const recommendations = await generateRecommendationsFromLLM(newTrends);
  console.log(`   Generated ${recommendations.length} recommendations`);

  if (recommendations.length === 0) {
    console.log('\n⚠️  No recommendations generated. Check LLM connectivity.');
    return;
  }

  // 5. Compute priority scores
  console.log('\n📊 Computing priority scores...');
  for (const rec of recommendations) {
    rec.priority_score = computePriorityScore(rec.trend, feedbackHistory);
  }

  // Sort by priority
  recommendations.sort((a, b) => b.priority_score - a.priority_score);

  // 6. Save
  console.log(`\n💾 Saving ${recommendations.length} recommendations...`);
  const saved = await saveRecommendations(recommendations, today);
  console.log(`   ✅ ${saved}/${recommendations.length} saved`);

  // 7. Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Recommendations:');
  for (const rec of recommendations) {
    const score = (rec.priority_score * 100).toFixed(0);
    console.log(`    [${score}%] ${rec.recommendation_type} → ${rec.action_type}`);
    console.log(`         ${rec.title}`);
    console.log(`         ${rec.description}`);
  }
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n✅ Recommendation engine complete.');
  console.log('   Run recommendation-feedback.mjs to review and accept/defer/reject.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
