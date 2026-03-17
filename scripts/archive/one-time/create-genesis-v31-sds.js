#!/usr/bin/env node

/**
 * Create Genesis Oath v3.1 Strategic Directives
 *
 * Inserts all 14 SDs for the Simulation Chamber implementation:
 * - 1 Parent SD (orchestrator)
 * - 4 Sprint SDs (Mason, Dreamcatcher, Mirror, Ritual)
 * - 9 Phase SDs (3 per sprint for Mason/Dreamcatcher/Mirror)
 *
 * Per LEO Protocol v4.3.3 and Vision Version GENESIS-V3.1
 * Target Date: February 14, 2026
 *
 * Refactored to use shared modules for SD creation utilities.
 */

import {
  getSupabaseClient,
  printHeader,
  printSeparator,
  printNextSteps,
  printErrorAndExit
} from './modules/sd-creation/index.js';

import {
  parentSD,
  masonSD,
  dreamcatcherSD,
  mirrorSD,
  ritualSD,
  masonP1,
  masonP2,
  masonP3,
  dreamP1,
  dreamP2,
  dreamP3,
  mirrorInt,
  mirrorElev,
  mirrorTest,
  INSERTION_ORDER
} from './modules/sd-creation/genesis-v31/index.js';

const GENESIS_SDS = {
  parent: parentSD,
  mason: masonSD,
  dreamcatcher: dreamcatcherSD,
  mirror: mirrorSD,
  ritual: ritualSD,
  masonP1,
  masonP2,
  masonP3,
  dreamP1,
  dreamP2,
  dreamP3,
  mirrorInt,
  mirrorElev,
  mirrorTest
};

/**
 * Main insertion function
 */
async function createGenesisSDs() {
  printHeader('GENESIS OATH v3.1 - STRATEGIC DIRECTIVE CREATION');
  console.log('Target: February 14, 2026 at 09:00 AM EST');
  console.log('Cosmic Alignment: Saturn enters Aries');
  console.log('Total SDs: 14 (1 parent, 4 sprints, 9 phases)\n');

  const supabase = getSupabaseClient();

  const results = {
    inserted: [],
    updated: [],
    failed: []
  };

  console.log('Inserting SDs in hierarchy order...\n');

  for (const key of INSERTION_ORDER) {
    const sd = GENESIS_SDS[key];

    const record = {
      id: sd.id,
      sd_key: sd.sd_key,
      sd_key: sd.sd_key,
      title: sd.title,
      description: sd.description,
      scope: sd.scope,
      rationale: sd.rationale,
      category: sd.category,
      priority: sd.priority,
      status: sd.status,
      relationship_type: sd.relationship_type,
      parent_sd_id: sd.parent_sd_id,
      sequence_rank: sd.sequence_rank,
      created_by: sd.created_by,
      version: sd.version,
      strategic_objectives: sd.strategic_objectives,
      success_criteria: sd.success_criteria,
      metadata: sd.metadata,
      dependencies: sd.dependencies,
      risks: sd.risks
    };

    try {
      const { data: _data, error } = await supabase
        .from('strategic_directives_v2')
        .upsert(record, { onConflict: 'id' })
        .select()
        .single();

      if (error) {
        console.error(`   [FAIL] ${sd.id}: ${error.message}`);
        results.failed.push({ id: sd.id, error: error.message });
      } else {
        console.log(`   [OK] ${sd.id}`);
        results.inserted.push(sd.id);
      }
    } catch (err) {
      console.error(`   [FAIL] ${sd.id}: ${err.message}`);
      results.failed.push({ id: sd.id, error: err.message });
    }
  }

  printSeparator('SUMMARY');
  console.log(`[OK] Inserted/Updated: ${results.inserted.length} SDs`);
  console.log(`[FAIL] Failed: ${results.failed.length} SDs`);

  if (results.failed.length > 0) {
    console.log('\nFailed SDs:');
    results.failed.forEach(f => console.log(`  - ${f.id}: ${f.error}`));
    process.exit(1);
  }

  printNextSteps([
    'Run validation: node scripts/validate-child-sd-completeness.js SD-GENESIS-V31-PARENT',
    'Begin execution with SD-GENESIS-V31-MASON-P1 (Dec 29)',
    'Follow LEAD->PLAN->EXEC for each SD'
  ]);

  console.log('\nSaturn enters Aries on Feb 13, 2026 at 19:11 EST');
  console.log('The Genesis Ritual awaits on Feb 14, 2026 at 09:00 AM EST\n');
}

createGenesisSDs().catch(error => {
  printErrorAndExit('Fatal error', error);
});
