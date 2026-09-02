#!/usr/bin/env node
/**
 * scripts/clear-coordinator-review.mjs — CLI wrapper for lib/coordinator/clear-coordinator-review.js
 * SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C (FR-2)
 *
 * CLAUDE_ADAM.md:109 documents the mechanic ("that clear IS the coordinator's dispatch
 * authorization") but no callable path existed — a review-pending SD could only be cleared
 * by hand-editing the DB. This gives the coordinator role a real, audited entrypoint.
 *
 * Usage: node scripts/clear-coordinator-review.mjs <SD-KEY>
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { clearCoordinatorReview } from '../lib/coordinator/clear-coordinator-review.js';
import { printRemainingIneligibility } from '../lib/fleet/hold-writer.js';

const sdKey = process.argv[2];
if (!sdKey) {
  console.error('Usage: node scripts/clear-coordinator-review.mjs <SD-KEY>');
  process.exit(1);
}

const result = await clearCoordinatorReview(sdKey);
if (result.cleared) {
  console.log(`✅ ${sdKey}: metadata.needs_coordinator_review cleared to false — dispatch authorized.`);
  // QF-20260902-868: clearing THIS predicate does not prove the row is claimable -- re-check every
  // axis and print any verdict that remains, so a clear that changes nothing is visible here.
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  await printRemainingIneligibility(supabase, sdKey, { logPrefix: '[clear-coordinator-review]' });
} else {
  console.error(`❌ ${sdKey}: not cleared (${result.error})`);
  process.exit(1);
}
