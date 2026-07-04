#!/usr/bin/env node
/**
 * scripts/bump-claim-gate-version.js — SD-LEO-INFRA-SIDE-CLAIM-ELIGIBILITY-001 (FR-1)
 *
 * Bumps chairman_dashboard_config.metadata.claim_gate_version_floor via an ATOMIC
 * jsonb_set, never a supabase-js read-whole-object-then-.update(metadata:{...spread})
 * merge -- a concurrent writer to a sibling metadata key (claim_ttl_minutes,
 * sweep_respect_inflight_agent) would otherwise lose its write (the lost-update class
 * documented in lib/coordinator/clear-coordinator-review.js). Run this whenever
 * lib/claim-guard.mjs's CLAIM_GUARD_CODE_VERSION is bumped on a gate-code merge.
 *
 * Usage: node scripts/bump-claim-gate-version.js <new-version-int>
 */
import 'dotenv/config';
import { createDatabaseClient } from './lib/supabase-connection.js';

const newVersion = parseInt(process.argv[2], 10);
if (!Number.isFinite(newVersion) || newVersion < 0) {
  console.error('Usage: node scripts/bump-claim-gate-version.js <new-version-int>');
  process.exit(1);
}

const client = await createDatabaseClient('engineer', { verify: false });
try {
  const result = await client.query(
    `UPDATE chairman_dashboard_config
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{claim_gate_version_floor}', to_jsonb($1::int))
      WHERE config_key = 'default'
      RETURNING metadata->>'claim_gate_version_floor' AS floor`,
    [newVersion]
  );
  if (result.rowCount === 0) {
    console.error('❌ chairman_dashboard_config.config_key=default row not found');
    process.exit(1);
  }
  console.log(`✅ claim_gate_version_floor bumped to ${result.rows[0].floor}`);
} finally {
  await client.end();
}
