#!/usr/bin/env node
/**
 * capture-forward-venture — retroactive/manual invocation of the
 * collect-without-promote per-stage capture for a venture.
 * SD-LEO-INFRA-CAPTURE-FORWARD-GATE-001 (FR-1)
 *
 * Usage:
 *   node scripts/capture-forward-venture.mjs --venture <uuid> --from <n> --to <n>
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { captureVentureRetroactive } from '../lib/eva/venture-capture-forward.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--venture') out.venture = argv[++i];
    else if (argv[i] === '--from') out.from = Number(argv[++i]);
    else if (argv[i] === '--to') out.to = Number(argv[++i]);
  }
  return out;
}

async function main() {
  const { venture, from, to } = parseArgs(process.argv.slice(2));
  if (!venture || !Number.isFinite(from) || !Number.isFinite(to)) {
    console.error('Usage: node scripts/capture-forward-venture.mjs --venture <uuid> --from <n> --to <n>');
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const results = await captureVentureRetroactive(supabase, venture, from, to);
  console.log(`Captured ${results.length} stage snapshot(s) for venture ${venture}:`);
  for (const r of results) {
    console.log(`  stage ${r.lifecycle_stage} -> ${r.id}`);
  }
}

main().catch((err) => {
  console.error('capture-forward-venture failed:', err.message);
  process.exit(1);
});
