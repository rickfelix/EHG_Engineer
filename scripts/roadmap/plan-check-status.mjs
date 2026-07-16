#!/usr/bin/env node
/**
 * plan-check-status.mjs — SD-LEO-INFRA-PLAN-OF-RECORD-LINKAGE-001 (FR-2)
 *
 * CLI wrapper for computePlanCheckStatus(): prints the LEO-Roadmap-derived slipped/done/
 * next/committing facts, either human-readable or --json. Uses the service-role client —
 * the anon/authenticated role would silently return zero rows under RLS with no error.
 *
 * Usage: node scripts/roadmap/plan-check-status.mjs [--json]
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { computePlanCheckStatus } from '../../lib/roadmap/plan-check-status.js';
import { pathToFileURL } from 'url';

function renderHuman(status) {
  const lines = ['═══ PLAN CHECK — derived from the LEO Roadmap (plan of record) ═══', ''];
  lines.push(`1. What slipped (${status.slipped.length}):`);
  for (const s of status.slipped) lines.push(`   - ${s.title} — ${s.reason}`);
  lines.push('', `2. What got done (last 48h) (${status.done.length}):`);
  for (const d of status.done) lines.push(`   - ${d.title} [${d.wave || 'unwaved'}] (${d.sd_key})`);
  lines.push('', `3. Next (${status.next.length}):`);
  for (const n of status.next) lines.push(`   - ${n.title} [${n.wave || 'unwaved'}] (${n.disposition})`);
  lines.push('', `4. Committing to (next 48h) (${status.committing.length}):`);
  for (const c of status.committing) lines.push(`   - ${c.title} [${c.wave || 'unwaved'}]`);
  return lines.join('\n');
}

async function main() {
  const asJson = process.argv.includes('--json');
  const supabase = createSupabaseServiceClient();
  const status = await computePlanCheckStatus(supabase);
  console.log(asJson ? JSON.stringify(status) : renderHuman(status));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('PLAN_CHECK_STATUS_ERROR', err && err.message ? err.message : err);
    process.exit(1);
  });
}
