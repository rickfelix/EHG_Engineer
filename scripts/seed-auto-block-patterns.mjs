#!/usr/bin/env node
/**
 * SD-LEO-INFRA-UNBLOCK-PORTFOLIO-WIDE-001 (FR-3) — enable auto_block_on_match on a CURATED,
 * honest allow-list of genuinely high-signal, prevention-bearing patterns.
 *
 * HONESTY GUARD: only patterns in CURATED_ALLOW_LIST are enabled. We deliberately do NOT flip
 * the noisy auto-generated gate-failure-history families (PAT-HF-* / PAT-RETRO-*) just to inflate
 * the count — those are not meaningful prevent-at-gate rules. Enabling is advisory-only by default
 * (the consumer enforces only under LEO_AUTO_BLOCK_ENFORCE=on + an explicit pattern block_signatures
 * match), so this is safe for the live fleet. Idempotent: only flips rows that are active + currently
 * false; re-running is a no-op.
 *
 * Usage: node scripts/seed-auto-block-patterns.mjs [--dry-run]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Curated high-signal, prevention-bearing patterns (verified: active, severity high/critical,
// non-auto-generated, with prevention_checklist + proven_solutions).
export const CURATED_ALLOW_LIST = Object.freeze([
  'PAT-WINDOWS-JUNCTION-FOLLOW-RECURSIVE-RM-001',
  'PAT-CI-DB-TLS-VERIFY-GAP-001',
  'PAT-PORT-ISOL-001',
  'PAT-CLMMULTI-002',
]);

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
  const supabase = createClient(url, key);

  const { data: rows, error } = await supabase
    .from('issue_patterns')
    .select('pattern_id, status, severity, auto_block_on_match')
    .in('pattern_id', CURATED_ALLOW_LIST);
  if (error) { console.error('read failed:', error.message); process.exit(1); }

  const toEnable = (rows || []).filter((r) => r.status === 'active' && r.auto_block_on_match !== true);
  const missing = CURATED_ALLOW_LIST.filter((id) => !(rows || []).some((r) => r.pattern_id === id));
  if (missing.length) console.log('⚠️  not found (skipped):', missing.join(', '));

  console.log(`Curated: ${CURATED_ALLOW_LIST.length} | found active: ${(rows||[]).filter(r=>r.status==='active').length} | to enable: ${toEnable.length}`);
  if (dryRun) { console.log('DRY-RUN — no writes.', JSON.stringify(toEnable.map(r=>r.pattern_id))); process.exit(0); }

  let enabled = 0;
  for (const r of toEnable) {
    const { error: uErr } = await supabase.from('issue_patterns').update({ auto_block_on_match: true }).eq('pattern_id', r.pattern_id);
    if (uErr) { console.error(`  ✗ ${r.pattern_id}: ${uErr.message}`); continue; }
    enabled++; console.log(`  ✓ enabled ${r.pattern_id}`);
  }
  const { count } = await supabase.from('issue_patterns').select('*', { count: 'exact', head: true }).eq('auto_block_on_match', true);
  console.log(`\nEnabled this run: ${enabled}. Total auto_block_on_match=true now: ${count}.`);
  process.exit(0);
}

main().catch((e) => { console.error('seed-auto-block-patterns failed:', e && e.message ? e.message : e); process.exit(1); });
