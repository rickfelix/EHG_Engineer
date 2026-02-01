#!/usr/bin/env node
/**
 * Feature Flag Expiry Checker
 * SD-LEO-SELF-IMPROVE-001K - Phase 6: Feature Flag Governance
 *
 * This job runs on a schedule (recommended: every 15 minutes via cron or PM2)
 * to transition expired temporary flags to the 'expired' lifecycle state.
 *
 * FR-3 Requirement: "A scheduled job runs at least every 15 minutes and
 * transitions eligible flags to lifecycle_state=expired when now() >= expiry_at,
 * writing an audit event for each transition"
 *
 * Usage:
 *   node scripts/jobs/feature-flag-expiry-checker.js
 *
 * Cron setup (every 15 minutes):
 *   0,15,30,45 [CRON] cd /path/to/project && node scripts/jobs/feature-flag-expiry-checker.js
 *
 * @module scripts/jobs/feature-flag-expiry-checker
 */

import 'dotenv/config';
import { processExpiredFlags, getExpiredFlags } from '../../lib/feature-flags/registry.js';

async function main() {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  console.log(`[${timestamp}] Feature Flag Expiry Checker started`);

  try {
    // Check how many flags are eligible for expiry
    const expiredFlags = await getExpiredFlags();

    if (expiredFlags.length === 0) {
      console.log(`[${timestamp}] No flags eligible for expiry transition`);
      return;
    }

    console.log(`[${timestamp}] Found ${expiredFlags.length} flag(s) to expire:`);
    expiredFlags.forEach(flag => {
      console.log(`  - ${flag.flag_key} (expiry_at: ${flag.expiry_at})`);
    });

    // Process the expired flags
    const processedCount = await processExpiredFlags();

    const duration = Date.now() - startTime;
    console.log(`[${timestamp}] Processed ${processedCount} expired flag(s) in ${duration}ms`);

  } catch (error) {
    console.error(`[${timestamp}] ERROR: ${error.message}`);
    process.exit(1);
  }
}

main();
