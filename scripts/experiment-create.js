#!/usr/bin/env node
/**
 * CLI: Create a new A/B experiment
 *
 * Usage: node scripts/experiment-create.js --name "Prompt v2 Test" --hypothesis "New prompt improves scores" --variants "control,variant_a"
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createExperiment, startExperiment } from '../lib/eva/experiments/experiment-manager.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const name = getArg('--name');
const hypothesis = getArg('--hypothesis');
const variantsStr = getArg('--variants');
const autoStart = args.includes('--start');

if (!name || !hypothesis || !variantsStr) {
  console.log('Usage: node scripts/experiment-create.js --name "..." --hypothesis "..." --variants "control,variant_a" [--start]');
  console.log('\nFlags:');
  console.log('  --name        Experiment name');
  console.log('  --hypothesis  What you expect to observe');
  console.log('  --variants    Comma-separated variant keys (min 2)');
  console.log('  --start       Auto-start the experiment after creation');
  process.exit(1);
}

const variants = variantsStr.split(',').map(key => ({
  key: key.trim(),
  label: key.trim(),
  weight: 1,
}));

const deps = { supabase, logger: console };

async function main() {
  console.log('Creating experiment...');
  const experiment = await createExperiment(deps, { name, hypothesis, variants });

  console.log(`\n   ID: ${experiment.id}`);
  console.log(`   Name: ${experiment.name}`);
  console.log(`   Status: ${experiment.status}`);
  console.log(`   Variants: ${experiment.variants.map(v => v.key).join(', ')}`);

  if (autoStart) {
    console.log('\nStarting experiment...');
    const started = await startExperiment(deps, experiment.id);
    console.log(`   Status: ${started.status}`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
