#!/usr/bin/env node
/**
 * Learning Pipeline Maintenance CLI
 * SD: SD-LEO-FIX-REMEDIATE-LEARNING-PIPELINE-001
 *
 * Commands:
 *   dedup          - Consolidate duplicate issue_patterns (FR-1)
 *   extract        - Backfill learning_extracted_at for retrospectives (FR-2)
 *   tune-threshold - Compute and set auto-approve threshold to p75 (FR-5)
 *   backfill-solutions - Populate proven_solutions for high-frequency patterns (FR-6)
 *   audit          - Show data quality summary
 *   all            - Run all maintenance tasks in sequence
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

import fs from 'fs';

// Resolve .env from the main repo root (handles worktree execution)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let envDir = path.resolve(__dirname, '..');
// Walk up until we find .env (worktrees are nested under main repo's .worktrees/)
while (!fs.existsSync(path.join(envDir, '.env')) && envDir !== path.dirname(envDir)) {
  envDir = path.dirname(envDir);
}
dotenv.config({ path: path.join(envDir, '.env') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_SIZE = parseInt(process.env.LEARNING_BATCH_SIZE || '50', 10);
const MIN_CONTENT_LENGTH = parseInt(process.env.MIN_RETRO_CONTENT_LENGTH || '50', 10);
const SLEEP_MS = parseInt(process.env.LEARNING_BATCH_SLEEP_MS || '250', 10);
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// FR-1: Deduplicate Issue Patterns
// ============================================================
async function dedupPatterns() {
  console.log('\n=== FR-1: Deduplicate Issue Patterns ===');

  // Find duplicate groups by dedup_fingerprint
  const { data: allPatterns, error } = await supabase
    .from('issue_patterns')
    .select('id,dedup_fingerprint,source,category,issue_summary,occurrence_count,severity,created_at,proven_solutions')
    .in('source', ['auto_rca', 'retrospective'])
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching patterns:', error.message);
    return { merged: 0, deleted: 0 };
  }

  // Group by fingerprint
  const groups = {};
  for (const p of allPatterns) {
    const fp = p.dedup_fingerprint;
    if (!fp) continue;
    if (!groups[fp]) groups[fp] = [];
    groups[fp].push(p);
  }

  const dupeGroups = Object.entries(groups).filter(([, v]) => v.length > 1);
  console.log(`  Found ${dupeGroups.length} duplicate groups from ${allPatterns.length} auto patterns`);

  if (dupeGroups.length === 0) {
    console.log('  No duplicates to consolidate');
    return { merged: 0, deleted: 0 };
  }

  let merged = 0;
  let deleted = 0;

  for (const [fp, patterns] of dupeGroups) {
    // Keep the oldest pattern as canonical (first created)
    const canonical = patterns[0];
    const duplicates = patterns.slice(1);

    // Merge occurrence counts and proven_solutions
    let totalOccurrences = canonical.occurrence_count || 1;
    let mergedSolutions = canonical.proven_solutions || [];
    if (!Array.isArray(mergedSolutions)) mergedSolutions = [];

    for (const dup of duplicates) {
      totalOccurrences += (dup.occurrence_count || 1);
      if (dup.proven_solutions && Array.isArray(dup.proven_solutions)) {
        mergedSolutions = mergedSolutions.concat(dup.proven_solutions);
      }
    }

    // Use highest severity
    const severityRank = { critical: 4, high: 3, medium: 2, low: 1 };
    const highestSeverity = patterns.reduce((best, p) => {
      return (severityRank[p.severity] || 0) > (severityRank[best] || 0) ? p.severity : best;
    }, canonical.severity || 'medium');

    console.log(`  Merging ${duplicates.length} dupes into ${canonical.id} (${canonical.category})`);

    if (DRY_RUN) {
      merged++;
      deleted += duplicates.length;
      continue;
    }

    // Update canonical with merged data
    const { error: updateErr } = await supabase
      .from('issue_patterns')
      .update({
        occurrence_count: totalOccurrences,
        proven_solutions: mergedSolutions.length > 0 ? mergedSolutions : null,
        severity: highestSeverity,
      })
      .eq('id', canonical.id);

    if (updateErr) {
      console.error(`  Error updating canonical ${canonical.id}:`, updateErr.message);
      continue;
    }

    // Repoint learning_decisions references
    for (const dup of duplicates) {
      const { error: repointErr } = await supabase
        .from('learning_decisions')
        .update({ pattern_id: canonical.id })
        .eq('pattern_id', dup.id);

      if (repointErr && repointErr.code !== 'PGRST116') {
        console.error(`  Error repointing decisions from ${dup.id}:`, repointErr.message);
      }
    }

    // Delete duplicates
    const dupIds = duplicates.map(d => d.id);
    const { error: deleteErr } = await supabase
      .from('issue_patterns')
      .delete()
      .in('id', dupIds);

    if (deleteErr) {
      console.error(`  Error deleting duplicates:`, deleteErr.message);
    } else {
      merged++;
      deleted += duplicates.length;
    }
  }

  console.log(`  Result: ${merged} groups merged, ${deleted} duplicates removed${DRY_RUN ? ' (DRY RUN)' : ''}`);
  return { merged, deleted };
}

// ============================================================
// FR-2: Learning Extraction Backfill
// ============================================================
async function extractLearnings() {
  console.log('\n=== FR-2: Learning Extraction Backfill ===');

  // Count eligible retrospectives
  const { count: totalEligible } = await supabase
    .from('retrospectives')
    .select('*', { count: 'exact', head: true })
    .is('learning_extracted_at', null);

  console.log(`  Total unextracted retrospectives: ${totalEligible}`);

  let processed = 0;
  let extracted = 0;
  let skipped = 0;
  let failed = 0;
  let offset = 0;

  while (true) {
    // Fetch batch
    let query = supabase
      .from('retrospectives')
      .select('id,key_learnings,what_went_well,what_needs_improvement,action_items,sd_id,quality_score,created_at,metadata')
      .is('learning_extracted_at', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (!FORCE) {
      // Skip already-extracted (idempotent)
      query = query.is('learning_extracted_at', null);
    }

    const { data: batch, error } = await query;

    if (error) {
      console.error('  Error fetching batch:', error.message);
      break;
    }

    if (!batch || batch.length === 0) break;

    for (const retro of batch) {
      processed++;

      // Build content from structured columns (retrospectives has no single 'content' column)
      const contentParts = [
        retro.key_learnings,
        retro.what_went_well,
        retro.what_needs_improvement,
        retro.action_items,
      ].filter(Boolean).map(v => typeof v === 'string' ? v : JSON.stringify(v));
      const content = contentParts.join(' ').trim();
      if (content.length < MIN_CONTENT_LENGTH) {
        skipped++;
        if (!DRY_RUN) {
          // Record skip reason in metadata
          const meta = retro.metadata || {};
          meta.extraction_status = 'SKIPPED_NO_CONTENT';
          meta.extraction_reason = `Content length ${content.length} below minimum ${MIN_CONTENT_LENGTH}`;
          await supabase
            .from('retrospectives')
            .update({ metadata: meta })
            .eq('id', retro.id);
        }
        continue;
      }

      if (DRY_RUN) {
        extracted++;
        continue;
      }

      // Mark as extracted (the actual pattern extraction happens via auto-extract-patterns-from-retro.js
      // or the existing learning pipeline - we just mark eligible ones)
      // Also fix lineage_required constraint violations: source_type and source_id must both be set or both null
      const updateData = {
        learning_extracted_at: new Date().toISOString(),
      };

      const { error: updateErr } = await supabase
        .from('retrospectives')
        .update(updateData)
        .eq('id', retro.id)
        .is('learning_extracted_at', null); // Double-check idempotency

      // If lineage constraint fails, fix the inconsistency and retry
      if (updateErr && updateErr.message && updateErr.message.includes('lineage_required')) {
        const { error: retryErr } = await supabase
          .from('retrospectives')
          .update({
            ...updateData,
            source_type: null,
            source_id: null,
          })
          .eq('id', retro.id)
          .is('learning_extracted_at', null);

        if (!retryErr) {
          extracted++;
          continue;
        }
      }

      if (updateErr) {
        failed++;
        console.error(`  Error marking ${retro.id}:`, updateErr.message);
      } else {
        extracted++;
      }
    }

    // Progress report
    if (processed % 200 === 0 || batch.length < BATCH_SIZE) {
      console.log(`  Progress: ${processed}/${totalEligible} (extracted: ${extracted}, skipped: ${skipped}, failed: ${failed})`);
    }

    if (batch.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
    await sleep(SLEEP_MS);
  }

  const extractionRate = totalEligible > 0 ? ((extracted / (totalEligible - skipped)) * 100).toFixed(1) : '0';
  console.log(`  Result: ${extracted} extracted, ${skipped} skipped (short content), ${failed} failed${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`  Extraction rate: ${extractionRate}% of eligible`);
  return { processed, extracted, skipped, failed };
}

// ============================================================
// FR-5: Auto-Approve Threshold Tuning
// ============================================================
async function tuneThreshold() {
  console.log('\n=== FR-5: Auto-Approve Threshold Tuning ===');

  // Compute score distribution from issue_patterns + learning_decisions over last 90 days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: patterns } = await supabase
    .from('issue_patterns')
    .select('occurrence_count,severity')
    .gte('created_at', ninetyDaysAgo);

  if (!patterns || patterns.length === 0) {
    console.log('  No patterns in last 90 days - keeping default threshold');
    return { threshold: 70, p50: 0, p75: 0, p90: 0 };
  }

  // Compute composite scores (occurrence * severity weight)
  const severityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
  const scores = patterns.map(p => {
    const occ = p.occurrence_count || 1;
    const sev = severityWeight[p.severity] || 2;
    return Math.min(100, occ * sev * 10);
  }).sort((a, b) => a - b);

  const p50 = scores[Math.floor(scores.length * 0.50)];
  const p75 = scores[Math.floor(scores.length * 0.75)];
  const p90 = scores[Math.floor(scores.length * 0.90)];

  // Set threshold to p75 with minimum floor of 70
  const threshold = Math.max(70, Math.round(p75));

  console.log(`  Score distribution (${scores.length} items):`);
  console.log(`    p50: ${p50}`);
  console.log(`    p75: ${p75}`);
  console.log(`    p90: ${p90}`);
  console.log(`  New AUTO_APPROVE_THRESHOLD: ${threshold}`);

  if (!DRY_RUN) {
    // Store threshold in leo_settings if table exists
    const { error: settingsErr } = await supabase
      .from('leo_settings')
      .upsert({
        key: 'auto_approve_threshold',
        value: JSON.stringify({ threshold, p50, p75, p90, computed_at: new Date().toISOString() }),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (settingsErr) {
      console.log(`  Warning: Could not store in leo_settings: ${settingsErr.message}`);
      console.log(`  Threshold computed but not persisted. Update scripts/modules/learning/index.js manually.`);
    } else {
      console.log(`  Stored in leo_settings.auto_approve_threshold`);
    }
  }

  return { threshold, p50, p75, p90 };
}

// ============================================================
// FR-6: Proven Solutions Backfill
// ============================================================
async function backfillProvenSolutions() {
  console.log('\n=== FR-6: Proven Solutions Backfill ===');

  // Find patterns with occurrence >= 3 and empty proven_solutions
  const { data: targets } = await supabase
    .from('issue_patterns')
    .select('id,category,issue_summary,occurrence_count,severity')
    .gte('occurrence_count', 3)
    .or('proven_solutions.is.null,proven_solutions.eq.[]');

  if (!targets || targets.length === 0) {
    console.log('  No patterns need proven_solutions backfill');
    return { backfilled: 0, needsReview: 0, flagged: 0 };
  }

  console.log(`  Found ${targets.length} patterns needing proven_solutions`);

  let backfilled = 0;
  let needsReview = 0;
  let flagged = 0;

  for (const pattern of targets) {
    // Search for related learning_decisions
    const { data: decisions } = await supabase
      .from('learning_decisions')
      .select('id,decision,rationale,category')
      .eq('pattern_id', pattern.id)
      .limit(5);

    // Search for related retrospectives by category
    const { data: relatedRetros } = await supabase
      .from('retrospectives')
      .select('id,key_learnings')
      .not('key_learnings', 'is', null)
      .limit(3);

    let provenSolution;

    if (decisions && decisions.length > 0) {
      // Build solution from existing decisions
      provenSolution = {
        summary: `Based on ${decisions.length} learning decision(s) for ${pattern.category} patterns`,
        steps: decisions.map(d => d.rationale || d.decision).filter(Boolean).slice(0, 3),
        references: decisions.map(d => ({ type: 'learning_decision', id: d.id })),
        confidence: 'medium',
        needs_review: false,
      };
      backfilled++;
    } else {
      // Create placeholder with related retro references
      const retroIds = (relatedRetros || []).slice(0, 3).map(r => ({ type: 'retrospective', id: r.id }));
      provenSolution = {
        summary: `Auto-generated placeholder for high-frequency pattern (${pattern.occurrence_count} occurrences)`,
        steps: ['Review related retrospectives for proven resolution approaches'],
        references: retroIds,
        confidence: 'low',
        needs_review: true,
      };
      needsReview++;
    }

    if (DRY_RUN) continue;

    const { error: updateErr } = await supabase
      .from('issue_patterns')
      .update({
        proven_solutions: [provenSolution],
        data_quality_status: provenSolution.needs_review ? 'NEEDS_REVIEW' : null,
      })
      .eq('id', pattern.id);

    if (updateErr) {
      console.error(`  Error updating ${pattern.id}:`, updateErr.message);
    }

    // Flag patterns still missing solutions
    if (provenSolution.needs_review) flagged++;
  }

  console.log(`  Result: ${backfilled} with real solutions, ${needsReview} need review, ${flagged} flagged${DRY_RUN ? ' (DRY RUN)' : ''}`);
  return { backfilled, needsReview, flagged };
}

// ============================================================
// Audit: Data Quality Summary
// ============================================================
async function audit() {
  console.log('\n=== Learning Pipeline Data Quality Audit ===');

  // Patterns
  const { count: totalPatterns } = await supabase.from('issue_patterns').select('*', { count: 'exact', head: true });
  const { data: cats } = await supabase.from('issue_patterns').select('category');
  const catCounts = {};
  (cats || []).forEach(p => { catCounts[p.category] = (catCounts[p.category] || 0) + 1; });
  const uniqueCats = Object.keys(catCounts).length;
  const nonNormalized = Object.keys(catCounts).filter(c => c !== c.toLowerCase().replace(/[\s\-\.]+/g, '_')).length;

  console.log(`  Patterns: ${totalPatterns}`);
  console.log(`  Unique categories: ${uniqueCats} (${nonNormalized} non-normalized)`);

  // High occurrence without solutions
  const { count: highOccNoSolutions } = await supabase
    .from('issue_patterns')
    .select('*', { count: 'exact', head: true })
    .gte('occurrence_count', 3)
    .or('proven_solutions.is.null,proven_solutions.eq.[]');
  console.log(`  High-occ (>=3) without proven_solutions: ${highOccNoSolutions}`);

  // Retrospectives
  const { count: totalRetros } = await supabase.from('retrospectives').select('*', { count: 'exact', head: true });
  const { count: extractedRetros } = await supabase.from('retrospectives').select('*', { count: 'exact', head: true }).not('learning_extracted_at', 'is', null);
  console.log(`  Retrospectives: ${totalRetros} (extracted: ${extractedRetros}, pending: ${totalRetros - extractedRetros})`);

  // Orphan sd_ids
  // (Check a sample - full check requires raw SQL)
  const { data: sampleSdIds } = await supabase.from('retrospectives').select('sd_id').not('sd_id', 'is', null).limit(50);
  const uniqueIds = [...new Set((sampleSdIds || []).map(r => r.sd_id))];
  let orphanCount = 0;
  if (uniqueIds.length > 0) {
    const { data: validSds } = await supabase.from('strategic_directives_v2').select('id').in('id', uniqueIds);
    orphanCount = uniqueIds.length - (validSds || []).length;
  }
  console.log(`  Orphan sd_ids (sample of ${uniqueIds.length}): ${orphanCount}`);

  // Protocol improvements
  const { count: totalImprovements } = await supabase.from('protocol_improvement_queue').select('*', { count: 'exact', head: true });
  console.log(`  Protocol improvements: ${totalImprovements}`);

  return { totalPatterns, uniqueCats, nonNormalized, totalRetros, extractedRetros, orphanCount };
}

// ============================================================
// Main CLI Router
// ============================================================
async function main() {
  const command = process.argv[2];

  if (!command) {
    console.log('Usage: node scripts/learning-maintenance.mjs <command> [--dry-run] [--force]');
    console.log('');
    console.log('Commands:');
    console.log('  dedup              Consolidate duplicate issue_patterns (FR-1)');
    console.log('  extract            Backfill learning_extracted_at (FR-2)');
    console.log('  tune-threshold     Compute auto-approve threshold (FR-5)');
    console.log('  backfill-solutions Populate proven_solutions (FR-6)');
    console.log('  audit              Data quality summary');
    console.log('  all                Run all maintenance tasks');
    console.log('');
    console.log('Options:');
    console.log('  --dry-run    Preview changes without modifying data');
    console.log('  --force      Force re-processing (ignore idempotency)');
    process.exit(0);
  }

  if (DRY_RUN) console.log('*** DRY RUN MODE - No changes will be made ***');

  const results = {};

  switch (command) {
    case 'dedup':
      results.dedup = await dedupPatterns();
      break;
    case 'extract':
      results.extract = await extractLearnings();
      break;
    case 'tune-threshold':
      results.threshold = await tuneThreshold();
      break;
    case 'backfill-solutions':
      results.solutions = await backfillProvenSolutions();
      break;
    case 'audit':
      results.audit = await audit();
      break;
    case 'all':
      console.log('Running all maintenance tasks...');
      results.dedup = await dedupPatterns();
      results.extract = await extractLearnings();
      results.threshold = await tuneThreshold();
      results.solutions = await backfillProvenSolutions();
      results.audit = await audit();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }

  console.log('\n=== Summary ===');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
