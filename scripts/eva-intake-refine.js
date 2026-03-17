#!/usr/bin/env node
/**
 * EVA Intake Refine — Pre-promote pipeline for roadmap wave items
 * SD: SD-LEO-INFRA-ADD-DISTILL-REFINE-001
 *
 * 4-step pipeline that runs AFTER /distill approve and BEFORE /distill promote:
 *   1. AI Deduplication — Identify duplicate/near-duplicate items within waves
 *   2. SD + Codebase Reconciliation — Check items against existing SDs
 *   3. Multi-Persona Scoring — 4 personas evaluate each item (0-100)
 *   4. Research SD Promotion — Auto-create Research SDs for high-scoring items
 *
 * Pipeline order: /distill → /distill refine → /distill approve → /distill promote
 *
 * Usage:
 *   node scripts/eva-intake-refine.js                      # Full pipeline (token reconcile)
 *   node scripts/eva-intake-refine.js --dry-run             # Preview without DB writes
 *   node scripts/eva-intake-refine.js --roadmap-id <uuid>   # Specific roadmap
 *   node scripts/eva-intake-refine.js --wave-id <uuid>      # Specific wave only
 *   node scripts/eva-intake-refine.js --from-step N         # Start from step N (1-4)
 *   node scripts/eva-intake-refine.js --skip-promote        # Run steps 1-3 only
 *   node scripts/eva-intake-refine.js --extract-dedup        # Output dedup context for Claude Code inline, then stop
 *   node scripts/eva-intake-refine.js --dedup-file <f>      # Load dedup results from file, continue from step 2
 *   node scripts/eva-intake-refine.js --extract-reconcile   # Run step 1 + output reconcile context, then stop
 *   node scripts/eva-intake-refine.js --reconcile-file <f>  # Load reconcile results from file, run steps 3-4
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { dedup, extractDedupContext } from '../lib/integrations/refine-dedup.js';
import { reconcile, extractReconcileContext } from '../lib/integrations/refine-reconcile.js';
import { score, extractScoringContext } from '../lib/integrations/refine-score.js';
import { promote, groupForPromotion } from '../lib/integrations/refine-promote.js';

dotenv.config();

// Force cloud LLM — local Ollama can't handle multi-persona scoring at scale
process.env.USE_LOCAL_LLM = 'false';

const supabase = createSupabaseServiceClient();

// ─── CLI Args ──────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipPromote = args.includes('--skip-promote');
const extractReconcile = args.includes('--extract-reconcile');
const extractDedup = args.includes('--extract-dedup');
const extractScoring = args.includes('--extract-scoring');

function getFlag(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const roadmapId = getFlag('--roadmap-id');
const waveId = getFlag('--wave-id');
const reconcileFile = getFlag('--reconcile-file');
const dedupFile = getFlag('--dedup-file');
const scoringFile = getFlag('--scoring-file');
const fromStep = parseInt(getFlag('--from-step') || '1', 10);

// ─── Data Loading ──────────────────────────────────────────

/**
 * Find the active baselined roadmap (or use the specified one).
 */
async function getRoadmap() {
  if (roadmapId) {
    const { data, error } = await supabase
      .from('strategic_roadmaps')
      .select('id, title, status, current_baseline_version')
      .eq('id', roadmapId)
      .single();
    if (error) throw new Error(`Roadmap not found: ${error.message}`);
    return data;
  }

  // Find active baselined roadmap
  const { data, error } = await supabase
    .from('strategic_roadmaps')
    .select('id, title, status, current_baseline_version')
    .eq('status', 'active')
    .gt('current_baseline_version', 0)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    // Fall back to any draft roadmap
    const { data: drafts } = await supabase
      .from('strategic_roadmaps')
      .select('id, title, status, current_baseline_version')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!drafts || drafts.length === 0) return null;
    return drafts[0];
  }

  return data[0];
}

/**
 * Load waves and their items for the target roadmap.
 */
async function loadWavesWithItems(targetRoadmapId, targetWaveId) {
  let waveQuery = supabase
    .from('roadmap_waves')
    .select('id, title, description, sequence_rank, status')
    .eq('roadmap_id', targetRoadmapId)
    .order('sequence_rank', { ascending: true });

  if (targetWaveId) {
    waveQuery = waveQuery.eq('id', targetWaveId);
  }

  const { data: waves, error } = await waveQuery;
  if (error || !waves) return [];

  const result = [];
  for (const wave of waves) {
    const { data: items } = await supabase
      .from('roadmap_wave_items')
      .select('id, wave_id, source_type, source_id, title, priority_rank, metadata')
      .eq('wave_id', wave.id);

    // Enrich items with classification data from source tables
    const enriched = [];
    for (const item of items || []) {
      let sourceData = null;
      if (item.source_type === 'todoist') {
        const { data } = await supabase
          .from('eva_todoist_intake')
          .select('title, description, target_application, target_aspects, chairman_intent')
          .eq('id', item.source_id)
          .single();
        sourceData = data;
      } else if (item.source_type === 'youtube') {
        const { data } = await supabase
          .from('eva_youtube_intake')
          .select('title, description, target_application, target_aspects, chairman_intent')
          .eq('id', item.source_id)
          .single();
        sourceData = data;
      }

      enriched.push({
        ...item,
        wave_item_id: item.id,
        title: sourceData?.title || item.title || '(untitled)',
        description: sourceData?.description || '',
        target_application: sourceData?.target_application || '',
        target_aspects: sourceData?.target_aspects || [],
        chairman_intent: sourceData?.chairman_intent || '',
      });
    }

    result.push({
      ...wave,
      items: enriched,
    });
  }

  return result;
}

// ─── Pipeline Steps ────────────────────────────────────────

function header(step, title) {
  console.log(`\n── Step ${step}: ${title} ──\n`);
}

/**
 * Step 1: AI Deduplication
 */
async function runDedup(waves) {
  header(1, 'AI Deduplication');

  const allResults = [];

  for (const wave of waves) {
    if (wave.items.length < 2) {
      console.log(`  Wave "${wave.title}": ${wave.items.length} item(s) — skipping dedup`);
      continue;
    }

    console.log(`  Wave "${wave.title}": ${wave.items.length} items`);
    const result = await dedup(wave.items);
    console.log(`    Method: ${result.method}`);
    console.log(`    Duplicate groups found: ${result.groups.length}`);

    for (const group of result.groups) {
      const titles = group.item_indices.map(idx => {
        const item = wave.items[idx - 1];
        return item ? `"${(item.title || '').slice(0, 50)}"` : `#${idx}`;
      });
      console.log(`      Group (${group.item_indices.length}): ${titles.join(' + ')}`);
      console.log(`        Reason: ${group.reason}`);
    }

    allResults.push({ wave_id: wave.id, wave_title: wave.title, ...result });
  }

  return allResults;
}

/**
 * Step 2: SD + Codebase Reconciliation
 */
async function runReconcile(waves) {
  header(2, 'SD + Codebase Reconciliation');

  const allItems = waves.flatMap(w => w.items);
  if (allItems.length === 0) {
    console.log('  No items to reconcile.');
    return [];
  }

  console.log(`  Reconciling ${allItems.length} items against ${200} most recent SDs...`);
  const results = await reconcile(allItems, { supabase });

  // Summarize
  const counts = { novel: 0, already_done: 0, in_progress: 0, partially_done: 0 };
  for (const r of results) {
    counts[r.status] = (counts[r.status] || 0) + 1;
  }

  console.log('  Results:');
  console.log(`    Novel (new):      ${counts.novel}`);
  console.log(`    Already done:     ${counts.already_done}`);
  console.log(`    In progress:      ${counts.in_progress}`);
  console.log(`    Partially done:   ${counts.partially_done}`);

  // Show non-novel items
  const nonNovel = results.filter(r => r.status !== 'novel');
  if (nonNovel.length > 0) {
    console.log('\n  Non-novel items:');
    for (const r of nonNovel) {
      const item = allItems[r.item_index - 1];
      console.log(`    [${r.status}] "${(item?.title || '').slice(0, 60)}" → ${r.matched_sd_key} (${r.confidence}%)`);
    }
  }

  return results;
}

/**
 * Step 3: Multi-Persona Scoring
 */
async function runScoring(waves) {
  header(3, 'Multi-Persona Scoring');

  const allResults = [];

  for (const wave of waves) {
    if (wave.items.length === 0) continue;

    console.log(`  Wave "${wave.title}": Scoring ${wave.items.length} items...`);
    const result = await score(wave.items, {
      waveTitle: wave.title,
      waveDescription: wave.description,
    });

    console.log(`    Method: ${result.method}`);

    // Distribution summary
    const promote = result.item_scores.filter(s => s.recommendation === 'promote').length;
    const review = result.item_scores.filter(s => s.recommendation === 'review').length;
    const defer = result.item_scores.filter(s => s.recommendation === 'defer').length;

    console.log(`    Promote (>=70): ${promote}`);
    console.log(`    Review (40-69): ${review}`);
    console.log(`    Defer (<40):    ${defer}`);

    // Top 5 scores
    const sorted = [...result.item_scores].sort((a, b) => b.composite - a.composite);
    console.log('\n    Top items:');
    sorted.slice(0, 5).forEach(s => {
      const item = wave.items[s.item_index - 1];
      console.log(`      [${s.composite}] ${s.recommendation.toUpperCase()} — "${(item?.title || '').slice(0, 60)}"`);
    });

    allResults.push({
      wave_id: wave.id,
      wave_title: wave.title,
      ...result,
    });
  }

  return allResults;
}

/**
 * Step 4: Brainstorm Promotion Analysis
 * SD-DISTILLTOBRAINSTORM-ORCH-001-C: Research SDs no longer created.
 * All items go through brainstorm auto-chain (vision → arch → SD).
 */
async function runPromotion(waves, scoringResults) {
  header(4, 'Brainstorm Promotion Analysis');

  if (skipPromote) {
    console.log('  [SKIPPED] --skip-promote flag set');
    return { promoted: [], skipped: 0 };
  }

  // Flatten scored items with their original items
  const allScoredItems = [];
  const allOriginalItems = [];

  for (const result of scoringResults) {
    const wave = waves.find(w => w.id === result.wave_id);
    if (!wave) continue;

    for (const scored of result.item_scores) {
      allScoredItems.push(scored);
      allOriginalItems.push(wave.items[scored.item_index - 1]);
    }
  }

  // Preview groups
  const groups = groupForPromotion(allScoredItems, allOriginalItems);
  console.log(`  Promotion groups: ${groups.length}`);
  for (const g of groups) {
    console.log(`    ${g.application}: ${g.items.length} items`);
  }

  if (groups.length === 0) {
    console.log('  No items scored high enough for promotion.');
    return { promoted: [], skipped: allScoredItems.length };
  }

  const result = await promote(allScoredItems, allOriginalItems);

  for (const p of result.promoted) {
    console.log(`  ${p.application}: ${p.brainstormed} brainstormed, ${p.pending} pending brainstorm`);
  }

  return result;
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════════');
  console.log('  EVA INTAKE REFINE');
  console.log('  Dedup → Reconcile → Score → Promote');
  console.log('══════════════════════════════════════════════════════');

  if (dryRun) console.log('  [DRY RUN MODE]');

  // Load roadmap
  const roadmap = await getRoadmap();
  if (!roadmap) {
    console.log('\n  No roadmap found. Run /distill first to create one.');
    process.exit(0);
  }

  console.log(`\n  Roadmap: "${roadmap.title}" [${roadmap.id.substring(0, 8)}]`);
  console.log(`  Status: ${roadmap.status} | Baseline: v${roadmap.current_baseline_version || 0}`);

  // Load waves with items
  const waves = await loadWavesWithItems(roadmap.id, waveId);
  const totalItems = waves.reduce((sum, w) => sum + w.items.length, 0);
  console.log(`  Waves: ${waves.length} | Total items: ${totalItems}`);

  if (totalItems === 0) {
    console.log('\n  No items found in waves. Nothing to refine.');
    process.exit(0);
  }

  waves.forEach(w => {
    console.log(`    [${w.sequence_rank}] ${w.title}: ${w.items.length} items`);
  });

  // Execute pipeline steps
  let dedupResults, reconcileResults, scoringResults, promotionResults;

  // --extract-dedup: output dedup context for Claude Code inline analysis, then stop
  if (extractDedup) {
    header(1, 'AI Deduplication (Extracting Context)');
    const allContexts = [];
    for (const wave of waves) {
      if (wave.items.length < 2) {
        console.log(`  Wave "${wave.title}": ${wave.items.length} item(s) — skipping dedup`);
        continue;
      }
      console.log(`  Wave "${wave.title}": ${wave.items.length} items — extracting context`);
      const ctx = extractDedupContext(wave.items, { title: wave.title, description: wave.description });
      allContexts.push({ wave_id: wave.id, wave_title: wave.title, ...ctx });
    }
    console.log('');
    console.log('===DEDUP_CONTEXT===');
    console.log(JSON.stringify(allContexts, null, 2));
    console.log('===END_DEDUP_CONTEXT===');
    console.log('');
    console.log('  Context extracted. Claude Code will perform semantic deduplication inline.');
    console.log('  Results should be written to: scripts/temp/dedup-results.json');
    console.log('  Then resume with: node scripts/eva-intake-refine.js --from-step 2 --dedup-file scripts/temp/dedup-results.json');
    process.exit(0);
  }

  // --dedup-file: load pre-computed dedup results from Claude Code inline analysis
  if (dedupFile) {
    header(1, 'AI Deduplication (Inline Results)');
    try {
      const raw = readFileSync(dedupFile, 'utf8');
      const parsed = JSON.parse(raw);
      dedupResults = Array.isArray(parsed) ? parsed : (parsed.results || [parsed]);
      console.log(`  Loaded dedup results from ${dedupFile}`);
      console.log('  Method: Claude Code inline (semantic)');
      const totalGroups = dedupResults.reduce((sum, r) => sum + (r.groups?.length || 0), 0);
      console.log(`  Duplicate groups found: ${totalGroups}`);
      for (const waveResult of dedupResults) {
        if (waveResult.groups) {
          for (const group of waveResult.groups) {
            const wave = waves.find(w => w.id === waveResult.wave_id);
            const titles = group.item_indices.map(idx => {
              const item = wave?.items[idx - 1];
              return item ? `"${(item.title || '').slice(0, 50)}"` : `#${idx}`;
            });
            console.log(`      Group (${group.item_indices.length}): ${titles.join(' + ')}`);
            console.log(`        Reason: ${group.reason}`);
          }
        }
      }
    } catch (err) {
      console.warn(`  Warning: Could not load dedup file: ${err.message}`);
      console.warn('  Falling back to keyword-based deduplication.');
      dedupResults = await runDedup(waves);
    }
  } else if (fromStep <= 1) {
    dedupResults = await runDedup(waves);
  } else {
    console.log('\n── Step 1: Dedup ── SKIPPED\n');
  }

  // --extract-reconcile: output context for Claude Code inline analysis, then stop
  if (extractReconcile) {
    header(2, 'SD + Codebase Reconciliation (Extracting Context)');
    const allItems = waves.flatMap(w => w.items);
    console.log(`  Extracting context for ${allItems.length} items...`);
    const context = await extractReconcileContext(allItems, { supabase });
    console.log(`  SDs loaded: ${context.sd_count}`);
    console.log(`  Items to reconcile: ${context.item_count}`);
    console.log('');
    console.log('===RECONCILE_CONTEXT===');
    console.log(JSON.stringify(context, null, 2));
    console.log('===END_RECONCILE_CONTEXT===');
    console.log('');
    console.log('  Context extracted. Claude Code will perform semantic reconciliation inline.');
    console.log('  Results should be written to: scripts/temp/reconcile-results.json');
    console.log('  Then resume with: node scripts/eva-intake-refine.js --from-step 3 --reconcile-file scripts/temp/reconcile-results.json');
    process.exit(0);
  }

  // --reconcile-file: load pre-computed reconcile results from Claude Code inline analysis
  if (reconcileFile) {
    header(2, 'SD + Codebase Reconciliation (Inline Results)');
    try {
      const raw = readFileSync(reconcileFile, 'utf8');
      const parsed = JSON.parse(raw);
      reconcileResults = parsed.results || parsed;
      console.log(`  Loaded ${reconcileResults.length} reconcile results from ${reconcileFile}`);
      console.log('  Method: Claude Code inline (semantic)');

      const counts = { novel: 0, already_done: 0, in_progress: 0, partially_done: 0 };
      for (const r of reconcileResults) {
        counts[r.status] = (counts[r.status] || 0) + 1;
      }

      console.log('  Results:');
      console.log(`    Novel (new):      ${counts.novel}`);
      console.log(`    Already done:     ${counts.already_done}`);
      console.log(`    In progress:      ${counts.in_progress}`);
      console.log(`    Partially done:   ${counts.partially_done}`);

      const nonNovel = reconcileResults.filter(r => r.status !== 'novel');
      if (nonNovel.length > 0) {
        const allItems = waves.flatMap(w => w.items);
        console.log('\n  Non-novel items:');
        for (const r of nonNovel) {
          const item = allItems[r.item_index - 1];
          console.log(`    [${r.status}] "${(item?.title || '').slice(0, 60)}" → ${r.matched_sd_key} (${r.confidence}%)`);
        }
      }
    } catch (err) {
      console.warn(`  Warning: Could not load reconcile file: ${err.message}`);
      console.warn('  Falling back to token-based reconciliation.');
      reconcileResults = await runReconcile(waves);
    }
  } else if (fromStep <= 2 && !extractReconcile) {
    reconcileResults = await runReconcile(waves);
  } else if (!reconcileFile) {
    console.log('\n── Step 2: Reconcile ── SKIPPED\n');
  }

  // --extract-scoring: output scoring context for Claude Code inline analysis, then stop
  if (extractScoring) {
    header(3, 'Multi-Persona Scoring (Extracting Context)');
    const allContexts = [];
    for (const wave of waves) {
      if (wave.items.length === 0) continue;
      console.log(`  Wave "${wave.title}": ${wave.items.length} items — extracting context`);
      const ctx = extractScoringContext(wave.items, { title: wave.title, description: wave.description });
      allContexts.push({ wave_id: wave.id, ...ctx });
    }
    console.log('');
    console.log('===SCORING_CONTEXT===');
    console.log(JSON.stringify(allContexts, null, 2));
    console.log('===END_SCORING_CONTEXT===');
    console.log('');
    console.log('  Context extracted. Claude Code will perform multi-persona scoring inline.');
    console.log('  Results should be written to: scripts/temp/scoring-results.json');
    console.log('  Then resume with: node scripts/eva-intake-refine.js --from-step 4 --scoring-file scripts/temp/scoring-results.json');
    process.exit(0);
  }

  // --scoring-file: load pre-computed scoring results from Claude Code inline analysis
  if (scoringFile) {
    header(3, 'Multi-Persona Scoring (Inline Results)');
    try {
      const raw = readFileSync(scoringFile, 'utf8');
      scoringResults = JSON.parse(raw);
      if (!Array.isArray(scoringResults)) scoringResults = [scoringResults];
      console.log(`  Loaded scoring results from ${scoringFile}`);
      console.log('  Method: Claude Code inline (semantic)');

      for (const waveResult of scoringResults) {
        const promote = waveResult.item_scores.filter(s => s.recommendation === 'promote').length;
        const review = waveResult.item_scores.filter(s => s.recommendation === 'review').length;
        const defer = waveResult.item_scores.filter(s => s.recommendation === 'defer').length;
        console.log(`  Wave "${waveResult.wave_title || waveResult.wave_id}": ${promote} promote, ${review} review, ${defer} defer`);
      }
    } catch (err) {
      console.warn(`  Warning: Could not load scoring file: ${err.message}`);
      console.warn('  Falling back to AI-based scoring.');
      scoringResults = await runScoring(waves);
    }
  } else if (fromStep <= 3) {
    scoringResults = await runScoring(waves);
  } else {
    console.log('\n── Step 3: Score ── SKIPPED\n');
  }

  // Persist scoring results to temp file and DB
  if (scoringResults && scoringResults.length > 0) {
    const scorePath = resolve(dirname(fileURLToPath(import.meta.url)), 'temp', 'scoring-results.json');
    writeFileSync(scorePath, JSON.stringify(scoringResults, null, 2));
    console.log('\n  Scoring results saved to scripts/temp/scoring-results.json');

    // Persist scores into metadata JSONB column
    let persisted = 0;
    for (const waveResult of scoringResults) {
      const wave = waves.find(w => w.id === waveResult.wave_id);
      if (!wave) continue;
      for (const s of waveResult.item_scores) {
        const item = wave.items[s.item_index - 1];
        if (!item || !item.id) continue;
        const existingMeta = item.metadata || {};
        const newMeta = {
          ...existingMeta,
          refine_composite_score: s.composite,
          refine_recommendation: s.recommendation,
          refine_persona_scores: s.persona_scores,
          refine_method: waveResult.method || 'claude_inline',
          refine_scored_at: new Date().toISOString(),
        };
        const { error } = await supabase
          .from('roadmap_wave_items')
          .update({ metadata: newMeta })
          .eq('id', item.id);
        if (!error) persisted++;
      }
    }
    console.log(`  Persisted ${persisted} scores to DB (metadata column)`);
  }

  if (fromStep <= 4 && scoringResults) {
    promotionResults = await runPromotion(waves, scoringResults);
  } else {
    console.log('\n── Step 4: Promote ── SKIPPED\n');
  }

  // Summary
  console.log('');
  console.log('══════════════════════════════════════════════════════');
  console.log('  REFINE COMPLETE');
  console.log('══════════════════════════════════════════════════════');
  console.log('');

  if (dedupResults) {
    const totalGroups = dedupResults.reduce((sum, r) => sum + r.groups.length, 0);
    console.log(`  Dedup: ${totalGroups} duplicate group(s) found`);
  }
  if (reconcileResults) {
    const novel = reconcileResults.filter(r => r.status === 'novel').length;
    console.log(`  Reconcile: ${novel}/${reconcileResults.length} items are novel`);
  }
  if (scoringResults) {
    const allScores = scoringResults.flatMap(r => r.item_scores);
    const avg = allScores.length > 0
      ? Math.round(allScores.reduce((sum, s) => sum + s.composite, 0) / allScores.length)
      : 0;
    console.log(`  Scoring: avg composite ${avg}/100`);
  }
  if (promotionResults) {
    console.log(`  Brainstorm groups: ${promotionResults.promoted.length}`);
    console.log(`  Below threshold: ${promotionResults.skipped} items`);
  }

  console.log('');
  console.log('  Next steps:');
  console.log('    /distill approve --roadmap-id <id>    Approve refined waves');
  console.log('    /distill promote --wave-id <id>       Promote approved wave to SDs');
  console.log('    /distill status                       View current roadmap');
  console.log('');
}

main().catch(err => {
  console.error('Refine error:', err.message);
  process.exit(1);
});
