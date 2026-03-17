#!/usr/bin/env node
/**
 * CLI: Analyze experiment results using Bayesian statistics
 *
 * Usage: node scripts/experiment-results.js --id <experiment-id> [--stop]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getExperiment, stopExperiment } from '../lib/eva/experiments/experiment-manager.js';
import { getExperimentOutcomes } from '../lib/eva/experiments/dual-evaluator.js';
import { analyzeExperiment, generateReport } from '../lib/eva/experiments/bayesian-analyzer.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const experimentId = getArg('--id');
const autoStop = args.includes('--stop');

if (!experimentId) {
  console.log('Usage: node scripts/experiment-results.js --id <experiment-id> [--stop]');
  console.log('\nFlags:');
  console.log('  --id     Experiment UUID');
  console.log('  --stop   Auto-stop the experiment if analysis recommends stopping');
  process.exit(1);
}

const deps = { supabase, logger: console };

async function main() {
  const experiment = await getExperiment(deps, experimentId);
  const outcomes = await getExperimentOutcomes(deps, experimentId);

  if (!outcomes.length) {
    console.log(`No outcomes recorded for experiment '${experiment.name}'`);
    console.log('Run some ventures through Stage 0 while the experiment is active.');
    return;
  }

  const analysis = analyzeExperiment(deps, { experiment, outcomes });
  console.log(generateReport(analysis));

  if (autoStop && analysis.stopping?.shouldStop && experiment.status === 'running') {
    console.log('\nStopping experiment based on analysis...');
    await stopExperiment(deps, experimentId);
    console.log('Experiment stopped.');

    if (analysis.stopping.winner) {
      console.log(`\nWinner: ${analysis.stopping.winner}`);
      console.log('Consider updating the default prompt configuration to use the winning variant.');
    }
  }

  // Output machine-readable JSON for pipeline integration
  if (args.includes('--json')) {
    console.log('\n--- JSON ---');
    console.log(JSON.stringify(analysis, null, 2));
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
