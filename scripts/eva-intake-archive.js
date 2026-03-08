#!/usr/bin/env node
/**
 * EVA Intake Archive — Archive processed items at their source
 *
 * Todoist: Complete (check off) classified tasks via Sync API
 * YouTube: Remove from "For Processing" + add to "Processed" playlist
 *
 * Only archives items that have been classified (classified_at IS NOT NULL)
 * and not yet processed (processed_at IS NULL).
 */

import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const { postProcessAll } = await import('../lib/integrations/post-processor.js');

  const result = await postProcessAll({ verbose: true });

  console.log('');
  console.log('  Archive summary:');
  console.log(`    Todoist: ${result.todoist.processed} completed (checked off)`);
  console.log(`    YouTube: ${result.youtube.processed} moved to Processed playlist`);

  if (result.totalErrors > 0) {
    console.log(`    Errors: ${result.totalErrors}`);
    for (const e of [...result.todoist.errors, ...result.youtube.errors]) {
      console.log(`      - ${e.id}: ${e.error}`);
    }
  }
}

main().catch(err => {
  console.error('Archive error:', err.message);
  process.exit(1);
});
