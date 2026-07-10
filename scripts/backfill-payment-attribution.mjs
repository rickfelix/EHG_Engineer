#!/usr/bin/env node
/**
 * One-shot backfill over historical ops_payment_events rows
 * (SD-LEO-INFRA-PAYMENT-RAIL-ATTRIBUTION-002, FR-5).
 *
 * Same code path as the ongoing resolver — no new resolution logic. Safe to
 * interrupt/re-run: each resolveUnattributedEvents() call is itself
 * idempotent (only touches rows still WHERE venture_id IS NULL AND
 * attribution_status IS NULL).
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { resolveUnattributedEvents } from '../lib/payments/attribution-resolver.js';

async function main() {
  const supabase = createSupabaseServiceClient();
  let totalResolved = 0;
  let totalUnattributed = 0;
  let round = 0;

  for (;;) {
    round += 1;
     
    const { processed, resolved, unattributed } = await resolveUnattributedEvents(supabase, { limit: 500 });
    totalResolved += resolved;
    totalUnattributed += unattributed;
    console.log(`[backfill] round ${round}: processed=${processed} resolved=${resolved} unattributed=${unattributed}`);
    if (processed === 0) break;
  }

  console.log(`[backfill] done. total resolved=${totalResolved} total unattributed=${totalUnattributed}`);
}

main().catch((err) => {
  console.error('[backfill] failed:', err.message);
  process.exitCode = 1;
});
