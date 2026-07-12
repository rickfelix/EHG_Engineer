#!/usr/bin/env node
/**
 * CLI wrapper for lib/vigilance/verify-observed-migration.js (FR-1).
 * Read-only status report — never applies or re-authors the migration.
 * Exit 0 always (status report, not a gate); prints applied/apply-pending.
 */
import { createDatabaseClient } from './lib/supabase-connection.js';
import { checkObservedMigrationApplied, CONSTRAINT_NAME, REQUIRED_VALUE } from '../lib/vigilance/verify-observed-migration.js';

async function main() {
  const client = await createDatabaseClient('engineer', { verify: true });
  try {
    const result = await checkObservedMigrationApplied(client);
    console.log(`Constraint: ${CONSTRAINT_NAME}`);
    console.log(`Definition: ${result.constraintDef ?? 'NOT FOUND'}`);
    console.log(`'${REQUIRED_VALUE}' present: ${result.applied ? 'YES' : 'NO'}`);
    console.log('');
    console.log(result.applied
      ? 'STATUS: APPLIED — the OBSERVED CHECK-widen is live.'
      : 'STATUS: APPLY-PENDING — database/migrations/20260623_competitive_baselines_epistemic_tag_add_observed.sql has not been applied to this database yet.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Verification failed to run (connectivity/read error, not an apply verdict):', err.message);
  process.exit(0);
});
