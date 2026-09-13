#!/usr/bin/env node
/** CLI for lib/eva/venture-flagship-gate.js. QF-20260912-366.
 *  Usage: node scripts/eva/remeasure-venture-flagship-gate.mjs <SD-KEY> [--checked-by <id>] */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { remeasureVentureFlagshipGate } from '../../lib/eva/venture-flagship-gate.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

async function main() {
  const [sdKey, ...rest] = process.argv.slice(2);
  if (!sdKey) {
    console.error('Usage: node scripts/eva/remeasure-venture-flagship-gate.mjs <SD-KEY> [--checked-by <id>]');
    process.exit(1);
  }
  const checkedByIdx = rest.indexOf('--checked-by');
  const checkedBy = checkedByIdx >= 0 ? rest[checkedByIdx + 1] : 'venture-flagship-gate-remeasure-cli';

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const result = await remeasureVentureFlagshipGate(supabase, sdKey, { checkedBy });
  if (!result.merged) {
    console.error('FAILED:', result.error || 'merge did not affect any row');
    process.exit(1);
  }
  console.log(`Re-measured ${sdKey}: venture_gate_last_verdict = ${result.verdict}`);
}

if (isMainModule(import.meta.url)) {
  main();
}
