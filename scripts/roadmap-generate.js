#!/usr/bin/env node
/**
 * roadmap-generate.js — Generate or incrementally update a roadmap from classified intake items
 *
 * Two modes:
 *   1. Full (no baselined roadmap): Cluster all classified items into new waves
 *   2. Incremental (baselined roadmap exists): Assign only NEW items to existing waves
 *
 * The baseline acts as a control mechanism — once approved, items are locked.
 * New weekly distills only add to existing waves, never re-cluster.
 *
 * Usage:
 *   node scripts/roadmap-generate.js                              # Auto-detect mode
 *   node scripts/roadmap-generate.js --title "Q2 Roadmap"         # Custom roadmap title
 *   node scripts/roadmap-generate.js --app ehg_engineer            # Filter by application
 *   node scripts/roadmap-generate.js --dry-run                     # Preview without writing to DB
 *   node scripts/roadmap-generate.js --full                        # Force full clustering (ignore baseline)
 *   node scripts/roadmap-generate.js --force-reassign              # Ignore wave locks (assign to any wave)
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import dotenv from 'dotenv';
import {
  clusterItems,
  loadClassifiedIntakeItems,
  loadNewIntakeItems,
  assignToExistingWaves,
} from '../lib/integrations/wave-clusterer.js';
// SD-LEO-INFRA-DISTILL-ROADMAP-SINGLE-001 (FR-1): the SAME resolver PLAN CHECK uses
// (lib/roadmap/plan-check-status.js), so distill's write path and PLAN CHECK's read path
// can never silently disagree on which roadmap is canonical. Replaces the old
// getBaselinedRoadmap() (required current_baseline_version > 0, which the real canonical
// roadmap never satisfied -- the confirmed root cause of every distill run forking a
// brand-new parallel 'EVA Intake Roadmap' instead of writing into the existing one).
import { resolveCanonicalRoadmap } from '../lib/roadmap/canonical-roadmap.js';
import { evaluateFullCreate, roadmapsToArchive, REFUSE_REASON_REQUIRED, AUDIT_SEVERITY } from '../lib/roadmap/full-create-guard.js';
// SD-LEO-INFRA-TODOIST-YOUTUBE-ROADMAP-001: map title + refuse a title-less mint at both promotion
// sites (extracted so it is unit-testable — this file self-invokes main() at load).
import { buildWaveItemRow } from '../lib/roadmap/wave-item-row.js';

dotenv.config();

const supabase = createSupabaseServiceClient();

/**
 * Load existing waves with sample item titles for context.
 * @param {string} roadmapId
 * @param {object} options
 * @param {boolean} options.respectLocks - When true, only return waves with status IN (proposed, draft)
 */
async function loadExistingWaves(roadmapId, options = {}) {
  let query = supabase
    .from('roadmap_waves')
    .select('id, title, description, sequence_rank, status')
    .eq('roadmap_id', roadmapId)
    .order('sequence_rank', { ascending: true });

  if (options.respectLocks) {
    query = query.in('status', ['proposed', 'draft']);
  }

  const { data: waves, error } = await query;

  if (error || !waves) return [];

  // Fetch a few sample titles per wave for AI context
  const result = [];
  for (const wave of waves) {
    const { data: items } = await supabase
      .from('roadmap_wave_items')
      .select('title')
      .eq('wave_id', wave.id)
      .limit(5);

    result.push({
      id: wave.id,
      title: wave.title,
      description: wave.description || '',
      sequence_rank: wave.sequence_rank,
      sample_titles: (items || []).map(i => i.title).filter(Boolean),
    });
  }

  return result;
}

async function createRoadmap(title) {
  const { data, error } = await supabase
    .from('strategic_roadmaps')
    .insert({
      title,
      status: 'draft',
      created_by: 'leo-roadmap-generate',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create roadmap: ${error.message}`);
  return data.id;
}

async function createWaves(roadmapId, waves, items) {
  const results = [];

  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];
    const { data: waveRow, error: waveErr } = await supabase
      .from('roadmap_waves')
      .insert({
        roadmap_id: roadmapId,
        sequence_rank: i,
        title: wave.title,
        description: wave.description,
        status: 'proposed',
        confidence_score: 0,
        created_by: 'leo-roadmap-generate',
      })
      .select('id')
      .single();

    if (waveErr) throw new Error(`Failed to create wave ${i}: ${waveErr.message}`);

    // Insert wave items — reference intake source directly. SD-LEO-INFRA-TODOIST-YOUTUBE-ROADMAP-001:
    // map title via buildWaveItemRow; an unusable-title item is SKIPPED and collected (loud,
    // non-fatal) rather than minted title-less — so the whole wave still lands.
    const waveItems = [];
    const titleSkips = [];
    for (const idx of wave.item_indices) {
      const item = items[idx - 1];
      if (!item) continue;
      const built = buildWaveItemRow(item, waveRow.id);
      if (built.skip) { titleSkips.push(built.source_id); continue; }
      waveItems.push(built.row);
    }
    if (titleSkips.length > 0) {
      console.warn(`  Warning: wave ${i} skipped ${titleSkips.length} title-less item(s) (unusable source title): ${titleSkips.join(', ')}`);
    }

    if (waveItems.length > 0) {
      const { error: itemErr } = await supabase
        .from('roadmap_wave_items')
        .insert(waveItems);
      if (itemErr) console.warn(`  Warning: Could not insert items for wave ${i}: ${itemErr.message}`);
    }

    results.push({ waveId: waveRow.id, title: wave.title, itemCount: waveItems.length });
  }

  return results;
}

/**
 * Create a new wave in an existing roadmap for overflow items.
 */
async function createOverflowWave(roadmapId, nextRank) {
  const { data, error } = await supabase
    .from('roadmap_waves')
    .insert({
      roadmap_id: roadmapId,
      sequence_rank: nextRank,
      title: `Wave ${nextRank + 1}: New Items`,
      description: 'Auto-created wave for items that could not be assigned to locked/approved waves.',
      status: 'proposed',
      confidence_score: 0,
      created_by: 'leo-roadmap-generate',
    })
    .select('id, title, description, sequence_rank, status')
    .single();

  if (error) throw new Error(`Failed to create overflow wave: ${error.message}`);
  return data;
}

/**
 * Validate post-clustering integrity: no orphans, no duplicates.
 */
function validateAssignmentIntegrity(newItems, assignments, existingWaves) {
  const issues = [];

  // Check for orphaned items (not assigned to any wave)
  const assignedIndices = new Set(assignments.filter(a => a.wave_index > 0).map(a => a.item_index));
  const orphaned = newItems.filter((_, i) => !assignedIndices.has(i + 1));
  if (orphaned.length > 0) {
    issues.push({ type: 'orphaned', count: orphaned.length, items: orphaned.map(i => i.title || i.id) });
  }

  // Check for duplicates (same item assigned to multiple waves)
  const seenItems = new Map();
  for (const a of assignments) {
    if (a.wave_index === 0) continue;
    const key = a.item_index;
    if (seenItems.has(key)) {
      issues.push({ type: 'duplicate', itemIndex: key, waves: [seenItems.get(key), a.wave_index] });
    }
    seenItems.set(key, a.wave_index);
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Incremental mode: assign new items to existing baselined waves.
 */
async function runIncremental(roadmap, options) {
  const { application, dryRun, respectLocks = true } = options;

  console.log(`  Mode: INCREMENTAL (baseline v${roadmap.current_baseline_version})`);
  console.log(`  Roadmap: ${roadmap.title} [${roadmap.id.substring(0, 8)}]`);
  if (respectLocks) console.log('  Wave locking: ENABLED (only proposed/draft waves eligible)');

  // Load only items not yet assigned to any wave
  const newItems = await loadNewIntakeItems(supabase, { application, limit: 500 });
  console.log(`  New items (not in any wave): ${newItems.length}`);

  if (newItems.length === 0) {
    console.log('  No new items to assign. Roadmap is up to date.');
    return;
  }

  // Show distribution of new items
  const byApp = {};
  const byIntent = {};
  for (const item of newItems) {
    byApp[item.target_application] = (byApp[item.target_application] || 0) + 1;
    byIntent[item.chairman_intent] = (byIntent[item.chairman_intent] || 0) + 1;
  }
  console.log('  By application:', Object.entries(byApp).map(([k, v]) => `${k}(${v})`).join(', '));
  console.log('  By intent:', Object.entries(byIntent).map(([k, v]) => `${k}(${v})`).join(', '));

  // Load existing waves — filtered by status when respectLocks is true
  const existingWaves = await loadExistingWaves(roadmap.id, { respectLocks });
  console.log(`  Eligible waves: ${existingWaves.length}`);

  // If no eligible waves exist (all locked/approved), create a new one
  if (existingWaves.length === 0) {
    console.log('  No eligible waves (all locked/approved). Creating new wave...');
    // Get total wave count for sequencing
    const { data: allWaves } = await supabase
      .from('roadmap_waves')
      .select('sequence_rank')
      .eq('roadmap_id', roadmap.id)
      .order('sequence_rank', { ascending: false })
      .limit(1);
    const nextRank = allWaves && allWaves.length > 0 ? allWaves[0].sequence_rank + 1 : 0;
    const newWave = await createOverflowWave(roadmap.id, nextRank);
    existingWaves.push(newWave);
    console.log(`  Created: ${newWave.title} (rank ${newWave.sequence_rank})`);
  }

  existingWaves.forEach(w => console.log(`    [${w.sequence_rank}] ${w.title} (${w.status})`));

  // AI assigns new items to existing waves
  console.log('\n  Assigning new items to eligible waves...');
  const result = await assignToExistingWaves(newItems, existingWaves);
  console.log(`  Method: ${result.method}`);

  // Post-clustering integrity validation
  const integrity = validateAssignmentIntegrity(newItems, result.assignments, existingWaves);
  if (!integrity.valid) {
    console.log('\n  Integrity validation:');
    for (const issue of integrity.issues) {
      if (issue.type === 'orphaned') {
        console.log(`    WARNING: ${issue.count} orphaned item(s) not assigned to any wave`);
      } else if (issue.type === 'duplicate') {
        console.log(`    WARNING: Item ${issue.itemIndex} assigned to multiple waves: ${issue.waves.join(', ')}`);
      }
    }
  } else {
    console.log('  Integrity validation: PASSED');
  }

  // Summarize assignments per wave
  const waveCounts = {};
  for (const a of result.assignments) {
    const waveTitle = a.wave_index > 0 ? existingWaves[a.wave_index - 1].title : 'UNMATCHED';
    waveCounts[waveTitle] = (waveCounts[waveTitle] || 0) + 1;
  }

  console.log('\n  Assignment summary:');
  for (const [title, count] of Object.entries(waveCounts)) {
    console.log(`    ${title}: +${count} items`);
  }

  if (result.unmatched.length > 0) {
    console.log(`\n  Unmatched items (${result.unmatched.length}):`);
    result.unmatched.forEach(idx => {
      const item = newItems[idx - 1];
      if (item) console.log(`    - [${item.target_application}] ${(item.title || '').slice(0, 70)}`);
    });
    console.log('  These items need manual wave assignment or a roadmap restructure.');
  }

  if (dryRun) {
    console.log('\n  [DRY RUN] No changes written to database.');
    return;
  }

  // Persist: insert new wave items into existing waves
  let inserted = 0;
  for (const a of result.assignments) {
    if (a.wave_index === 0) continue; // Skip unmatched

    const item = newItems[a.item_index - 1];
    const wave = existingWaves[a.wave_index - 1];
    if (!item || !wave) continue;

    // SD-LEO-INFRA-TODOIST-YOUTUBE-ROADMAP-001: map title + refuse a title-less mint (skip+log+continue).
    const built = buildWaveItemRow(item, wave.id);
    if (built.skip) {
      console.warn(`  Warning: skipped title-less item ${item.id} for wave ${wave.title} (unusable source title)`);
      continue;
    }

    const { error } = await supabase
      .from('roadmap_wave_items')
      .insert(built.row);

    if (error) {
      console.warn(`  Warning: Could not insert item ${item.id} into wave ${wave.title}: ${error.message}`);
    } else {
      inserted++;
    }
  }

  console.log(`\n  Inserted ${inserted} items into existing waves.`);
  if (result.unmatched.length > 0) {
    console.log(`  ${result.unmatched.length} unmatched items not inserted.`);
  }
  console.log('  Done. Review with: node scripts/roadmap-status.js');
}

/**
 * Full mode: cluster all items into new waves (original behavior).
 */
async function runFull(options) {
  const { title, application, dryRun } = options;

  console.log('  Mode: FULL CLUSTERING');

  // Load classified intake items directly from intake tables
  const items = await loadClassifiedIntakeItems(supabase, { application, limit: 500 });
  console.log(`  Classified intake items: ${items.length}`);

  if (application) {
    console.log(`  Filtered by application: ${application}`);
  }

  if (items.length === 0) {
    console.log('  No classified items found. Run classification first:');
    console.log('    npm run eva:intake:classify -- --batch');
    process.exit(0);
  }

  // Show distribution
  const byApp = {};
  const byIntent = {};
  for (const item of items) {
    byApp[item.target_application] = (byApp[item.target_application] || 0) + 1;
    byIntent[item.chairman_intent] = (byIntent[item.chairman_intent] || 0) + 1;
  }
  console.log('  By application:', Object.entries(byApp).map(([k, v]) => `${k}(${v})`).join(', '));
  console.log('  By intent:', Object.entries(byIntent).map(([k, v]) => `${k}(${v})`).join(', '));

  // Cluster into waves
  console.log('\n  Clustering into waves...');
  const result = await clusterItems(items);
  console.log(`  Method: ${result.method}`);
  console.log(`  Waves proposed: ${result.waves.length}\n`);

  result.waves.forEach((wave, i) => {
    console.log(`  Wave ${i + 1}: ${wave.title} (${wave.item_indices.length} items)`);
    console.log(`    ${wave.description}`);
    // Show first 3 items as preview
    wave.item_indices.slice(0, 3).forEach(idx => {
      const item = items[idx - 1];
      if (item) console.log(`      - [${item.source_type}] ${(item.title || '').slice(0, 60)}`);
    });
    if (wave.item_indices.length > 3) {
      console.log(`      ... and ${wave.item_indices.length - 3} more`);
    }
    console.log('');
  });

  if (dryRun) {
    console.log('  [DRY RUN] No changes written to database.');
    return;
  }

  // Persist to database
  const roadmapId = await createRoadmap(title);
  console.log(`  Roadmap created: ${roadmapId}`);

  const waveResults = await createWaves(roadmapId, result.waves, items);
  waveResults.forEach(w => {
    console.log(`  Wave: ${w.title} → ${w.itemCount} items`);
  });

  console.log('\n  Done. Review waves with: node scripts/roadmap-status.js');
  console.log(`  Approve waves with:      node scripts/roadmap-promote.js --approve --roadmap-id ${roadmapId}`);
}

async function main() {
  const args = process.argv.slice(2);
  const titleFlag = args.indexOf('--title');
  const appFlag = args.indexOf('--app');
  const dryRun = args.includes('--dry-run');
  const forceFull = args.includes('--full');
  const forceReassign = args.includes('--force-reassign');
  // --respect-locks is ON by default; --force-reassign disables it
  const respectLocks = !forceReassign;
  // SD-LEO-INFRA-ROADMAP-REGENERATION-DUPLICATES-001 FR-5: explicit override for --full when an
  // active roadmap already exists. Requires --reason, and the override is audit-logged.
  const replaceActive = args.includes('--replace-active');
  const reasonFlag = args.indexOf('--reason');
  const replaceReason = reasonFlag >= 0 ? args[reasonFlag + 1] : undefined;

  const title = titleFlag >= 0 ? args[titleFlag + 1] : 'EVA Intake Roadmap';
  const application = appFlag >= 0 ? args[appFlag + 1] : undefined;

  console.log('Roadmap Generator');
  console.log('═'.repeat(50));

  // Auto-detect mode: if the canonical roadmap exists, use incremental against it.
  // SD-LEO-INFRA-DISTILL-ROADMAP-SINGLE-001 (FR-1): the normal pipeline call (no --full)
  // NEVER falls through to runFull()/createRoadmap() anymore -- that would silently fork
  // a new parallel roadmap, the confirmed root cause this SD fixes. --full remains an
  // explicit, deliberate escape hatch for legitimate bootstrap/recluster; it is never
  // reachable from scripts/eva-intake-pipeline.js's normal Step 4 invocation.
  if (!forceFull) {
    const canonicalRoadmap = await resolveCanonicalRoadmap(supabase);
    if (canonicalRoadmap) {
      await runIncremental(canonicalRoadmap, { application, dryRun, respectLocks });
      return;
    }
    console.log('  No active (canonical) roadmap found. Refusing to auto-create one (single-writer invariant).');
    console.log('  To bootstrap the FIRST roadmap, run explicitly: node scripts/roadmap-generate.js --full');
    process.exit(1);
  }

  // SD-LEO-INFRA-ROADMAP-REGENERATION-DUPLICATES-001 FR-5: --full was an UNGUARDED escape hatch.
  // The guard above covers only the !forceFull branch, so --full could still fork a second
  // ACTIVE roadmap — and the moment two exist, resolveCanonicalRoadmap throws 'ambiguous' for
  // every reader in the codebase, which is a strictly worse failure than refusing here. A guard
  // inside one code path is not a guard on the invariant.
  //
  // --full keeps its stated purpose (bootstrap the FIRST roadmap, or recluster after the active
  // one has been archived). What it no longer does is create a second one silently.
  // *** CORRECTED AFTER ADVERSARIAL REVIEW: guarding on status='active' MISSED THE ACTUAL
  // INCIDENT. *** createRoadmap() at :88 inserts status:'draft'; the flip to 'active' happens
  // only in roadmap-manager.js:190 approveSequence, at chairman approval. So --full has never
  // been able to fork a second ACTIVE roadmap, and a guard that only asks about active roadmaps
  // cannot fire on the thing that actually happened here — two duplicate DRAFT rows (see
  // scripts/one-off/archive-duplicate-roadmaps.mjs header: "2 pre-guard duplicate draft rows").
  // Running --full twice from a bootstrap state would have reproduced a89b078b + 8ffa7fdf
  // unimpeded through my first version of this guard.
  //
  // So the predicate is "does any NON-ARCHIVED roadmap already exist", which covers both the
  // draft window and an approved plan of record.
  const { data: liveRoadmaps, error: liveErr } = await supabase
    .from('strategic_roadmaps')
    .select('id, title, status')
    .neq('status', 'archived');
  if (liveErr) {
    console.error(`  Could not check for existing roadmaps: ${liveErr.message}`);
    process.exit(1);
  }
  // Decision lives in lib/roadmap/full-create-guard.js so it can be unit-tested; this file
  // self-invokes main() at module load, so an inline predicate is unreachable from a test.
  const verdict = evaluateFullCreate(liveRoadmaps, { replaceActive, replaceReason });
  const existing = verdict.existing || [];
  if (!verdict.allow) {
    if (verdict.refusal === REFUSE_REASON_REQUIRED) {
      console.error('  --replace-active requires --reason "<why>" — the override is audit-logged.');
      process.exit(1);
    }
    const first = existing[0];
    console.error(`  REFUSING: ${existing.length} non-archived roadmap(s) already exist, e.g. ${first.id} ("${first.title}", status=${first.status}).`);
    console.error('  --full bootstraps the FIRST roadmap. A second one forks the plan of record:');
    console.error('  a duplicate DRAFT is exactly what happened on 2026-07-17 (a89b078b, 8ffa7fdf),');
    console.error('  and if one is later approved you get two active rows, at which point every');
    console.error('  reader resolving through resolveCanonicalRoadmap() throws rather than guess.');
    console.error('');
    console.error('  To recluster: archive the current roadmap first, then re-run --full.');
    console.error('  To replace deliberately: --full --replace-active --reason "<why>"');
    process.exit(1);
  }

  const overrideTargets = verdict.override ? roadmapsToArchive(existing) : [];
  if (verdict.override) {
    console.log(`  OVERRIDE: --replace-active will archive ${overrideTargets.length} roadmap(s) AFTER the new one is created — reason: ${replaceReason}`);
  }

  // *** CREATE FIRST, ARCHIVE AFTER. *** The EXEC security review found that archiving first was
  // a data-loss path, not merely an ordering preference: runFull() calls process.exit(0) at :339
  // when there are no classified intake items — a NORMAL state, since classification is a
  // separate prior step. So `--full --replace-active` against an empty queue archived EVERY
  // roadmap including the plan of record, created nothing, and exited 0. There is no transaction
  // here, so ordering is the only atomicity available: if creation does not happen, the archive
  // must not either.
  await runFull({ title, application, dryRun });

  if (verdict.override) {
    if (dryRun) {
      console.log(`  [DRY-RUN] would archive after creation: ${overrideTargets.join(', ')}`);
    } else {
      // *** THE AUDIT ROW GATES THE ARCHIVE. *** Previously this was best-effort in a try/catch,
      // which was dead code twice over: supabase-js RETURNS {error} rather than throwing, and the
      // severity value I used ('high') violates audit_log_severity_check. Net effect: the
      // override wrote NO audit row, silently, while printing "Archived N roadmap(s)". Live probe
      // confirms 0 rows in audit_log with entity_type='strategic_roadmaps' out of 241,139.
      // An unauditable destructive action is worse than a failed one, so a failed audit now
      // REFUSES rather than continuing.
      const { error: auditErr } = await supabase.from('audit_log').insert({
        event_type: 'ROADMAP_FULL_REPLACE_ACTIVE',
        entity_type: 'strategic_roadmaps',
        entity_id: overrideTargets[0],
        severity: AUDIT_SEVERITY,
        // USER before USERNAME: USERNAME is Windows-only, so a POSIX run without a session id
        // recorded 'unknown' and the audit row lost its actor (SEC-5b).
        created_by: `roadmap-generate:${process.env.CLAUDE_SESSION_ID || process.env.USER || process.env.USERNAME || 'unknown'}`,
        metadata: {
          sd: 'SD-LEO-INFRA-ROADMAP-REGENERATION-DUPLICATES-001',
          replaced_roadmap_ids: overrideTargets,
          reason: replaceReason,
        },
      });
      if (auditErr) {
        console.error(`  REFUSING to archive: the audit row could not be written (${auditErr.message}).`);
        console.error('  The new roadmap HAS been created; the previous one(s) are untouched.');
        console.error(`  Resolve the audit failure, then archive manually: ${overrideTargets.join(', ')}`);
        process.exit(1);
      }

      const { error: archErr } = await supabase
        .from('strategic_roadmaps')
        .update({ status: 'archived' })
        .in('id', overrideTargets);
      if (archErr) {
        console.error(`  Could not archive the previous roadmap(s): ${archErr.message}`);
        console.error(`  The new roadmap exists; archive these manually: ${overrideTargets.join(', ')}`);
        process.exit(1);
      }
      console.log(`  Archived ${overrideTargets.length} roadmap(s): ${overrideTargets.join(', ')}`);
    }
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
