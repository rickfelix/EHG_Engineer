#!/usr/bin/env node
/**
 * Coverage matrix regeneration CLI -- SD-LEO-INFRA-COVERAGE-MATRIX-SURFACE-001.
 * Usage: node scripts/coverage-matrix-regenerate.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { loadJsonConfig, regenerateCoverageMatrix } from '../lib/governance/coverage-matrix.js';
import { GAUGE_REGISTRY } from '../lib/governance/gauge-registry.js';

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!process.env.SUPABASE_POOLER_URL) {
    console.error('SUPABASE_POOLER_URL not set -- required for db_table/message_lane system-catalog introspection.');
    process.exit(1);
  }
  const pgClient = new Client({ connectionString: process.env.SUPABASE_POOLER_URL });
  await pgClient.connect();

  try {
    const exclusions = loadJsonConfig('config/coverage-matrix-exclusions.json');
    const checkerMap = loadJsonConfig('config/coverage-matrix-checker-map.json');

    console.log('=== Coverage Matrix Regeneration ===');
    const summary = await regenerateCoverageMatrix(supabase, pgClient, {
      exclusions,
      checkerMapEntries: checkerMap.entries,
      gaugeRegistry: GAUGE_REGISTRY,
    });

    console.log(`Rows upserted: ${summary.upserted}`);
    console.log(`  covered:     ${summary.covered || 0}`);
    console.log(`  unchecked:   ${summary.unchecked || 0}`);
    console.log(`  pending_dependency: ${summary.pending_dependency || 0}`);
    console.log(`Rows marked stale (vanished from source): ${summary.stale}`);
  } finally {
    await pgClient.end();
  }
}

main().catch((err) => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
