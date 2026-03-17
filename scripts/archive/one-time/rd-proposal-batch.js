#!/usr/bin/env node
/**
 * R&D Proposal Batch Generator — Monday Batch Job
 * SD: SD-AUTONOMOUS-SKUNKWORKS-RD-DEPARTMENT-ORCH-001-A
 *
 * Analyzes venture portfolio, identifies research opportunities,
 * and generates structured proposals for chairman review.
 *
 * Usage:
 *   node scripts/rd-proposal-batch.js            # Generate and persist proposals
 *   node scripts/rd-proposal-batch.js --dry-run   # Preview without persisting
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = process.argv.includes('--dry-run');

// ── Signal Readers ──────────────────────────────────────────

/**
 * Detect ventures stalled at the same lifecycle stage for 14+ days.
 */
async function readStageStalls() {
  const signals = [];
  const { data: ventures, error } = await supabase
    .from('ventures')
    .select('id, name, current_lifecycle_stage, metadata, updated_at')
    .in('status', ['active', 'paused']);

  if (error) {
    console.error('[stage-stall] Query error:', error.message);
    return signals;
  }

  const now = Date.now();
  const STALL_MS = 14 * 24 * 60 * 60 * 1000;

  for (const v of ventures || []) {
    const updatedAt = new Date(v.updated_at).getTime();
    if (now - updatedAt > STALL_MS && v.current_lifecycle_stage > 0) {
      const daysSinceUpdate = Math.round((now - updatedAt) / (24 * 60 * 60 * 1000));
      signals.push({
        type: 'stage_pattern',
        venture_ids: [v.id],
        title: `Investigate stalled venture: ${v.name}`,
        description: `${v.name} has been at stage ${v.current_lifecycle_stage} for ${daysSinceUpdate} days. Research whether market conditions, technical blockers, or strategy changes could unblock progression.`,
        priority: Math.min(100, 50 + daysSinceUpdate),
      });
    }
  }
  return signals;
}

/**
 * Detect capability gaps — ventures that passed early stages
 * but may lack capabilities needed for later stages.
 */
async function readCapabilityGaps() {
  const signals = [];
  const { data: ventures, error } = await supabase
    .from('ventures')
    .select('id, name, current_lifecycle_stage, metadata, discovery_strategy')
    .eq('status', 'active')
    .gte('current_lifecycle_stage', 3);

  if (error) {
    console.error('[capability-gap] Query error:', error.message);
    return signals;
  }

  for (const v of ventures || []) {
    const meta = v.metadata || {};

    // Ventures past stage 5 without clear monetization path
    if (v.current_lifecycle_stage >= 5 && !meta.monetization_validated) {
      signals.push({
        type: 'capability_gap',
        venture_ids: [v.id],
        title: `Monetization gap analysis: ${v.name}`,
        description: `${v.name} reached stage ${v.current_lifecycle_stage} but lacks validated monetization. Research revenue models, pricing strategies, and market willingness to pay.`,
        priority: 70 + (v.current_lifecycle_stage * 2),
      });
    }

    // Ventures from specific strategy that could cross-pollinate
    const strategy = v.discovery_strategy || meta.stage_zero?.origin_metadata?.discovery_strategy;
    if (strategy && v.current_lifecycle_stage >= 3) {
      signals.push({
        type: 'cross_pollination',
        venture_ids: [v.id],
        title: `Cross-pollination opportunity: ${v.name} (${strategy})`,
        description: `${v.name} discovered via ${strategy} at stage ${v.current_lifecycle_stage}. Research whether similar ventures or adjacent markets could benefit from shared learnings.`,
        priority: 55 + (v.current_lifecycle_stage * 3),
      });
    }
  }
  return signals;
}

/**
 * Detect market signal clusters from venture metadata.
 */
async function readMarketSignals() {
  const signals = [];
  const { data: ventures, error } = await supabase
    .from('ventures')
    .select('id, name, metadata, category')
    .eq('status', 'active');

  if (error) {
    console.error('[market-signal] Query error:', error.message);
    return signals;
  }

  // Group ventures by category
  const marketGroups = new Map();
  for (const v of ventures || []) {
    const cat = v.category || v.metadata?.market_category || v.metadata?.stage_zero?.market_category;
    if (cat) {
      if (!marketGroups.has(cat)) marketGroups.set(cat, []);
      marketGroups.get(cat).push(v);
    }
  }

  // Markets with 3+ ventures suggest a pattern worth researching
  for (const [category, grouped] of marketGroups) {
    if (grouped.length >= 3) {
      signals.push({
        type: 'market_signal',
        venture_ids: grouped.map(v => v.id),
        title: `Market concentration: ${category} (${grouped.length} ventures)`,
        description: `${grouped.length} ventures cluster in the "${category}" market. Research whether this concentration indicates a platform opportunity, shared infrastructure need, or competitive moat.`,
        priority: 60 + (grouped.length * 5),
      });
    }
  }
  return signals;
}

// ── Deduplication ───────────────────────────────────────────

function makeDedupKey(title, ventureIds) {
  const sorted = [...(ventureIds || [])].sort().join(',');
  return crypto.createHash('sha256').update(`${title}|${sorted}`).digest('hex').slice(0, 16);
}

async function getExistingDedupKeys() {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('rd_proposals')
    .select('dedup_key')
    .gte('created_at', oneWeekAgo)
    .not('dedup_key', 'is', null);
  return new Set((data || []).map(r => r.dedup_key));
}

// ── Main Pipeline ───────────────────────────────────────────

async function run() {
  console.log(`\n🔬 R&D Proposal Batch Generator${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log('═'.repeat(50));

  // Run all signal readers
  const [stalls, gaps, markets] = await Promise.all([
    readStageStalls(),
    readCapabilityGaps(),
    readMarketSignals(),
  ]);

  const allSignals = [...stalls, ...gaps, ...markets];
  console.log(`\n📡 Signals collected: ${allSignals.length}`);
  console.log(`   Stage stalls: ${stalls.length}`);
  console.log(`   Capability gaps: ${gaps.length}`);
  console.log(`   Market signals: ${markets.length}`);

  if (allSignals.length === 0) {
    console.log('\n✅ No research opportunities identified. Portfolio is healthy.');
    return;
  }

  // Deduplicate against recent proposals
  const existingKeys = await getExistingDedupKeys();
  const proposals = [];
  let skipped = 0;

  for (const signal of allSignals) {
    const dedupKey = makeDedupKey(signal.title, signal.venture_ids);
    if (existingKeys.has(dedupKey)) {
      skipped++;
      continue;
    }
    existingKeys.add(dedupKey); // prevent intra-batch duplicates

    proposals.push({
      title: signal.title,
      hypothesis: `If we investigate ${signal.type.replace(/_/g, ' ')} for the identified ventures, we may discover actionable insights that accelerate portfolio progress.`,
      methodology: '1. Analyze venture data and stage history. 2. Research market conditions and competitive landscape. 3. Identify specific actions or pivots. 4. Draft recommendation with expected ROI.',
      expected_outcome: signal.description,
      priority_score: Math.min(100, signal.priority),
      status: 'pending_review',
      proposal_type: signal.type,
      venture_ids: signal.venture_ids,
      dedup_key: dedupKey,
      created_by: 'rd-batch-job',
    });
  }

  // Sort by priority (highest first)
  proposals.sort((a, b) => b.priority_score - a.priority_score);

  console.log(`\n📋 Proposals generated: ${proposals.length} (skipped ${skipped} duplicates)`);

  if (DRY_RUN) {
    console.log('\n📄 DRY RUN — Proposals (not persisted):');
    for (const p of proposals) {
      console.log(`\n  [${p.proposal_type}] ${p.title}`);
      console.log(`  Priority: ${p.priority_score} | Ventures: ${p.venture_ids.length}`);
      console.log(`  ${p.expected_outcome.slice(0, 120)}...`);
    }
    console.log(`\n✅ Dry run complete. ${proposals.length} proposals would be created.`);
    return;
  }

  // Persist to database
  if (proposals.length > 0) {
    const { data, error } = await supabase
      .from('rd_proposals')
      .insert(proposals)
      .select('id, title, priority_score');

    if (error) {
      console.error('\n❌ Failed to insert proposals:', error.message);
      process.exit(1);
    }

    console.log(`\n✅ ${data.length} proposals inserted into rd_proposals:`);
    for (const row of data) {
      console.log(`   ${row.id} — ${row.title} (priority: ${row.priority_score})`);
    }
  }

  console.log(`\n📊 Summary: ${proposals.length} created, ${skipped} skipped (duplicates), 0 errors`);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
