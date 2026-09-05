import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prd, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('id, functional_requirements, system_architecture, risks, implementation_approach')
  .eq('directive_id', 'SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

// BLOCK finding: system_architecture.summary still said "no new files" -- the actual
// contradiction lives HERE, not in technical_requirements (which round 1 fixed).
// NOTE: system_architecture is persisted as a JSON STRING column, not a JSON object.
const archParsed = typeof prd.system_architecture === 'string'
  ? JSON.parse(prd.system_architecture)
  : prd.system_architecture;

const archUpdated = {
  ...archParsed,
  summary: 'Extends three existing files (release-oracle-hold.js, hold-writer.js, batch-mint-sweep.mjs) with archive-aware lookup, correlation_id population, a verdict-read release branch, and provenance stamping, PLUS one new one-off backfill script (FR-5) -- no new cron entry, daemon, or table.',
  components: archParsed.components.map((c) =>
    c.name === 'role_drain_sets (DB) or lib/fleet/worker-status.cjs DRAIN_SETS'
      ? { name: 'database/migrations/<new>_role_drain_sets_add_oracle_read_pending_consult.sql', change: "one new migration inserting a single role_drain_sets row (role='solomon', kind='oracle_read_pending_consult', status='active', direction='inbound'), mirroring the existing database/migrations/2026*_role_drain_sets_add_*.sql pattern already used for every other kind addition to this table -- the JS DRAIN_SETS floor in worker-status.cjs is NOT touched (drain-set-registry.js unions the two)." }
      : c
  ),
};
const system_architecture = JSON.stringify(archUpdated);

const functional_requirements = prd.functional_requirements.map((fr) => {
  if (fr.id === 'FR-3') {
    return {
      ...fr,
      description: fr.description + ' Archive-aware reply lookup (resolving the plan-critique gap): the reply-matching lookup applies the SAME archive-fallback principle as FR-1 -- if a coordinator_reply row matching the correlation_id is not found live in session_coordination, fall back to retention_archive before concluding no reply exists, so a reply is never missed purely because it aged past the same 1-hour/7-day retention window as the original consult row.',
    };
  }
  if (fr.id === 'FR-5') {
    return {
      ...fr,
      description: fr.description + ' Rollback (resolving the plan-critique gap): before mutating any row, the script writes a machine-readable before-state snapshot (id, owner, release_condition, verification_notes) to a local JSON file; a companion --restore <snapshot-file> mode reapplies those exact pre-mutation values, so an incorrect --execute run is recoverable without a manual SQL rollback.',
      acceptance_criteria: [
        ...fr.acceptance_criteria,
        'The backfill writes a before-state snapshot file prior to any mutation, and a --restore mode against that file reverts every mutated row to its exact prior state',
      ],
    };
  }
  if (fr.id === 'FR-6') {
    return {
      ...fr,
      description: fr.description + ' Reuse (resolving the plan-critique note): the new script explicitly reuses scripts/session-liveness-ssot-exit-predicate-check.mjs\'s existing population-canary and service-role-guard scaffolding rather than duplicating that logic.',
    };
  }
  return fr;
});

const { error: writeErr } = await supabase
  .from('product_requirements_v2')
  .update({ system_architecture, functional_requirements })
  .eq('id', prd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('PRD updated (round 2): system_architecture.summary contradiction fixed; FR-3/FR-5/FR-6 remaining plan-critique gaps closed.');
