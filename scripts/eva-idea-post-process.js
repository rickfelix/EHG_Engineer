#!/usr/bin/env node

/**
 * EVA Idea Post-Process CLI
 * SD: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001F
 *
 * Moves evaluated items to their destination (Todoist → Processed project, YouTube → Processed playlist).
 *
 * Usage:
 *   npm run eva:ideas:post-process
 *   npm run eva:ideas:post-process -- --verbose
 */

import dotenv from 'dotenv';
dotenv.config();

import { postProcessAll } from '../lib/integrations/post-processor.js';

const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

async function main() {
  console.log('');
  console.log('='.repeat(60));
  console.log('EVA Idea Post-Processing');
  console.log('='.repeat(60));
  console.log('');

  const results = await postProcessAll({ verbose });

  console.log('');
  console.log('--- Results ---');
  console.log(`  Todoist: ${results.todoist.processed} processed, ${results.todoist.errors.length} errors`);
  console.log(`  YouTube: ${results.youtube.processed} processed, ${results.youtube.errors.length} errors`);
  console.log(`  Total:   ${results.totalProcessed} processed, ${results.totalErrors} errors`);
  console.log('');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
