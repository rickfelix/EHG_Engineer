#!/usr/bin/env node

/**
 * Backfill Uncovered Architecture Phases
 * Part of SD-LEO-ORCH-ARCHITECTURE-PHASE-COVERAGE-001-D
 *
 * Scans eva_architecture_plans for phases without corresponding completed SDs
 * and creates roadmap_wave_items records for persistent visibility in sd:next.
 *
 * Usage:
 *   node scripts/backfill-uncovered-phases.js              # Execute backfill
 *   node scripts/backfill-uncovered-phases.js --dry-run     # Preview only
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { validatePhaseCoverage } from './modules/handoff/validation/phase-coverage-validator.js';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const isDryRun = process.argv.includes('--dry-run');

async function backfillUncoveredPhases() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(' BACKFILL: Uncovered Architecture Phases → roadmap_wave_items');
  console.log(`  Mode: ${isDryRun ? 'DRY RUN (no writes)' : 'EXECUTE'}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // 1. Get all architecture plans with structured phases
  const { data: plans, error: plansError } = await supabase
    .from('eva_architecture_plans')
    .select('plan_key, vision_key, sections')
    .not('sections', 'is', null);

  if (plansError) {
    console.error('Error loading architecture plans:', plansError.message);
    process.exit(1);
  }

  if (!plans || plans.length === 0) {
    console.log('No architecture plans found.');
    return;
  }

  console.log(`Found ${plans.length} architecture plan(s)\n`);

  let totalPlans = 0;
  let totalPhases = 0;
  let totalUncovered = 0;
  let totalCreated = 0;
  let totalSkipped = 0;

  for (const plan of plans) {
    const phases = plan.sections?.implementation_phases;
    if (!phases || !Array.isArray(phases) || phases.length === 0) continue;
    // Skip plans with very large phase arrays (raw text data, not structured)
    if (phases.length > 50) {
      console.log(`  Skipping ${plan.plan_key}: ${phases.length} phases (likely raw text)`);
      continue;
    }

    totalPlans++;
    totalPhases += phases.length;

    // 2. Get SDs linked to this architecture plan
    const { data: sds } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, parent_sd_id')
      .or(`metadata->>arch_key.eq.${plan.plan_key},metadata->>architecture_plan_key.eq.${plan.plan_key}`);

    // Also get children of any orchestrators
    let allSds = sds || [];
    const orchKeys = allSds.map(sd => sd.sd_key).filter(Boolean);
    if (orchKeys.length > 0) {
      const { data: orchUuids } = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_key')
        .in('sd_key', orchKeys);

      if (orchUuids && orchUuids.length > 0) {
        const uuids = orchUuids.map(o => o.id);
        const { data: children } = await supabase
          .from('strategic_directives_v2')
          .select('sd_key, title, status, parent_sd_id')
          .in('parent_sd_id', uuids);

        if (children) allSds = [...allSds, ...children];
      }
    }

    // 3. Validate coverage using the shared validator
    const report = validatePhaseCoverage(phases, allSds);

    if (report.uncovered.length === 0) {
      console.log(`  ${plan.plan_key}: ${report.totalPhases} phases, all covered`);
      continue;
    }

    console.log(`  ${plan.plan_key}: ${report.uncovered.length}/${report.totalPhases} uncovered`);

    // 4. Check which uncovered phases already have roadmap_wave_items
    const existingIds = [];
    for (const { phase } of report.uncovered) {
      const sourceId = `${plan.plan_key}:phase-${phase.number || 'unknown'}`;
      existingIds.push(sourceId);
    }

    const { data: existing } = await supabase
      .from('roadmap_wave_items')
      .select('source_id')
      .eq('source_type', 'architecture_phase')
      .in('source_id', existingIds);

    const existingSet = new Set((existing || []).map(e => e.source_id));

    // 5. Create roadmap_wave_items for truly new uncovered phases
    for (const { phase } of report.uncovered) {
      const sourceId = `${plan.plan_key}:phase-${phase.number || 'unknown'}`;
      totalUncovered++;

      if (existingSet.has(sourceId)) {
        totalSkipped++;
        console.log(`    - Phase ${phase.number}: ${phase.title} (already tracked)`);
        continue;
      }

      const item = {
        id: randomUUID(),
        source_type: 'architecture_phase',
        source_id: sourceId,
        title: phase.title || `Phase ${phase.number}`,
        promoted_to_sd_key: null,
        metadata: {
          phase_number: phase.number,
          phase_title: phase.title,
          child_designation: phase.child_designation,
          source_plan_key: plan.plan_key,
          source_plan_title: plan.plan_key,
          vision_key: plan.vision_key,
          backfill_date: new Date().toISOString()
        }
      };

      if (isDryRun) {
        console.log(`    + Phase ${phase.number}: ${phase.title} (would create)`);
      } else {
        const { error: insertError } = await supabase
          .from('roadmap_wave_items')
          .insert(item);

        if (insertError) {
          console.error(`    ! Phase ${phase.number}: ${phase.title} — ERROR: ${insertError.message}`);
        } else {
          console.log(`    + Phase ${phase.number}: ${phase.title} (created)`);
          totalCreated++;
        }
      }
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(' SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  Plans scanned:       ${totalPlans}`);
  console.log(`  Total phases:        ${totalPhases}`);
  console.log(`  Uncovered phases:    ${totalUncovered}`);
  console.log(`  Already tracked:     ${totalSkipped}`);
  if (isDryRun) {
    console.log(`  Would create:        ${totalUncovered - totalSkipped}`);
    console.log('\n  Run without --dry-run to create roadmap_wave_items');
  } else {
    console.log(`  Created:             ${totalCreated}`);
  }
  console.log('═══════════════════════════════════════════════════════════════════');
}

backfillUncoveredPhases().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
