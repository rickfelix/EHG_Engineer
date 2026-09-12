#!/usr/bin/env node
/**
 * SD-LEO-FIX-CHILD-SCOPE-COVERAGE-001 — backfill metadata.coordination_only=true onto
 * pre-existing sd_scope_deliverables rows that predate the fix.
 *
 * The fix (extract-deliverables-from-prd.js + parent-orchestrator-handler.js) only stamps
 * the flag at EXTRACTION time, and extractAndPopulateDeliverables defaults skipIfExists:true,
 * so it never re-tags rows created before this SD shipped. Live-confirmed: at least one
 * orchestrator (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001) is blocked at PLAN-TO-LEAD on
 * CHILD_SCOPE_COVERAGE right now with exactly these 3 untagged rows. This one-time backfill
 * closes that gap for every orchestrator SD carrying the coordination-only template, past or
 * present, rather than leaving the fix to only ever help NEW orchestrators going forward.
 *
 * Scope is deliberately narrow and matches child-scope-coverage.js's own
 * COORDINATION_TEMPLATE_NAMES exactly (name-match is the binding guard there too), on a parent
 * whose sd_type is 'orchestrator'. This narrows, but does not eliminate, the mistagging risk:
 * a manually-authored orchestrator deliverable that happens to share one of these 3 exact
 * titles would also be tagged (PR #8703 adversarial review). Live-verified before running
 * --execute: all 30 matching rows had a uniform 10x3 distribution across the 10 orchestrator
 * SDs found -- the signature of the auto-generated triple, not a name collision (a collision
 * victim would show as an orphan without its siblings; none did).
 *
 * Usage: node scripts/one-off/backfill-coordination-only-child-scope-coverage-001.mjs [--execute]
 * (dry-run by default; --execute performs the writes)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EXECUTE = process.argv.includes('--execute');

// Must match COORDINATION_TEMPLATE_NAMES in
// scripts/modules/handoff/executors/plan-to-lead/gates/child-scope-coverage.js exactly.
const COORDINATION_TEMPLATE_NAMES = [
  'Child SD Orchestration',
  'Work Decomposition Structure',
  'Progress Tracking',
];

const { data: orchestrators, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key')
  .eq('sd_type', 'orchestrator');
if (sdErr) { console.error('FAILED (orchestrator lookup):', sdErr.message); process.exit(1); }

const orchestratorIdSet = new Set(orchestrators.map((o) => o.id));
if (orchestratorIdSet.size === 0) { console.log('No orchestrator SDs found.'); process.exit(0); }

// Filter by the 3 exact template names FIRST (a small, rare superset) rather than passing
// hundreds of orchestrator UUIDs into .in() (fetch failures observed with a large ID list).
const { data: allRows, error: delErr } = await supabase
  .from('sd_scope_deliverables')
  .select('id, sd_id, deliverable_name, metadata')
  .in('deliverable_name', COORDINATION_TEMPLATE_NAMES);
if (delErr) { console.error('FAILED (deliverable lookup):', delErr.message); process.exit(1); }

const rows = allRows.filter((r) => orchestratorIdSet.has(r.sd_id));
const sdKeyById = new Map(orchestrators.map((o) => [o.id, o.sd_key]));
const toBackfill = rows.filter((r) => !r.metadata?.coordination_only);

console.log(`Scanned ${orchestratorIdSet.size} orchestrator SD(s), found ${rows.length} coordination-template-named deliverable row(s) among them.`);
console.log(`${toBackfill.length} row(s) missing metadata.coordination_only:`);
for (const r of toBackfill) {
  console.log(`  - ${sdKeyById.get(r.sd_id)} / "${r.deliverable_name}" (${r.id})`);
}

if (toBackfill.length === 0) {
  console.log('Nothing to backfill.');
  process.exit(0);
}

if (!EXECUTE) {
  console.log('\nDRY RUN — no writes made. Re-run with --execute to apply.');
  process.exit(0);
}

let updated = 0;
for (const r of toBackfill) {
  const { error } = await supabase
    .from('sd_scope_deliverables')
    .update({ metadata: { ...(r.metadata || {}), coordination_only: true } })
    .eq('id', r.id);
  if (error) {
    console.error(`  FAILED on ${r.id}:`, error.message);
    continue;
  }
  updated++;
}
console.log(`\n✅ Backfilled ${updated}/${toBackfill.length} row(s).`);
