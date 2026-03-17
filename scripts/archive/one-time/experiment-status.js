#!/usr/bin/env node
/**
 * CLI: Show experiment status
 *
 * Usage: node scripts/experiment-status.js [--status running] [--id <experiment-id>]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { listExperiments, getExperiment } from '../lib/eva/experiments/experiment-manager.js';
import { getExperimentAssignments } from '../lib/eva/experiments/experiment-assignment.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const filterStatus = getArg('--status');
const experimentId = getArg('--id');
const deps = { supabase, logger: console };

async function main() {
  if (experimentId) {
    const experiment = await getExperiment(deps, experimentId);
    const assignments = await getExperimentAssignments(deps, experimentId);

    // Count per variant
    const variantCounts = {};
    for (const a of assignments) {
      variantCounts[a.variant_key] = (variantCounts[a.variant_key] || 0) + 1;
    }

    console.log('═══════════════════════════════════════════════');
    console.log('   EXPERIMENT DETAIL');
    console.log('═══════════════════════════════════════════════');
    console.log(`   ID: ${experiment.id}`);
    console.log(`   Name: ${experiment.name}`);
    console.log(`   Hypothesis: ${experiment.hypothesis}`);
    console.log(`   Status: ${experiment.status.toUpperCase()}`);
    console.log(`   Created: ${experiment.created_at}`);
    if (experiment.started_at) console.log(`   Started: ${experiment.started_at}`);
    if (experiment.ended_at) console.log(`   Ended: ${experiment.ended_at}`);
    console.log(`\n   Assignments: ${assignments.length} total`);
    for (const [key, count] of Object.entries(variantCounts)) {
      console.log(`      ${key}: ${count}`);
    }
    console.log('═══════════════════════════════════════════════');
    return;
  }

  const experiments = await listExperiments(deps, { status: filterStatus || undefined });

  if (!experiments.length) {
    console.log('No experiments found' + (filterStatus ? ` with status '${filterStatus}'` : ''));
    return;
  }

  console.log('═══════════════════════════════════════════════');
  console.log('   EXPERIMENTS');
  console.log('═══════════════════════════════════════════════');

  for (const exp of experiments) {
    const variantKeys = exp.variants.map(v => v.key).join(', ');
    const statusBadge = exp.status.toUpperCase().padEnd(8);
    console.log(`\n   [${statusBadge}] ${exp.name}`);
    console.log(`      ID: ${exp.id}`);
    console.log(`      Variants: ${variantKeys}`);
    console.log(`      Created: ${exp.created_at}`);
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log(`   Total: ${experiments.length}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
