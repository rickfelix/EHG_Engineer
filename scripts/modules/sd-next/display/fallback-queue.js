/**
 * Fallback Queue Display for SD-Next
 * Part of SD-LEO-REFACTOR-SD-NEXT-001
 */

import { colors } from '../colors.js';
import { checkDependenciesResolved } from '../dependency-resolver.js';
import { displayTrackSection } from './tracks.js';
import { rankItems } from '../rank-items.js';
import { classifyQuickFixes } from './quick-fixes.js';

/**
 * Show fallback queue when no baseline is active.
 *
 * SD-LEO-INFRA-UNIFY-QUICK-FIX-001:
 *   - Phase 2: delegates ranking to rank-items.js so urgency, vision gap,
 *     OKR blend, and policy boost apply in no-baseline mode.
 *   - Phase 3: interleaves Quick Fixes with SDs in their inferred tracks
 *     via rank-items.js, removing the separate OPEN QUICK FIXES section.
 *     Returns a summary the orchestrator uses for AUTO_PROCEED_ACTION.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} options  - { skipBaselineWarning, sessionContext, openQuickFixes, qfTriageResults }
 * @returns {Promise<Object>} qfSummary with topStartableQF (or empty summary if no QFs passed)
 */
export async function showFallbackQueue(supabase, options = {}) {
  const {
    skipBaselineWarning = false,
    sessionContext = {},
    openQuickFixes = [],
    qfTriageResults = new Map(),
  } = options;

  // Load configurable OKR blend weight (shared with baseline path).
  let okrBlendWeight = 0.30;
  try {
    const { data: configRow } = await supabase
      .from('chairman_dashboard_config')
      .select('metadata')
      .eq('config_key', 'default')
      .single();
    if (configRow?.metadata?.okr_blend_weight != null) {
      okrBlendWeight = Number(configRow.metadata.okr_blend_weight);
    }
  } catch { /* non-fatal */ }

  // No baseline — use strategic_directives_v2.sequence_rank + category as baseline substitutes.
  // Column list mirrors what rankItems() reads: sequence_rank, category, metadata, vision_*, venture_id.
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, priority, status, sequence_rank, progress_percentage, dependencies, metadata, is_working_on, parent_sd_id, category, vision_score, vision_origin_score_id, venture_id')
    .eq('is_active', true)
    .in('status', ['draft', 'lead_review', 'plan_active', 'exec_active', 'active', 'in_progress'])
    .in('priority', ['critical', 'high', 'medium'])
    .order('sequence_rank', { nullsFirst: false })
    .limit(15);

  if (error || !sds || sds.length === 0) {
    console.log(`${colors.red}No prioritized SDs found. Run: npm run sd:baseline to create one.${colors.reset}`);
    return;
  }

  // Batch-load OKR alignment scores. Map shape: sd_uuid -> score (0-90).
  const okrScoreMap = new Map();
  try {
    const sdUUIDs = sds.map(s => s.id);
    const { data: krAlignments } = await supabase
      .from('sd_key_result_alignment')
      .select('sd_id, key_result_id, contribution_type, contribution_weight, key_results!inner(id, status)')
      .in('sd_id', sdUUIDs);

    if (krAlignments && krAlignments.length > 0) {
      const KR_URGENCY = { off_track: 3.0, at_risk: 2.0, on_track: 1.0, achieved: 0.0 };
      const CONTRIB = { direct: 1.5, enabling: 1.0, supporting: 0.5 };
      const bySD = new Map();
      for (const a of krAlignments) {
        if (!bySD.has(a.sd_id)) bySD.set(a.sd_id, []);
        bySD.get(a.sd_id).push(a);
      }
      for (const [sdId, alignments] of bySD) {
        let total = 0;
        for (const a of alignments) {
          const urgency = KR_URGENCY[a.key_results?.status] ?? 1.0;
          const contrib = CONTRIB[a.contribution_type] ?? 0.5;
          total += 10 * urgency * contrib * (a.contribution_weight ?? 1.0);
        }
        okrScoreMap.set(sdId, Math.min(total, 90));
      }
    }
  } catch { /* non-fatal */ }

  // Pre-enrich SDs with async dependency resolution (rankItems() is pure).
  const enrichedSDs = [];
  for (const sd of sds) {
    const depsResolved = await checkDependenciesResolved(supabase, sd.dependencies);
    enrichedSDs.push({ ...sd, deps_resolved: depsResolved });
  }

  // Phase 3: classify QFs (computes escalation + claim badges, returns summary
  // for AUTO_PROCEED_ACTION routing), tag with kind='qf', and feed into the
  // same ranking call so QFs interleave with SDs in their inferred tracks.
  const { summary: qfSummary, classified: classifiedQFs } = classifyQuickFixes(
    openQuickFixes, qfTriageResults, sessionContext
  );
  const qfItems = classifiedQFs.map(qf => ({ ...qf, kind: 'qf' }));

  // Pure ranking: no baseline map — empty Map signals fallback mode.
  // rank-items resolves sequence_rank from the SD row and track from
  // metadata/category, and routes QFs via their severity + type.
  const { tracks } = rankItems([...enrichedSDs, ...qfItems], {
    baselineItemsMap: new Map(),
    okrScoreMap,
    okrBlendWeight,
  });

  // Display tracks (shared shape with baseline path). Must await — displaySDItem
  // runs async claim checks that otherwise interleave output with later sections.
  await displayTrackSection('A', 'Infrastructure/Safety', tracks.A, sessionContext);
  await displayTrackSection('B', 'Feature/Stages', tracks.B, sessionContext);
  await displayTrackSection('C', 'Quality', tracks.C, sessionContext);
  if (tracks.STANDALONE.length > 0) {
    await displayTrackSection('STANDALONE', 'Standalone (No Dependencies)', tracks.STANDALONE, sessionContext);
  }

  console.log(`\n${colors.bold}${colors.green}RECOMMENDED STARTING POINTS:${colors.reset}`);

  const workingOn = sds.find(s => s.is_working_on);
  if (workingOn) {
    console.log(`${colors.bgYellow}${colors.bold} CONTINUE ${colors.reset} ${workingOn.sd_key || workingOn.id} - ${workingOn.title}`);
    console.log(`${colors.dim}   (Marked as "Working On" in UI)${colors.reset}`);
  }

  // Show top ready SD per track.
  for (const [trackKey, trackSDs] of Object.entries(tracks)) {
    const ready = trackSDs.find(s => s.deps_resolved && !s.is_working_on);
    if (ready) {
      const trackLabel = `Track ${trackKey}`;
      console.log(`${colors.green}  ${trackLabel}:${colors.reset} ${ready.sd_key || ready.id} - ${ready.title.substring(0, 50)}...`);
    }
  }

  console.log(`\n${colors.dim}To begin: "I'm working on <SD-ID>"${colors.reset}`);

  if (!skipBaselineWarning) {
    displayNoBaselineWarning();
  }

  return qfSummary;
}

/**
 * Show message when baseline exists but all items are completed
 *
 * @param {Object} baseline - The baseline object
 * @param {Array} baselineItems - The baseline items
 */
export function showExhaustedBaselineMessage(baseline, baselineItems) {
  const completedCount = baselineItems.length;

  console.log(`${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.green}${colors.bold}✓ BASELINE COMPLETE${colors.reset}\n`);
  console.log(`  All ${completedCount} SDs in the current baseline are completed!`);
  console.log(`  ${colors.dim}Baseline ID: ${baseline.id.substring(0, 8)}...${colors.reset}\n`);

  console.log(`${colors.cyan}OPTIONS:${colors.reset}`);
  console.log(`  1. ${colors.bold}Continue with available SDs${colors.reset} (shown below)`);
  console.log(`  2. ${colors.bold}Create new baseline:${colors.reset} npm run sd:baseline`);
  console.log(`  3. ${colors.bold}Deactivate old baseline:${colors.reset} npm run sd:baseline:deactivate\n`);

  // Show completed baseline items summary
  console.log(`${colors.dim}Completed baseline items:${colors.reset}`);
  for (const item of baselineItems.slice(0, 5)) {
    console.log(`${colors.dim}  ✓ ${item.sd_id}${colors.reset}`);
  }
  if (baselineItems.length > 5) {
    console.log(`${colors.dim}  ... and ${baselineItems.length - 5} more${colors.reset}`);
  }
  console.log();
}

/**
 * Display warning when no baseline is active
 */
function displayNoBaselineWarning() {
  console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.yellow}${colors.bold}⚠️  NO ACTIVE BASELINE${colors.reset}`);
  console.log(`${colors.dim}A baseline captures your execution plan with sequence and track assignments.${colors.reset}`);
  console.log(`${colors.dim}Without one, SDs are ordered by sequence_rank only.${colors.reset}\n`);
  console.log(`${colors.cyan}To create a baseline:${colors.reset}`);
  console.log(`  ${colors.bold}npm run sd:baseline${colors.reset}        ${colors.dim}Create execution baseline${colors.reset}`);
  console.log(`  ${colors.bold}npm run sd:baseline view${colors.reset}   ${colors.dim}View current baseline${colors.reset}`);
}
