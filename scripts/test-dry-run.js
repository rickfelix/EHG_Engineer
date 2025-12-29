#!/usr/bin/env node

/**
 * Test script to demonstrate dry-run functionality
 * Usage: node scripts/test-dry-run.js [--dry-run]
 */

import DatabaseLoader, { parseFlags } from '../src/services/database-loader/index.js';

async function main() {
  const flags = parseFlags();
  console.log('Running with flags:', flags);

  const loader = new DatabaseLoader();

  // Test loading with dry-run
  console.log('\n--- Testing loadStrategicDirectives ---');
  const sds = await loader.loadStrategicDirectives(flags);
  console.log(`Result: ${flags.dryRun ? 'dry-run mode' : `${sds.length} directives loaded`}`);

  console.log('\n--- Testing loadPRDs ---');
  const prds = await loader.loadPRDs(flags);
  console.log(`Result: ${flags.dryRun ? 'dry-run mode' : `${prds.length} PRDs loaded`}`);

  console.log('\n--- Testing saveSDIPSubmission ---');
  const testSubmission = {
    id: 'test-' + Date.now(),
    status: 'draft',
    chairman_input: 'Test input',
  };
  const _saved = await loader.saveSDIPSubmission(testSubmission, flags);
  console.log(`Result: ${flags.dryRun ? 'dry-run mode' : 'submission saved'}`);

  console.log('\n✅ Test complete');
  process.exit(0);
}

main().catch(console.error);