#!/usr/bin/env node

/**
 * EVA Idea Evaluate CLI
 * SD: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001F
 *
 * Evaluates pending intake items through the feedback/vetting pipeline.
 *
 * Usage:
 *   npm run eva:ideas:evaluate
 *   npm run eva:ideas:evaluate -- --source todoist --limit 5
 */

import dotenv from 'dotenv';
dotenv.config();

import { evaluatePendingItems } from '../lib/integrations/evaluation-bridge.js';

const args = process.argv.slice(2);
const sourceType = (() => {
  const idx = args.indexOf('--source');
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
})();
const limit = (() => {
  const idx = args.indexOf('--limit');
  return idx >= 0 && idx + 1 < args.length ? parseInt(args[idx + 1]) : undefined;
})();
const verbose = args.includes('--verbose') || args.includes('-v');

async function main() {
  console.log('');
  console.log('='.repeat(60));
  console.log('EVA Idea Evaluation');
  console.log('='.repeat(60));
  if (sourceType) console.log(`  Source: ${sourceType}`);
  if (limit) console.log(`  Limit:  ${limit}`);
  console.log('');

  const results = await evaluatePendingItems({ sourceType, limit, verbose });

  console.log('--- Results ---');
  for (const [source, counts] of Object.entries(results)) {
    if (counts.evaluated > 0) {
      console.log(`  ${source}: ${counts.evaluated} evaluated`);
      console.log(`    Approved:       ${counts.approved}`);
      console.log(`    Rejected:       ${counts.rejected}`);
      console.log(`    Needs Revision: ${counts.needsRevision}`);
      console.log(`    Errors:         ${counts.errors}`);
    }
  }

  console.log('');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
