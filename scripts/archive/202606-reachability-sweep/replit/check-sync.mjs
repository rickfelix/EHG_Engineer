#!/usr/bin/env node
/**
 * Check GitHub for Replit commits and update venture_stage_work.
 * SD-LEO-INFRA-REPLIT-ALTERNATIVE-BUILD-001 (FR-3)
 *
 * Usage:
 *   node scripts/replit/check-sync.mjs <venture-id>
 *   node scripts/replit/check-sync.mjs <venture-id> --import   # Full re-entry flow
 *   node scripts/replit/check-sync.mjs <venture-id> --branch=replit/sprint-1
 */
import dotenv from 'dotenv';
dotenv.config();

import { checkReplitSync, updateSyncStatus } from '../../lib/eva/bridge/github-sync-watcher.js';

async function main() {
  const args = process.argv.slice(2);
  const ventureId = args.find(a => !a.startsWith('--'));
  const fullImport = args.includes('--import');
  const branch = args.find(a => a.startsWith('--branch='))?.split('=')[1];

  if (!ventureId || args.includes('--help')) {
    console.error(`
Replit Sync Checker
  Checks GitHub for Replit-built venture commits.

Usage:
  node scripts/replit/check-sync.mjs <venture-id>              Check sync status
  node scripts/replit/check-sync.mjs <id> --import             Full re-entry flow
  node scripts/replit/check-sync.mjs <id> --branch=replit/x    Check specific branch
`);
    process.exit(0);
  }

  if (fullImport) {
    const { executeReentry } = await import('../../lib/eva/bridge/replit-reentry-adapter.js');
    const result = await executeReentry(ventureId);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  }

  const result = await checkReplitSync(ventureId, { branch });
  console.log(JSON.stringify(result, null, 2));

  if (result.synced) {
    const updated = await updateSyncStatus(ventureId, result);
    console.log(updated ? '\nStage 20 advisory_data updated' : '\nFailed to update advisory_data');
  } else {
    console.log('\nNo Replit commits detected. Push from Replit first.');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
