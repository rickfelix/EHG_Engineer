#!/usr/bin/env node
/**
 * Re-enrich Existing Venture SDs
 *
 * SD-LEO-INFRA-BRIDGE-ARTIFACT-ENRICHMENT-001
 *
 * Retroactively adds artifact references and LLM-enriched descriptions
 * to existing SDs without recreating the hierarchy.
 *
 * Usage:
 *   node scripts/re-enrich-venture-sds.js <venture-id> [--dry-run]
 *
 * @example
 *   node scripts/re-enrich-venture-sds.js abc-123-def-456
 *   node scripts/re-enrich-venture-sds.js abc-123-def-456 --dry-run
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { reEnrichExistingSDs } from '../lib/eva/lifecycle-sd-bridge.js';

const ventureId = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!ventureId) {
  console.error('Usage: node scripts/re-enrich-venture-sds.js <venture-id> [--dry-run]');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

console.log(`\n🔄 Re-enriching SDs for venture: ${ventureId}`);
if (dryRun) console.log('   (DRY RUN — no changes will be made)\n');

const result = await reEnrichExistingSDs(supabase, ventureId, {
  dryRun,
  logger: console,
});

console.log('\n📊 Results:');
console.log(`   Enriched: ${result.enriched}`);
console.log(`   Skipped (already enriched): ${result.skipped}`);
if (result.errors.length > 0) {
  console.log(`   Errors: ${result.errors.length}`);
  for (const err of result.errors) {
    console.error(`     - ${err}`);
  }
}

process.exit(result.errors.length > 0 ? 1 : 0);
