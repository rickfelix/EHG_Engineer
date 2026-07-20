/**
 * EVA Chairman Digest — Phase 3 Strategic Brief Generator
 * SD: SD-LEO-INFRA-CONSULTANT-AGENT-PHASE-004
 *
 * Synthesizes data from all pipeline phases into a concise strategic brief:
 * - Phase 0: Snapshots (item velocity, source counts)
 * - Phase 1: Trends (convergence, acceleration, gaps)
 * - Phase 2: Recommendations (pending, accepted, rejected)
 * - Source Health: Data freshness status
 *
 * Output is stored in eva_consultant_digests for historical tracking.
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import dotenv from 'dotenv';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: recommendations accumulate
// indefinitely -- an un-paginated read here silently drops recommendations past the
// PostgREST 1000-row cap from the digest.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

dotenv.config();

const supabase = createSupabaseServiceClient();

// ─── Data Fetching ─────────────────────────────────────────

async function fetchLatestSnapshot() {
  const { data, error } = await supabase
    .from('eva_consultant_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.log('   No snapshots found (Phase 0 may not have run yet)');
    return null;
  }
  return data;
}

async function fetchRecentTrends() {
  const { data, error } = await supabase
    .from('eva_consultant_trends')
    .select('*')
    .order('confidence_score', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching trends:', error.message);
    return [];
  }
  return data || [];
}

async function fetchRecommendations() {
  try {
    return await fetchAllPaginated(() => supabase
      .from('eva_consultant_recommendations')
      .select('*')
      .order('priority_score', { ascending: false })
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
  } catch (error) {
    console.error('Error fetching recommendations:', error.message);
    return [];
  }
}

async function fetchSourceHealth() {
  const { data, error } = await supabase
    .from('eva_source_health')
    .select('source_name, status, last_sync_at');

  if (error) {
    console.error('Error fetching source health:', error.message);
    return [];
  }
  return data || [];
}

async function fetchClassifiedItemCount() {
  let total = 0;
  for (const table of ['eva_todoist_intake', 'eva_youtube_intake']) {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .not('classified_at', 'is', null);

    if (!error) total += count || 0;
  }
  return total;
}

// ─── Digest Construction ──────────────────────────────────

function buildDigest(snapshot, trends, recommendations, sourceHealth, classifiedCount) {
  const pending = recommendations.filter(r => r.status === 'pending');
  const accepted = recommendations.filter(r => r.status === 'accepted');
  const rejected = recommendations.filter(r => r.status === 'rejected');
  const deferred = recommendations.filter(r => r.status === 'deferred');

  const topTrends = trends.slice(0, 5).map(t => ({
    title: t.title,
    type: t.trend_type,
    confidence: t.confidence_score,
    domain: t.application_domain,
    description: t.description
  }));

  const actionItems = pending.slice(0, 5).map(r => ({
    title: r.title,
    type: r.recommendation_type,
    action: r.action_type,
    priority: r.priority_score,
    domain: r.application_domain
  }));

  const healthSummary = {};
  let healthyCount = 0;
  let degradedCount = 0;
  let staleCount = 0;
  for (const source of sourceHealth) {
    healthSummary[source.source_name] = {
      status: source.status,
      last_sync: source.last_sync_at
    };
    if (source.status === 'healthy') healthyCount++;
    else if (source.status === 'degraded') degradedCount++;
    else staleCount++;
  }

  const metrics = {
    total_classified_items: classifiedCount,
    trends_detected: trends.length,
    recommendations_total: recommendations.length,
    recommendations_pending: pending.length,
    recommendations_accepted: accepted.length,
    recommendations_rejected: rejected.length,
    recommendations_deferred: deferred.length,
    acceptance_rate: recommendations.length > 0
      ? Math.round((accepted.length / recommendations.length) * 100) : 0,
    sources_healthy: healthyCount,
    sources_degraded: degradedCount,
    sources_stale: staleCount,
    snapshot_date: snapshot?.snapshot_date || null
  };

  const content = {
    generated_at: new Date().toISOString(),
    executive_summary: buildExecutiveSummary(metrics, topTrends),
    top_trends: topTrends,
    action_items: actionItems,
    accepted_actions: accepted.map(r => ({
      title: r.title,
      action: r.action_type,
      feedback: r.chairman_feedback,
      accepted_at: r.feedback_at
    })),
    pipeline_metrics: metrics,
    velocity: snapshot?.new_item_velocity || null
  };

  return { content, metrics, healthSummary };
}

function buildExecutiveSummary(metrics, topTrends) {
  const parts = [];

  parts.push(`Pipeline processed ${metrics.total_classified_items} classified items, detecting ${metrics.trends_detected} trends and generating ${metrics.recommendations_total} recommendations.`);

  if (metrics.recommendations_accepted > 0) {
    parts.push(`${metrics.recommendations_accepted} recommendation(s) accepted (${metrics.acceptance_rate}% rate).`);
  }

  if (metrics.recommendations_pending > 0) {
    parts.push(`${metrics.recommendations_pending} recommendation(s) awaiting review.`);
  }

  if (metrics.sources_stale > 0) {
    parts.push(`Warning: ${metrics.sources_stale} data source(s) are stale — trend confidence may be reduced.`);
  }

  if (topTrends.length > 0) {
    const topTrend = topTrends[0];
    parts.push(`Top trend: "${topTrend.title}" (${topTrend.type}, ${(topTrend.confidence * 100).toFixed(0)}% confidence).`);
  }

  return parts.join(' ');
}

// ─── Persistence ───────────────────────────────────────────

async function saveDigest(content, metrics, healthSummary) {
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase
    .from('eva_consultant_digests')
    .upsert({
      digest_date: today,
      content,
      metrics,
      source_health_summary: healthSummary
    }, { onConflict: 'digest_date' });

  if (error) {
    console.error('Error saving digest:', error.message);
    return false;
  }
  return true;
}

// ─── Display ───────────────────────────────────────────────

function displayDigest(content, metrics) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║           CHAIRMAN STRATEGIC DIGEST                    ║');
  console.log('║           ' + new Date().toISOString().slice(0, 10) + '                                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  console.log('\n📋 EXECUTIVE SUMMARY');
  console.log('   ' + content.executive_summary);

  if (content.top_trends.length > 0) {
    console.log('\n📊 TOP TRENDS');
    for (const t of content.top_trends) {
      const conf = (t.confidence * 100).toFixed(0);
      console.log(`   [${conf}%] ${t.type}: ${t.title}`);
      console.log(`         Domain: ${t.domain}`);
    }
  }

  if (content.action_items.length > 0) {
    console.log('\n🎯 ACTION ITEMS (Pending Review)');
    for (const a of content.action_items) {
      const prio = (a.priority * 100).toFixed(0);
      console.log(`   [${prio}%] ${a.title}`);
      console.log(`         Action: ${a.action} | Type: ${a.type} | Domain: ${a.domain}`);
    }
  }

  if (content.accepted_actions.length > 0) {
    console.log('\n✅ ACCEPTED ACTIONS');
    for (const a of content.accepted_actions) {
      console.log(`   ${a.title} (${a.action})`);
      if (a.feedback) console.log(`   Notes: ${a.feedback}`);
    }
  }

  console.log('\n📈 PIPELINE METRICS');
  console.log(`   Items classified: ${metrics.total_classified_items}`);
  console.log(`   Trends detected: ${metrics.trends_detected}`);
  console.log(`   Recommendations: ${metrics.recommendations_total} (${metrics.recommendations_pending} pending, ${metrics.recommendations_accepted} accepted, ${metrics.recommendations_rejected} rejected)`);
  console.log(`   Acceptance rate: ${metrics.acceptance_rate}%`);
  console.log(`   Source health: ${metrics.sources_healthy} healthy, ${metrics.sources_degraded} degraded, ${metrics.sources_stale} stale`);
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  EVA Chairman Digest Generator — Phase 3               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  // Fetch all pipeline data
  console.log('📥 Fetching pipeline data...');
  const [snapshot, trends, recommendations, sourceHealth, classifiedCount] = await Promise.all([
    fetchLatestSnapshot(),
    fetchRecentTrends(),
    fetchRecommendations(),
    fetchSourceHealth(),
    fetchClassifiedItemCount()
  ]);

  console.log(`   Snapshot: ${snapshot ? snapshot.snapshot_date : 'none'}`);
  console.log(`   Trends: ${trends.length}`);
  console.log(`   Recommendations: ${recommendations.length}`);
  console.log(`   Sources: ${sourceHealth.length}`);
  console.log(`   Classified items: ${classifiedCount}`);

  // Build digest
  console.log('\n🔨 Building digest...');
  const { content, metrics, healthSummary } = buildDigest(
    snapshot, trends, recommendations, sourceHealth, classifiedCount
  );

  // Save
  console.log('\n💾 Saving digest...');
  const saved = await saveDigest(content, metrics, healthSummary);
  if (saved) console.log('   ✅ Digest saved');

  // Display
  displayDigest(content, metrics);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ Chairman digest generation complete.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
