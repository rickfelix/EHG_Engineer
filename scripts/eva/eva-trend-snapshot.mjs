/**
 * EVA Trend Snapshot — Phase 0 Batch Aggregation
 * SD: SD-LEO-INFRA-CONSULTANT-AGENT-PHASE-001
 *
 * Queries classified items from eva_todoist_intake and eva_youtube_intake,
 * aggregates counts by target_application, target_aspects, chairman_intent
 * per week, calculates item velocity (current week vs rolling 4-week average),
 * and updates eva_source_health from eva_sync_state data.
 *
 * No LLM required — pure SQL/JS aggregation.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Helpers ───────────────────────────────────────────────

/** Get ISO week string (YYYY-WNN) for a date */
function getWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + yearStart.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** Get the Monday of the current ISO week */
function getCurrentWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// ─── Data Fetching ─────────────────────────────────────────

async function fetchClassifiedItems() {
  const sources = [
    { table: 'eva_todoist_intake', source: 'todoist' },
    { table: 'eva_youtube_intake', source: 'youtube' }
  ];

  const items = [];

  for (const { table, source } of sources) {
    const { data, error } = await supabase
      .from(table)
      .select('target_application, target_aspects, chairman_intent, classified_at')
      .not('classified_at', 'is', null);

    if (error) {
      console.error(`Error querying ${table}:`, error.message);
      continue;
    }

    for (const row of data || []) {
      items.push({ ...row, source });
    }
  }

  return items;
}

// ─── Aggregation ───────────────────────────────────────────

function aggregateItems(items) {
  // Source counts per week
  const sourceCounts = {};
  // Aspects per application
  const aspectsByApp = {};
  // Intent distribution
  const intentCounts = {};
  // Weekly totals for velocity
  const weeklyTotals = {};

  for (const item of items) {
    const week = getWeekKey(item.classified_at);
    const app = item.target_application || 'unclassified';
    const intent = item.chairman_intent || 'unknown';
    const aspects = item.target_aspects || [];

    // Source counts: { "2025-W10": { todoist: 5, youtube: 3 } }
    if (!sourceCounts[week]) sourceCounts[week] = {};
    sourceCounts[week][item.source] = (sourceCounts[week][item.source] || 0) + 1;

    // Weekly totals for velocity
    weeklyTotals[week] = (weeklyTotals[week] || 0) + 1;

    // Aspects by app: { "ehg_engineer": { "ui": 5, "api": 3 } }
    if (!aspectsByApp[app]) aspectsByApp[app] = {};
    for (const aspect of aspects) {
      aspectsByApp[app][aspect] = (aspectsByApp[app][aspect] || 0) + 1;
    }

    // Intent counts: { "idea": 15, "insight": 8 }
    intentCounts[intent] = (intentCounts[intent] || 0) + 1;
  }

  // Sort aspects by count within each app (top 10)
  const topAspectsByApp = {};
  for (const [app, aspects] of Object.entries(aspectsByApp)) {
    const sorted = Object.entries(aspects)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    topAspectsByApp[app] = Object.fromEntries(sorted);
  }

  // Sort intents by count
  const topIntents = Object.entries(intentCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([intent, count]) => ({ intent, count }));

  return { sourceCounts, topAspectsByApp, topIntents, weeklyTotals };
}

// ─── Velocity Calculation ──────────────────────────────────

function calculateVelocity(weeklyTotals) {
  const weeks = Object.keys(weeklyTotals).sort();
  if (weeks.length === 0) {
    return { current_week: null, rolling_4wk_avg: 0, change_pct: 0, trend: 'no_data' };
  }

  const currentWeekKey = getWeekKey(new Date());
  const currentCount = weeklyTotals[currentWeekKey] || 0;

  // Get prior 4 weeks (excluding current)
  const priorWeeks = weeks
    .filter(w => w < currentWeekKey)
    .slice(-4);

  const priorSum = priorWeeks.reduce((sum, w) => sum + (weeklyTotals[w] || 0), 0);
  const priorAvg = priorWeeks.length > 0 ? priorSum / priorWeeks.length : 0;

  const changePct = priorAvg > 0
    ? Math.round(((currentCount - priorAvg) / priorAvg) * 100)
    : 0;

  let trend = 'stable';
  if (changePct > 20) trend = 'accelerating';
  else if (changePct < -20) trend = 'decelerating';

  return {
    current_week: currentWeekKey,
    current_count: currentCount,
    rolling_4wk_avg: Math.round(priorAvg * 10) / 10,
    prior_weeks: priorWeeks.length,
    change_pct: changePct,
    trend,
    weekly_breakdown: weeklyTotals
  };
}

// ─── Source Health ──────────────────────────────────────────

async function updateSourceHealth() {
  const STALE_THRESHOLD_HOURS = 72;

  // Query eva_sync_state for known sources
  const { data: syncStates, error } = await supabase
    .from('eva_sync_state')
    .select('source_type, source_identifier, last_sync_at, total_synced, consecutive_failures');

  if (error) {
    console.error('Error querying eva_sync_state:', error.message);
    return [];
  }

  const healthRecords = [];
  const now = new Date();

  for (const sync of syncStates || []) {
    const lastSync = sync.last_sync_at ? new Date(sync.last_sync_at) : null;
    const hoursSinceSync = lastSync
      ? (now - lastSync) / (1000 * 60 * 60)
      : Infinity;

    let status = 'healthy';
    let degradedSince = null;

    if (!lastSync || hoursSinceSync > STALE_THRESHOLD_HOURS) {
      status = 'stale';
      degradedSince = lastSync
        ? new Date(lastSync.getTime() + STALE_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString()
        : now.toISOString();
    } else if (sync.consecutive_failures > 0) {
      status = 'degraded';
      degradedSince = now.toISOString();
    }

    healthRecords.push({
      source_name: `${sync.source_type}:${sync.source_identifier}`,
      last_sync_at: sync.last_sync_at,
      last_item_count: sync.total_synced || 0,
      status,
      degraded_since: degradedSince
    });
  }

  // Upsert health records
  for (const record of healthRecords) {
    const { error: upsertErr } = await supabase
      .from('eva_source_health')
      .upsert(record, { onConflict: 'source_name' });

    if (upsertErr) {
      console.error(`Error upserting health for ${record.source_name}:`, upsertErr.message);
    }
  }

  return healthRecords;
}

// ─── Snapshot Persistence ──────────────────────────────────

async function saveSnapshot(sourceCounts, topAspectsByApp, topIntents, velocity, rawItems) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const snapshot = {
    snapshot_date: today,
    source_counts: sourceCounts,
    top_aspects_by_app: topAspectsByApp,
    top_intents: topIntents,
    new_item_velocity: velocity,
    raw_cluster_data: {
      total_items: rawItems.length,
      sources: {
        todoist: rawItems.filter(i => i.source === 'todoist').length,
        youtube: rawItems.filter(i => i.source === 'youtube').length
      },
      generated_at: new Date().toISOString()
    }
  };

  const { data, error } = await supabase
    .from('eva_consultant_snapshots')
    .upsert(snapshot, { onConflict: 'snapshot_date' })
    .select('id, snapshot_date');

  if (error) {
    console.error('Error saving snapshot:', error.message);
    return null;
  }

  return data?.[0];
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  EVA Trend Snapshot — Phase 0 Batch Aggregation         ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  // 1. Fetch classified items
  console.log('📥 Fetching classified items...');
  const items = await fetchClassifiedItems();
  console.log(`   Found ${items.length} classified items (${items.filter(i => i.source === 'todoist').length} Todoist, ${items.filter(i => i.source === 'youtube').length} YouTube)`);

  if (items.length === 0) {
    console.log('\n⚠️  No classified items found. Snapshot will have zero counts.');
  }

  // 2. Aggregate
  console.log('\n📊 Aggregating by application, aspects, intent, week...');
  const { sourceCounts, topAspectsByApp, topIntents, weeklyTotals } = aggregateItems(items);

  const weekCount = Object.keys(weeklyTotals).length;
  const appCount = Object.keys(topAspectsByApp).length;
  console.log(`   ${weekCount} weeks of data across ${appCount} applications`);

  // 3. Calculate velocity
  console.log('\n📈 Calculating item velocity...');
  const velocity = calculateVelocity(weeklyTotals);
  console.log(`   Current week (${velocity.current_week}): ${velocity.current_count} items`);
  console.log(`   Rolling 4-week avg: ${velocity.rolling_4wk_avg} items`);
  console.log(`   Trend: ${velocity.trend} (${velocity.change_pct > 0 ? '+' : ''}${velocity.change_pct}%)`);

  // 4. Update source health
  console.log('\n🏥 Updating source health...');
  const healthRecords = await updateSourceHealth();
  for (const h of healthRecords) {
    const icon = h.status === 'healthy' ? '✅' : h.status === 'degraded' ? '⚠️' : '❌';
    console.log(`   ${icon} ${h.source_name}: ${h.status}`);
  }

  // 5. Save snapshot
  console.log('\n💾 Saving snapshot...');
  const saved = await saveSnapshot(sourceCounts, topAspectsByApp, topIntents, velocity, items);

  if (saved) {
    console.log(`   ✅ Snapshot saved: ${saved.snapshot_date} (id: ${saved.id})`);
  } else {
    console.log('   ❌ Failed to save snapshot');
    process.exit(1);
  }

  // 6. Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Top Intents:');
  for (const { intent, count } of topIntents.slice(0, 5)) {
    console.log(`    ${intent}: ${count}`);
  }

  console.log('\n  Top Aspects by App:');
  for (const [app, aspects] of Object.entries(topAspectsByApp)) {
    const top3 = Object.entries(aspects).slice(0, 3).map(([a, c]) => `${a}(${c})`).join(', ');
    console.log(`    ${app}: ${top3}`);
  }
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n✅ Trend snapshot complete.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
