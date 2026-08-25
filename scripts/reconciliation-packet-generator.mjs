/**
 * reconciliation-packet-generator — freeze-then-ratify packet generator (SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 FR-4)
 *
 * Captures each real (is_demo=false) venture's current_lifecycle_stage AS-OF a single instant shared
 * across the whole packet (stamped_at is recorded ONCE per packet, not per-row). The packet is a plain
 * JSON snapshot -- no new table. reconciliation-packet-apply.mjs consumes it and reconciles it against
 * live state at apply time.
 *
 * Usage:
 *   node scripts/reconciliation-packet-generator.mjs [--out <path>] [--json]
 *
 * Exit Codes:
 *   0  Packet generated
 *   1  Env/DB error
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { assertNotCapTruncated } from '../lib/db/fetch-all-paginated.mjs';

export function buildPacket(ventures, stampedAt) {
  return {
    stamped_at: stampedAt,
    venture_count: ventures.length,
    ventures: ventures.map((v) => ({
      id: v.id,
      name: v.name,
      frozen_stage: v.current_lifecycle_stage,
    })),
  };
}

export async function generatePacket(supabase, { now } = {}) {
  // Bounded at 999 (< the PostgREST 1000-row cap) rather than left open: there is no plausible
  // scenario where the real (is_demo=false) venture count approaches this, and this read feeds a
  // downstream mutation (reconciliation-packet-apply.mjs) -- a silently truncated packet would mean
  // an incomplete ratification with nobody told. assertNotCapTruncated below is a second, explicit
  // fail-loud check at the SAME bound, in case that assumption is ever wrong.
  const { data, error } = await supabase
    .from('ventures')
    .select('id, name, current_lifecycle_stage')
    .eq('is_demo', false)
    .order('id', { ascending: true })
    .limit(999);

  if (error) {
    throw new Error(`reconciliation-packet-generator: failed to read ventures: ${error.message}`);
  }

  assertNotCapTruncated(data, { cap: 999, site: 'reconciliation-packet-generator:ventures' });

  // stamped_at is captured ONCE, after the read completes, so every row in the packet shares the
  // exact same freeze instant (FR-4 acceptance criterion). It is NOT re-derived per row.
  const stampedAt = now || new Date().toISOString();
  return buildPacket(data || [], stampedAt);
}

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
  const jsonOnly = args.includes('--json');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  let packet;
  try {
    packet = await generatePacket(supabase);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const text = JSON.stringify(packet, null, 2);
  if (outPath) {
    fs.writeFileSync(outPath, text);
    if (!jsonOnly) console.log(`Packet written: ${outPath} (${packet.venture_count} venture(s), stamped_at=${packet.stamped_at})`);
  } else {
    console.log(text);
  }
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main();
}
