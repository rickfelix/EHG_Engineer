#!/usr/bin/env node
/**
 * vision-heal.js — Self-Healing Vision Governance Loop
 *
 * Orchestrates the full inline vision scoring and corrective SD cycle:
 *
 * 1. SCORE:    Output scoring context for Claude Code to evaluate inline
 * 2. PERSIST:  Write Claude Code's score to eva_vision_scores
 * 3. GENERATE: If below threshold, create corrective SDs from gaps
 * 4. LIST:     Show corrective SDs for Claude Code to work through
 * 5. RESCORE:  After correctives complete, rescore to verify improvement
 *
 * The loop repeats until all dimensions pass threshold (93+) or max iterations reached.
 *
 * All LLM work happens inline in Claude Code — no API keys required.
 *
 * Usage:
 *   node scripts/eva/vision-heal.js score                    # Step 1: output scoring context
 *   node scripts/eva/vision-heal.js persist '<JSON>'         # Step 2: persist inline score
 *   node scripts/eva/vision-heal.js generate <score-id>      # Step 3: create corrective SDs
 *   node scripts/eva/vision-heal.js status                   # Check current state
 *   node scripts/eva/vision-heal.js loop                     # Full status + next action recommendation
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const ACCEPT_THRESHOLD = 93;
const VISION_KEY = 'VISION-EHG-L1-001';
const ARCH_KEY = 'ARCH-EHG-L1-001';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ─── SCORE: Output context for Claude Code inline evaluation ─────────────────

async function cmdScore() {
  const supabase = getSupabase();

  // Load vision dimensions
  const { data: vision } = await supabase
    .from('eva_vision_documents')
    .select('id, extracted_dimensions')
    .eq('vision_key', VISION_KEY)
    .single();

  const { data: arch } = await supabase
    .from('eva_architecture_plans')
    .select('id, extracted_dimensions')
    .eq('plan_key', ARCH_KEY)
    .single();

  if (!vision?.extracted_dimensions || !arch?.extracted_dimensions) {
    console.error('❌ Vision or architecture documents not found or missing dimensions');
    process.exit(1);
  }

  // Get latest score for comparison
  const { data: lastScore } = await supabase
    .from('eva_vision_scores')
    .select('total_score, dimension_scores, scored_at')
    .order('scored_at', { ascending: false })
    .limit(1)
    .single();

  const output = {
    mode: 'VISION_HEAL_SCORE',
    instruction: [
      'Claude Code: Score the CURRENT STATE OF THE CODEBASE (not a specific SD) against all dimensions.',
      'Evaluate what EXISTS in the codebase today against what the vision/architecture REQUIRES.',
      'After scoring, run: node scripts/eva/vision-heal.js persist \'<YOUR_JSON>\'',
    ].join('\n'),
    visionDimensions: vision.extracted_dimensions,
    archDimensions: arch.extracted_dimensions,
    visionId: vision.id,
    archPlanId: arch.id,
    lastScore: lastScore ? {
      total: lastScore.total_score,
      date: lastScore.scored_at,
      dimensions: lastScore.dimension_scores,
    } : null,
    responseFormat: {
      dimensions: [
        { id: 'V01', name: 'dimension_name', score: 0, reasoning: '2-3 sentences', gaps: ['gap1'] },
      ],
      total_score: 0,
      summary: '1-2 sentence overall assessment',
    },
  };

  console.log('===VISION_HEAL_SCORE_CONTEXT===');
  console.log(JSON.stringify(output, null, 2));
  console.log('===END_CONTEXT===');
}

// ─── PERSIST: Write Claude Code's score to database ──────────────────────────

async function cmdPersist(scoreJson) {
  const supabase = getSupabase();

  const parsed = JSON.parse(scoreJson);

  // Load dimension metadata for weights
  const { data: vision } = await supabase
    .from('eva_vision_documents')
    .select('id, extracted_dimensions')
    .eq('vision_key', VISION_KEY)
    .single();

  const { data: arch } = await supabase
    .from('eva_architecture_plans')
    .select('id, extracted_dimensions')
    .eq('plan_key', ARCH_KEY)
    .single();

  // Build dimension_scores JSONB with weights
  const allDims = [
    ...(vision.extracted_dimensions || []).map((d, i) => ({ ...d, id: `V${String(i + 1).padStart(2, '0')}` })),
    ...(arch.extracted_dimensions || []).map((d, i) => ({ ...d, id: `A${String(i + 1).padStart(2, '0')}` })),
  ];

  const dimensionScores = {};
  for (const dim of parsed.dimensions) {
    const ref = allDims.find(d => d.id === dim.id);
    dimensionScores[dim.id] = {
      name: dim.name,
      score: dim.score,
      weight: ref?.weight || 0,
      reasoning: dim.reasoning,
      gaps: dim.gaps || [],
      source: dim.id.startsWith('V') ? 'vision' : 'architecture',
    };
  }

  // Classify
  let thresholdAction = 'accept';
  if (parsed.total_score < 70) thresholdAction = 'escalate';
  else if (parsed.total_score < 83) thresholdAction = 'gap_closure_sd';
  else if (parsed.total_score < 93) thresholdAction = 'minor_sd';

  const { data: inserted, error } = await supabase
    .from('eva_vision_scores')
    .insert({
      vision_id: vision.id,
      arch_plan_id: arch.id,
      sd_id: null, // portfolio-level score
      total_score: parsed.total_score,
      dimension_scores: dimensionScores,
      threshold_action: thresholdAction,
      rubric_snapshot: {
        vision_key: VISION_KEY,
        arch_key: ARCH_KEY,
        criteria_count: allDims.length,
        summary: parsed.summary,
        scored_by: 'claude-code-inline',
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error(`❌ Failed to persist: ${error.message}`);
    process.exit(1);
  }

  console.log(`\n✅ Score persisted: ${parsed.total_score}/100`);
  console.log(`   Action: ${thresholdAction.toUpperCase()}`);
  console.log(`   Score ID: ${inserted.id}`);
  console.log('   Scored by: claude-code-inline');

  // Show per-dimension scores
  console.log('\n   Per-Dimension Scores:');
  for (const dim of parsed.dimensions) {
    const bar = '█'.repeat(Math.round(dim.score / 10)) + '░'.repeat(10 - Math.round(dim.score / 10));
    const src = dim.id.startsWith('V') ? 'V' : 'A';
    console.log(`   ${dim.id} [${src}] ${bar} ${dim.score}/100 — ${dim.name}`);
  }

  // Show weak dimensions
  const weak = parsed.dimensions.filter(d => d.score < ACCEPT_THRESHOLD).sort((a, b) => a.score - b.score);
  if (weak.length > 0) {
    console.log(`\n   ⚠️  ${weak.length} dimension(s) below threshold (${ACCEPT_THRESHOLD}):`);
    for (const d of weak) {
      console.log(`      ${d.id} ${d.name}: ${d.score}/100 (gap: ${ACCEPT_THRESHOLD - d.score} points)`);
    }
    console.log(`\n   Next: node scripts/eva/vision-heal.js generate ${inserted.id}`);
  } else {
    console.log(`\n   🎉 All dimensions at or above ${ACCEPT_THRESHOLD}! No corrective action needed.`);
  }

  // Output machine-readable status
  console.log(`\nHEAL_STATUS=${thresholdAction === 'accept' ? 'PASS' : 'NEEDS_CORRECTION'}`);
  console.log(`HEAL_SCORE_ID=${inserted.id}`);
}

// ─── GENERATE: Create corrective SDs from a score ────────────────────────────

async function cmdGenerate(scoreId) {
  // Delegate to existing corrective-sd-generator
  const { generateCorrectiveSD } = await import('./corrective-sd-generator.mjs');
  const result = await generateCorrectiveSD(scoreId);
  console.log(JSON.stringify(result, null, 2));

  if (result.created && result.sds) {
    console.log(`\n📋 Corrective SDs created (${result.sds.length}):`);
    for (const sd of result.sds) {
      console.log(`   ${sd.sdKey} — ${sd.label} (${sd.dims.map(d => d.dimId).join(', ')})`);
    }
    console.log('\n   Claude Code: work each SD through LEAD→PLAN→EXEC→completion,');
    console.log('   then run: node scripts/eva/vision-heal.js score');
  } else if (!result.created) {
    console.log(`\n   ℹ️  No SDs created: ${result.reason || result.action}`);
  }
}

// ─── STATUS: Show current vision governance state ────────────────────────────

async function cmdStatus() {
  const supabase = getSupabase();

  // Latest score
  const { data: latest } = await supabase
    .from('eva_vision_scores')
    .select('id, total_score, dimension_scores, threshold_action, rubric_snapshot, scored_at')
    .order('scored_at', { ascending: false })
    .limit(1)
    .single();

  if (!latest) {
    console.log('❌ No vision scores found. Run: node scripts/eva/vision-heal.js score');
    return;
  }

  console.log('\n🔍 Vision Governance Status');
  console.log(`   Latest Score: ${latest.total_score}/100 (${latest.threshold_action})`);
  console.log(`   Scored At: ${latest.scored_at}`);
  console.log(`   Scored By: ${latest.rubric_snapshot?.scored_by || 'unknown'}`);

  // Per-dimension
  if (latest.dimension_scores) {
    console.log('\n   Dimensions:');
    const entries = Object.entries(latest.dimension_scores)
      .map(([id, d]) => ({ id, ...(typeof d === 'object' ? d : { score: d }) }))
      .sort((a, b) => (a.score || 0) - (b.score || 0));

    for (const dim of entries) {
      const score = dim.score || 0;
      const bar = '█'.repeat(Math.round(score / 10)) + '░'.repeat(10 - Math.round(score / 10));
      const status = score >= ACCEPT_THRESHOLD ? '✅' : score >= 70 ? '⚠️' : '❌';
      console.log(`   ${status} ${dim.id} ${bar} ${score}/100 — ${dim.name || dim.id}`);
    }
  }

  // Active corrective SDs
  const { data: correctives } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, status, progress')
    .not('vision_origin_score_id', 'is', null)
    .not('status', 'in', '("completed","cancelled")')
    .order('created_at', { ascending: false })
    .limit(10);

  if (correctives?.length > 0) {
    console.log(`\n   Active Corrective SDs (${correctives.length}):`);
    for (const sd of correctives) {
      console.log(`      ${sd.sd_key} [${sd.status}] ${sd.progress || 0}% — ${sd.title?.substring(0, 60)}`);
    }
  }

  // Recommendation
  const weak = latest.dimension_scores
    ? Object.entries(latest.dimension_scores)
        .filter(([, d]) => (typeof d === 'object' ? d.score : d) < ACCEPT_THRESHOLD)
        .length
    : 0;

  console.log('\n   Recommendation:');
  if (weak === 0) {
    console.log('   🎉 All dimensions pass! No action needed.');
  } else if (correctives?.length > 0) {
    console.log(`   🔧 ${weak} gap(s) remain. Complete active corrective SDs, then rescore.`);
  } else {
    console.log(`   ⚠️  ${weak} gap(s) found. Run: node scripts/eva/vision-heal.js generate ${latest.id}`);
  }
}

// ─── LOOP: Full status + next action ─────────────────────────────────────────

async function cmdLoop() {
  await cmdStatus();
  console.log('\n───────────────────────────────────────');
  console.log('Vision Heal Loop Commands:');
  console.log('  score     → Output context for Claude Code to score inline');
  console.log('  persist   → Write score to DB after inline evaluation');
  console.log('  generate  → Create corrective SDs from gaps');
  console.log('  status    → Show current state');
  console.log('  loop      → This view');
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const argv1 = process.argv[1];
const isMain = argv1 && (
  import.meta.url === `file://${argv1}` ||
  import.meta.url === `file:///${argv1.replace(/\\/g, '/')}`
);

if (isMain) {
  const cmd = process.argv[2];
  const arg = process.argv[3];

  switch (cmd) {
    case 'score':
      cmdScore().catch(e => { console.error(e.message); process.exit(1); });
      break;
    case 'persist':
      if (!arg) { console.error('Usage: vision-heal.js persist \'<JSON>\''); process.exit(1); }
      cmdPersist(arg).catch(e => { console.error(e.message); process.exit(1); });
      break;
    case 'generate':
      if (!arg) { console.error('Usage: vision-heal.js generate <score-id>'); process.exit(1); }
      cmdGenerate(arg).catch(e => { console.error(e.message); process.exit(1); });
      break;
    case 'status':
      cmdStatus().catch(e => { console.error(e.message); process.exit(1); });
      break;
    case 'loop':
      cmdLoop().catch(e => { console.error(e.message); process.exit(1); });
      break;
    default:
      console.log('Usage: node scripts/eva/vision-heal.js <command>');
      console.log('');
      console.log('Commands:');
      console.log('  score              Output scoring context for Claude Code');
      console.log('  persist <JSON>     Persist Claude Code\'s inline score');
      console.log('  generate <id>      Create corrective SDs from score gaps');
      console.log('  status             Show current vision governance state');
      console.log('  loop               Full status + recommendations');
      process.exit(1);
  }
}
