#!/usr/bin/env node
/**
 * Backfill Architecture Plan Sections
 * Part of SD-LEO-INFRA-ARCHITECTURE-PHASE-COVERAGE-001
 *
 * One-time idempotent script: reads existing architecture plans with NULL sections,
 * extracts phases from content using parsePhases(), and populates the sections column.
 * Skips plans that already have non-null sections.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { parsePhases } from '../../create-orchestrator-from-plan.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('🔄 Backfilling architecture plan sections...\n');

  const { data: plans, error } = await supabase
    .from('eva_architecture_plans')
    .select('id, plan_key, content, sections')
    .is('sections', null)
    .not('content', 'is', null);

  if (error) {
    console.error('❌ Query failed:', error.message);
    process.exit(1);
  }

  console.log(`   Found ${plans.length} plan(s) with NULL sections\n`);

  let updated = 0;
  let skipped = 0;

  for (const plan of plans) {
    const phases = parsePhases(plan.content);

    if (phases.length === 0) {
      console.log(`   ⏭️  ${plan.plan_key}: No phases found — skipping`);
      skipped++;
      continue;
    }

    const sections = {
      implementation_phases: phases.map(p => ({
        number: p.number,
        title: p.title,
        description: p.description || '',
        child_designation: 'child',
        covered_by_sd_key: null,
        deliverables: [],
        estimate_loc: null
      })),
      extracted_at: new Date().toISOString(),
      extraction_source: 'backfill'
    };

    const { error: updateError } = await supabase
      .from('eva_architecture_plans')
      .update({ sections })
      .eq('id', plan.id);

    if (updateError) {
      console.log(`   ❌ ${plan.plan_key}: Update failed — ${updateError.message}`);
    } else {
      console.log(`   ✅ ${plan.plan_key}: ${phases.length} phase(s) extracted`);
      updated++;
    }
  }

  console.log(`\n📊 Backfill complete: ${updated} updated, ${skipped} skipped (no phases)`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
