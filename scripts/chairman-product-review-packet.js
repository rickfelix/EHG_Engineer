#!/usr/bin/env node
// chairman-product-review-packet.js — print the chairman-facing product-review packet for a
// venture (FR-2). Read-only: generateReviewPacket only SELECTs; this never mints a decision or
// sends an email (use /leo or the normal stage-23 walk for that — see requestProductReview).
//
//   node scripts/chairman-product-review-packet.js <venture-id> [--json]
//
// SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { generateReviewPacket } from '../lib/eva/chairman-product-review.js';
import { armCliTeardown } from '../lib/cli-graceful-exit.js';

const [ventureId, ...rest] = process.argv.slice(2);
const asJson = rest.includes('--json');

if (!ventureId) {
  console.error('Usage: node scripts/chairman-product-review-packet.js <venture-id> [--json]');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const packet = await generateReviewPacket(supabase, ventureId);

if (packet.skipped) {
  console.error(`No packet generated: ${packet.reason}`);
  await armCliTeardown(1);
} else if (asJson) {
  console.log(JSON.stringify(packet, null, 2));
  await armCliTeardown(0);
} else {
  console.log(`\n${packet.ventureName} — Product Review Packet\n`);
  console.log(`How to see it (${packet.access.mode}):\n  ${packet.access.instructions}\n`);
  console.log('Guided tour:');
  for (const stop of packet.guidedTour) {
    console.log(`  - ${stop.stop}: ${stop.note}`);
  }
  console.log('\nOutward-facing surfaces:');
  for (const surface of packet.surfacesInventory) {
    console.log(`  - ${surface.surface}: ${surface.present ? (surface.detail || 'present') : 'not yet there'}`);
  }
  console.log('');
  await armCliTeardown(0);
}
