/**
 * EVA Trend Detector — Phase 1 LLM-Assisted Pattern Detection
 * SD: SD-LEO-INFRA-CONSULTANT-AGENT-PHASE-002
 *
 * Processes classified intake items through Haiku batch prompts to identify
 * cross-source patterns. Each detected trend includes a confidence score
 * based on corroborating signals and source freshness.
 *
 * Batch prompt pattern follows wave-clusterer.js: one prompt per application
 * domain, not per item. Cost target: <$0.10 per run using Haiku.
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { getClassificationClient } from '../../lib/llm/client-factory.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createSupabaseServiceClient();

const WINDOW_DAYS = 14; // Look back 14 days (expand from 7 if few items)
const MIN_ITEMS_FOR_LLM = 3; // Don't run LLM with fewer items
const MAX_ITEMS_PER_BATCH = 50; // Cap per-batch to keep prompts manageable
const LLM_TIMEOUT_MS = 120000; // 2 minutes — local models need more time

// ─── Data Fetching ─────────────────────────────────────────

async function fetchRecentClassifiedItems(windowDays = WINDOW_DAYS) {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);
  const sinceISO = since.toISOString();

  const sources = [
    { table: 'eva_todoist_intake', source: 'todoist' },
    { table: 'eva_youtube_intake', source: 'youtube' }
  ];

  const items = [];

  for (const { table, source } of sources) {
    const { data, error } = await supabase
      .from(table)
      .select('id, title, description, target_application, target_aspects, chairman_intent, classified_at')
      .not('classified_at', 'is', null)
      .gte('classified_at', sinceISO)
      .order('classified_at', { ascending: false })
      .limit(200);

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

async function fetchSourceHealth() {
  const { data, error } = await supabase
    .from('eva_source_health')
    .select('source_name, status, last_sync_at');

  if (error) {
    console.error('Error querying source health:', error.message);
    return {};
  }

  const health = {};
  for (const row of data || []) {
    health[row.source_name] = row.status;
  }
  return health;
}

// ─── Item Grouping ─────────────────────────────────────────

function groupByApplication(items) {
  const groups = {};
  for (const item of items) {
    const app = item.target_application || 'unclassified';
    if (!groups[app]) groups[app] = [];
    groups[app].push(item);
  }
  return groups;
}

// ─── LLM Trend Detection ──────────────────────────────────

function buildTrendPrompt(appDomain, items) {
  const itemSummaries = items.slice(0, MAX_ITEMS_PER_BATCH).map((item, i) => {
    const aspects = (item.target_aspects || []).join(', ');
    return `${i + 1}. [${item.source}] "${item.title}" — intent: ${item.chairman_intent}, aspects: [${aspects}]`;
  }).join('\n');

  return `Analyze these ${items.length} classified items from the "${appDomain}" domain and identify 1-5 meaningful trends or patterns.

Items:
${itemSummaries}

For each trend, provide:
- trend_type: one of "convergence" (multiple items point to same topic), "acceleration" (increasing activity in area), "gap" (missing capability implied by items), "emerging" (new topic appearing), "decline" (decreasing focus)
- title: concise trend name (max 80 chars)
- description: 1-2 sentence explanation of the pattern
- corroborating_items: array of item numbers (1-indexed) that support this trend
- confidence: 0.0-1.0 based on how many items corroborate and how clear the pattern is

Respond with ONLY valid JSON in this format:
{
  "trends": [
    {
      "trend_type": "convergence",
      "title": "Example trend",
      "description": "Multiple items converge on...",
      "corroborating_items": [1, 3, 5],
      "confidence": 0.85
    }
  ]
}`;
}

async function detectTrendsForDomain(appDomain, items) {
  if (items.length < MIN_ITEMS_FOR_LLM) {
    console.log(`   Skipping ${appDomain}: only ${items.length} items (min: ${MIN_ITEMS_FOR_LLM})`);
    return [];
  }

  const client = await getClassificationClient();
  const prompt = buildTrendPrompt(appDomain, items);

  let timeoutId;
  try {
    const response = await Promise.race([
      client.complete(
        'You are a strategic trend analyst. Identify patterns in classified content items. Respond with only valid JSON.',
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
    return parseTrendResponse(text, appDomain, items);
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`   LLM error for ${appDomain}: ${err.message}`);
    return [];
  }
}

function parseTrendResponse(text, appDomain, items) {
  if (!text) return [];

  // Extract JSON from response (may have markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error(`   Failed to parse JSON from LLM response for ${appDomain}`);
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const trends = parsed.trends || [];

    return trends.map(trend => {
      // Map corroborating item indices to actual item references
      const corroboratingRefs = (trend.corroborating_items || [])
        .filter(idx => idx >= 1 && idx <= items.length)
        .map(idx => {
          const item = items[idx - 1];
          return { source: item.source, id: item.id, title: item.title };
        });

      return {
        trend_type: trend.trend_type,
        title: trend.title,
        description: trend.description,
        confidence_base: trend.confidence || 0.5,
        corroborating_refs: corroboratingRefs,
        application_domain: appDomain
      };
    });
  } catch (err) {
    console.error(`   JSON parse error for ${appDomain}: ${err.message}`);
    return [];
  }
}

// ─── Confidence Adjustment ─────────────────────────────────

function adjustConfidence(trend, sourceHealth) {
  let confidence = trend.confidence_base;

  // Boost for multiple corroborating items
  const itemCount = trend.corroborating_refs.length;
  if (itemCount >= 5) confidence = Math.min(1, confidence + 0.1);
  else if (itemCount >= 3) confidence = Math.min(1, confidence + 0.05);
  else if (itemCount <= 1) confidence = Math.max(0, confidence - 0.15);

  // Boost for cross-source corroboration
  const sources = new Set(trend.corroborating_refs.map(r => r.source));
  if (sources.size >= 2) confidence = Math.min(1, confidence + 0.1);

  // Penalize for stale/degraded sources
  for (const [sourceName, status] of Object.entries(sourceHealth)) {
    if (status === 'stale') confidence = Math.max(0, confidence - 0.15);
    else if (status === 'degraded') confidence = Math.max(0, confidence - 0.05);
  }

  return Math.round(confidence * 100) / 100;
}

// ─── Persistence ───────────────────────────────────────────

async function saveTrends(trends, sourceHealth) {
  const today = new Date().toISOString().slice(0, 10);
  let saved = 0;

  for (const trend of trends) {
    const record = {
      trend_date: today,
      trend_type: trend.trend_type,
      title: trend.title,
      description: trend.description,
      confidence_score: trend.confidence,
      corroborating_items: trend.corroborating_refs,
      source_freshness: sourceHealth,
      application_domain: trend.application_domain
    };

    const { error } = await supabase
      .from('eva_consultant_trends')
      .upsert(record, { onConflict: 'trend_date,title' });

    if (error) {
      console.error(`   Error saving trend "${trend.title}": ${error.message}`);
    } else {
      saved++;
    }
  }

  return saved;
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  EVA Trend Detector — Phase 1 LLM Pattern Detection    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  // 1. Fetch recent classified items
  console.log(`📥 Fetching classified items (last ${WINDOW_DAYS} days)...`);
  let items = await fetchRecentClassifiedItems(WINDOW_DAYS);

  // If too few items in window, expand to all classified items
  if (items.length < MIN_ITEMS_FOR_LLM) {
    console.log(`   Only ${items.length} items in ${WINDOW_DAYS}-day window. Expanding to all classified items...`);
    items = await fetchRecentClassifiedItems(365);
  }

  console.log(`   Found ${items.length} classified items`);

  if (items.length === 0) {
    console.log('\n⚠️  No classified items found. Cannot detect trends.');
    return;
  }

  // 2. Fetch source health
  console.log('\n🏥 Loading source health...');
  const sourceHealth = await fetchSourceHealth();
  for (const [name, status] of Object.entries(sourceHealth)) {
    const icon = status === 'healthy' ? '✅' : status === 'degraded' ? '⚠️' : '❌';
    console.log(`   ${icon} ${name}: ${status}`);
  }

  // 3. Group by application domain
  const groups = groupByApplication(items);
  const domains = Object.keys(groups);
  console.log(`\n📊 Grouped into ${domains.length} application domains: ${domains.join(', ')}`);

  // 4. Run LLM trend detection per domain
  console.log('\n🤖 Running LLM trend detection...');
  const allTrends = [];

  for (const [domain, domainItems] of Object.entries(groups)) {
    console.log(`\n   Domain: ${domain} (${domainItems.length} items)`);
    const trends = await detectTrendsForDomain(domain, domainItems);
    console.log(`   Detected ${trends.length} trends`);

    // Adjust confidence based on source health
    for (const trend of trends) {
      trend.confidence = adjustConfidence(trend, sourceHealth);
      allTrends.push(trend);
    }
  }

  if (allTrends.length === 0) {
    console.log('\n⚠️  No trends detected. This may indicate insufficient data or overly specific items.');
    return;
  }

  // 5. Save trends
  console.log(`\n💾 Saving ${allTrends.length} trends...`);
  const saved = await saveTrends(allTrends, sourceHealth);
  console.log(`   ✅ ${saved}/${allTrends.length} trends saved`);

  // 6. Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Detected Trends:');
  for (const trend of allTrends.sort((a, b) => b.confidence - a.confidence)) {
    const conf = (trend.confidence * 100).toFixed(0);
    console.log(`    [${conf}%] ${trend.trend_type}: ${trend.title}`);
    console.log(`         ${trend.description}`);
    console.log(`         Corroborating: ${trend.corroborating_refs.length} items from ${new Set(trend.corroborating_refs.map(r => r.source)).size} source(s)`);
  }
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n✅ Trend detection complete.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
