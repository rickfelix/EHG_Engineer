#!/usr/bin/env node
/**
 * Zero-shadow enumeration sweep (SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-A, FR-1).
 *
 * Joins the discovered recurring-process estate (lib/periodic-liveness/enumerate-processes.mjs)
 * against periodic_process_registry and reports, per source, which processes are MAPPED to a
 * registry row and which are SHADOW (discovered but unregistered). Read-only.
 *
 * Exit contract (CI-enforceable): non-zero when shadow count > 0, unless --report-only.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverAllProcesses } from '../lib/periodic-liveness/enumerate-processes.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportOnly = process.argv.includes('--report-only');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const discovered = discoverAllProcesses(repoRoot);
  const { data: rows, error } = await supabase
    .from('periodic_process_registry')
    .select('process_key, owner');
  if (error) throw new Error(`registry query failed: ${error.message}`);

  const registered = new Map((rows || []).map((r) => [r.process_key, r]));
  const bySource = {};
  const shadows = [];
  for (const proc of discovered) {
    const bucket = (bySource[proc.source] ||= { mapped: 0, shadow: 0 });
    if (registered.has(proc.process_key)) bucket.mapped += 1;
    else { bucket.shadow += 1; shadows.push(proc); }
  }

  console.log(`[enumerate-periodic-processes] discovered ${discovered.length} recurring process(es)`);
  for (const [source, counts] of Object.entries(bySource)) {
    console.log(`  ${source.padEnd(14)} mapped=${counts.mapped} shadow=${counts.shadow}`);
  }
  // Registry-side extras (registered but no longer discovered) are informational only — retired
  // processes with INTENTIONALLY_DOWN semantics are legitimate registry residents.
  const discoveredKeys = new Set(discovered.map((p) => p.process_key));
  const extras = (rows || []).filter((r) => !discoveredKeys.has(r.process_key) && !r.process_key.startsWith('__') && !r.process_key.startsWith('role_session:') && !r.process_key.startsWith('scheduler_round:') && !r.process_key.startsWith('g3-armed-'));
  if (extras.length > 0) {
    console.log(`  (info) ${extras.length} registry row(s) not in the discovered estate (retired or hand-registered):`);
    for (const r of extras) console.log(`    - ${r.process_key}`);
  }

  if (shadows.length > 0) {
    console.log(`\nSHADOW (discovered, unregistered) — ${shadows.length} process(es):`);
    for (const s of shadows) console.log(`  - ${s.process_key}${s.cron ? ` (cron: ${s.cron})` : ''}`);
    console.log('\nFix: node scripts/seed-periodic-process-registry.mjs (standalone_cron pass registers these)');
    if (!reportOnly) process.exitCode = 1;
  } else {
    console.log('\nZERO SHADOWS — every discovered recurring process maps to a registry row.');
  }
}

main().catch((err) => {
  console.error(`[enumerate-periodic-processes] FAILED: ${err.message}`);
  process.exit(1);
});
