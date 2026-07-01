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
import { clearCoordinatorReview } from '../lib/coordinator/clear-coordinator-review.js';

const sdKey = process.argv[2];
if (!sdKey) {
  console.error('Usage: node scripts/clear-coordinator-review.mjs <SD-KEY>');
  process.exit(1);
}

const result = await clearCoordinatorReview(sdKey);
if (result.cleared) {
  console.log(`✅ ${sdKey}: metadata.needs_coordinator_review cleared to false — dispatch authorized.`);
} else {
  console.error(`❌ ${sdKey}: not cleared (${result.error})`);
  process.exit(1);
}
