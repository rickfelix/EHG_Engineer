#!/usr/bin/env node
// Nightly sweep for pending venture_quality_findings matching test-fixture
// sentinels (PAT-TEST-FIXTURE-PROMOTION-001 / QF-20260511-876).
// Usage: node scripts/audit-test-fixture-leak.mjs [--execute] [--json]

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { isLikelyTestFixture } from '../lib/eva/quality-findings/sd-generator.js';

async function safeExit(code) {
  try {
    const d = (await import('undici'))?.getGlobalDispatcher?.();
    if (d?.destroy) await Promise.race([d.destroy(), new Promise((r) => setTimeout(r, 200))]).catch(() => {});
  } catch {}
  process.exit(code);
}

const args = new Set(process.argv.slice(2));
const supabase = createSupabaseServiceClient();
const { data, error } = await supabase
  .from('venture_quality_findings')
  .select('id, venture_id, finding_category, severity, evidence_pointer, created_at')
  .eq('status', 'pending');
if (error) { console.error('[audit-test-fixture-leak] query failed:', error.message); await safeExit(2); }
const leaks = (data || []).filter(isLikelyTestFixture);

if (args.has('--json')) {
  process.stdout.write(JSON.stringify({ count: leaks.length, rows: leaks }, null, 2) + '\n');
} else {
  console.log(`[audit-test-fixture-leak] ${leaks.length} pending fixture-shaped rows`);
  for (const r of leaks.slice(0, 10)) console.log(`  ${r.id} venture=${r.venture_id} sig=${r.evidence_pointer?.sig ?? '-'} (${r.finding_category}/${r.severity})`);
}

if (args.has('--execute') && leaks.length > 0) {
  let cancelled = 0;
  for (const r of leaks) {
    const { error: uErr } = await supabase.from('venture_quality_findings').update({ status: 'cancelled' }).eq('id', r.id).eq('status', 'pending');
    if (uErr) console.error(`  failed to cancel ${r.id}: ${uErr.message}`);
    else cancelled++;
  }
  console.log(`[audit-test-fixture-leak] cancelled ${cancelled}/${leaks.length}`);
}

await safeExit(leaks.length > 0 && !args.has('--execute') ? 1 : 0);
