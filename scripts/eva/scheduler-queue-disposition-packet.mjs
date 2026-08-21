#!/usr/bin/env node
// scheduler-queue-disposition-packet.mjs — print the chairman-facing "stale-active"
// eva_scheduler_queue disposition packet (FR-3). Read-only: computeStaleActiveQueueDisposition
// only SELECTs; this never cancels, purges, or re-arms a row. Idempotent — re-running against
// live data regenerates the packet, it does not consume or mark anything.
//
//   node scripts/eva/scheduler-queue-disposition-packet.mjs [--json]
//
// Delivery to the chairman uses the existing coordinator/Adam advisory relay (e.g.
// `node scripts/worker-signal.cjs feedback "<packet text>"`), matching this repo's established
// pattern for chairman-facing reports (see scripts/chairman-product-review-packet.js) rather
// than building a new send integration for a single-purpose packet.
//
// SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { computeStaleActiveQueueDisposition, renderStaleActiveQueuePacket } from '../../lib/eva/scheduler-queue-disposition.js';

const asJson = process.argv.slice(2).includes('--json');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const packet = await computeStaleActiveQueueDisposition(supabase);

if (asJson) {
  console.log(JSON.stringify(packet, null, 2));
} else {
  console.log(renderStaleActiveQueuePacket(packet));
}
