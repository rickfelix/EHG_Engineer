#!/usr/bin/env node
/**
 * SD-LEO-INFRA-UNBLOCK-PORTFOLIO-WIDE-001 (FR-2) — CLI for the venture_capabilities
 * population mechanism. Makes lib/governance/venture-capability-populator.js reachable from a
 * live entry point (no dark seam). HONEST: reports 0 populated on 0 real ventures (dormant).
 *
 * Usage: node scripts/populate-venture-capabilities.mjs [--dry-run]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { populateVentureCapabilities } from '../lib/governance/venture-capability-populator.js';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
  const supabase = createClient(url, key);
  const r = await populateVentureCapabilities(supabase, { dryRun });
  console.log(JSON.stringify(r, null, 2));
  if (r.dormant) {
    console.log('\nℹ️  Dormant: no real ventures to populate from (honest 0). Lights up as real ventures mature.');
  }
  process.exit(r.success ? 0 : 1);
}

main().catch((e) => { console.error('populate-venture-capabilities failed:', e && e.message ? e.message : e); process.exit(1); });
