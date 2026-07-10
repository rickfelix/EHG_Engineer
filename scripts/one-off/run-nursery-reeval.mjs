#!/usr/bin/env node
/**
 * SD-LEO-INFRA-STAGE0-ENVELOPE-REGISTRATION-001 (FR-7/FR-8)
 *
 * nursery_reeval has no standalone entry point today -- only reachable via
 * scripts/stage-zero-queue-processor.js's queue tick. This script calls
 * executeDiscoveryMode({strategy:'nursery_reeval'}) directly against the
 * corrected capability envelope, to manually re-run the 16 parked candidates
 * without needing a live queue-processor tick.
 *
 * This IS the SD's acceptance artifact: the resulting ranked slate (or the
 * traversability-failure detail if still 0/16) is what gets handed to Adam
 * for chairman packaging.
 *
 * Usage:
 *   node scripts/one-off/run-nursery-reeval.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { executeDiscoveryMode } from '../../lib/eva/stage-zero/paths/discovery-mode.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Running nursery_reeval against the corrected capability envelope...\n');

  const result = await executeDiscoveryMode(
    { strategy: 'nursery_reeval', constraints: {}, candidateCount: 20 },
    { supabase, logger: console }
  );

  if (!result) {
    console.log('\nRESULT: null -- no candidate survived the anti-goal screen or traversability gate.');
    process.exit(0);
  }

  const { raw_material, metadata } = result;
  console.log('\n=== nursery_reeval RESULT ===');
  console.log(`Traversability: ${metadata.traversability.passed}/${metadata.traversability.checked} passed, ${metadata.traversability.failed} failed, ${metadata.traversability.undeclared} undeclared`);
  console.log(`Envelope: ${metadata.traversability.envelope_count} delivered capabilities (loaded ${metadata.traversability.envelope_loaded_at})`);
  console.log(`\nTop candidate: ${result.suggested_name}`);
  console.log(`Posture: ${metadata.posture_version}`);

  console.log(`\n--- Passing candidates (${raw_material.candidates.length}) ---`);
  for (const c of raw_material.candidates) {
    console.log(`  - ${c.name} (score: ${c.composite_score ?? c.score})`);
  }

  if (raw_material.traversability_failures?.length) {
    console.log(`\n--- Still-failing candidates (${raw_material.traversability_failures.length}) ---`);
    for (const f of raw_material.traversability_failures) {
      console.log(`  - ${f.name}: missing ${f.missing.map(m => m.name).join(', ')}`);
    }
  }

  process.exit(0);
}

run().catch((err) => {
  console.error('nursery_reeval driver failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
