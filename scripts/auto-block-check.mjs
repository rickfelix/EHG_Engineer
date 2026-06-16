#!/usr/bin/env node
/**
 * SD-LEO-INFRA-UNBLOCK-PORTFOLIO-WIDE-001 (FR-3) — CLI for the auto_block_on_match consumer.
 * Makes lib/governance/auto-block-consumer.js reachable from a live entry point (no dark seam)
 * and is the first reader of the previously-inert flag.
 *
 * ADVISORY by default. Enforcement requires BOTH env LEO_AUTO_BLOCK_ENFORCE=on AND a pattern
 * with explicit narrow block_signatures matched in --context. Exits 2 ONLY when blocked.
 *
 * Usage:
 *   node scripts/auto-block-check.mjs [--context "<text>"] [--enforce]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { runAutoBlockCheck } from '../lib/governance/auto-block-consumer.js';

async function main() {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--context');
  const context = ci >= 0 ? (args[ci + 1] || '') : '';
  const enforce = args.includes('--enforce') ? true : undefined; // undefined -> resolve from env
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
  const supabase = createClient(url, key);
  const r = await runAutoBlockCheck({ supabase, context, enforce });
  console.log(JSON.stringify(r, null, 2));
  if (r.verdict === 'ADVISE' && r.enabledCount > 0) {
    console.log(`\nℹ️  Advisory: ${r.enabledCount} high-signal pattern(s) active. Review your change against their prevention checklists.`);
  }
  process.exit(r.blocked ? 2 : 0);
}

main().catch((e) => { console.error('auto-block-check failed (fail-open, not blocking):', e && e.message ? e.message : e); process.exit(0); });
