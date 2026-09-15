#!/usr/bin/env node
// LEAD-phase spine for SD-LEO-INFRA-CONTINUOUS-EXTERNAL-SURFACE-001.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CONTINUOUS-EXTERNAL-SURFACE-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id, metadata').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const update = {
    key_changes: [
      {
        type: 'db_migration',
        change: "New chairman-owned allowlist table (e.g. public_read_allowlist: table_name, reason, approved_by, approved_at) -- a versioned artifact this SD creates and reads but never populates. No seat (including this one) adds a row.",
        impact: 'Gives the continuous check a real, queryable source of truth for "entries the chairman has declared intentionally public," replacing the ad-hoc, undiscoverable per-ratification scope_exactly arrays found scattered across migration headers.',
      },
      {
        type: 'lib',
        change: "New continuous-surface checker, built by EXTENDING scripts/sentinels/audit-security-linter.mjs's existing pattern (direct pg connection via createDatabaseClient('engineer'), never Supabase-js) rather than duplicating it -- adds what the sentinel does NOT do: (a) a genuine anonymous-role read attempt against every public-schema table not on the allowlist (not grants-inference), and (b) a POSITIVE canary read (a row that MUST be anonymously readable) verified on every run, so a bad key/dead connection/no-op query cannot be misread as 'nothing exposed.'",
        impact: "Satisfies success_metrics #1 and #2: distinguishes a genuinely clean surface from a check that silently did not run, and catches a newly-exposed table via an ACTUAL read rather than an inference the sentinel's own weekly pass already proved insufficient (chronic-red-guard-001 measured this gap directly).",
      },
      {
        type: 'wiring',
        change: 'Wire the new checker into scripts/modules/handoff/pre-checks/pending-migrations-check.js -- the real auto-apply-at-handoff hook (confirmed by Explore to be the actual TIER-1 migration auto-apply path, and already the RLS-lint corpus\'s own source of truth for "where migrations apply"), rather than only a diff-scoped CI lint (which would miss a migration applied outside a reviewed PR diff) or only a weekly cron (which is explicitly out of scope -- that cadence belongs to Solomon\'s audit, not this directive).',
        impact: 'Satisfies success_metric #1: a migration that opens a table is refused/flagged at THE MOMENT it applies, not on the next weekly pass -- closing the exact "open on a Saturday, sits open until Friday" gap the SD names directly.',
      },
    ],
    strategic_objectives: [
      "Execute chairman ratification 030d72e8 ('Yes to both') by building the CONTINUOUS half of Solomon's audit proposal: a migration-apply-time check that nothing in the exposed (public) schema answers the anonymous key outside the chairman-owned allowlist.",
      'Build on the existing audit-security-linter.mjs sentinel pattern (proven direct-pg-connection approach, already covers RLS-disabled/grants inference) rather than duplicating a parallel mechanism -- extend it with the 2 capabilities it explicitly lacks: an actual anonymous read and migration-apply-time cadence.',
      'Never populate the chairman-owned allowlist -- this SD builds the reader and the enforcement point only; the allowlist\'s contents remain the chairman\'s to decide, per the SD\'s own explicit text.',
    ],
    risks: [
      {
        risk: "Requirement (3)'s 'measured near-miss' (a name-matching hold detector misclassifying chairman_drop_approval as a FENCE) could not be located as a specific existing bug during LEAD-phase Explore -- 'hold'/'fence' vocabulary is pervasive across dozens of fleet-coordination files (lib/fleet/hold-writer.js, lib/governance/hold-state-contract.js, canary-claim-fence.cjs, etc.), too broad to pinpoint in LEAD-phase scope.",
        mitigation: "Treat requirement (3) as a design constraint for any NEW classifier this SD adds (must read semantic shape -- e.g. an explicit status/verdict field -- never a key's literal name), not as a specific existing bug to patch. PLAN phase should re-search with more targeted queries before EXEC begins, and this SD's own new allowlist-reader/enforcement code must be built to satisfy this constraint from the start (verified via a dedicated regression test: an 'approval'-shaped key must never be read as a 'hold').",
        severity: 'medium',
      },
      {
        risk: '"Each live venture project measured separately" (from the predicate\'s scope line) assumes ventures are separate Supabase projects/databases -- Explore found no such model exists; ventures appear to be multi-tenant rows (venture_id column) within the SAME shared platform database, not separate project connections.',
        mitigation: "Interpret 'each live venture project measured separately' as 'checks scoped/reported per venture_id within the shared database' rather than literal separate-database connections, since no separate-project infrastructure exists to measure. This interpretation is recorded here for VALIDATION to re-confirm and for the coordinator to correct if a venture-specific Supabase project model exists elsewhere that this session's Explore missed.",
        severity: 'medium',
      },
      {
        risk: "No 'exposed schema' config exists as a versioned artifact -- every existing security-scanning tool (the sentinel, the RLS lint) hardcodes the assumption that the exposed schema is literally 'public'.",
        mitigation: "Match the existing convention (hardcode 'public' as the exposed schema, consistent with audit-security-linter.mjs's own pg_namespace filter) rather than inventing a new configurable schema-list mechanism the SD's predicate does not ask for.",
        severity: 'low',
      },
    ],
    smoke_test_steps: [
      {
        instruction: 'Seed a migration that creates a new public-schema table with RLS disabled (or grants anon SELECT) and run it through the wired pending-migrations-check.js hook.',
        expected_outcome: 'The migration is refused or flagged at apply time, not merely logged for a later weekly pass.',
      },
      {
        instruction: 'Run the continuous checker 3 times: once with a deliberately bad/invalid key, once with a forced dead connection, once as a genuine clean run.',
        expected_outcome: 'All 3 runs produce distinguishably different verdicts (e.g. VOID/ERROR for the first two, PASS or a real finding list for the third) -- never all reading as "nothing exposed."',
      },
      {
        instruction: 'Query the new allowlist table directly and confirm it has zero rows written by this SD\'s own code paths (only a chairman-authored row, if any exist at all).',
        expected_outcome: 'This SD\'s own commits never insert a row into the allowlist table -- only schema/reader code.',
      },
    ],
    success_criteria: [
      { criterion: 'A seeded migration that opens a table to the anonymous key is refused or flagged at apply time', measure: 'refused on the first apply attempt, not on the next weekly pass', verification: 'Automated: a test seeds such a migration through the wired hook and asserts a block/flag verdict' },
      { criterion: 'The positive canary distinguishes a genuinely clean surface from a check that did not run', measure: 'a forced bad key, a forced dead connection, and a genuinely clean run produce 3 different verdicts', verification: 'Automated: 3 distinct test scenarios assert 3 distinct verdict shapes' },
      { criterion: 'An approval key is never classified as a hold', measure: 'chairman_drop_approval present on an SD metadata never marks it fenced in any classifier this directive adds', verification: 'Automated: a regression test asserts the new classifier logic treats an approval-shaped field correctly' },
      { criterion: 'Scope coverage is reported rather than assumed', measure: 'every run names which surfaces it measured and which it could not reach', verification: 'Automated: the checker\'s own output includes an explicit coverage-report field' },
    ],
    metadata: {
      ...(sdRow.metadata || {}),
      lead_scoping_decision: {
        decision: "Build by EXTENDING scripts/sentinels/audit-security-linter.mjs's proven direct-pg-connection pattern (never duplicate it), adding exactly the 2 capabilities it lacks (actual anon read, migration-apply-time cadence via pending-migrations-check.js), plus a new chairman-owned allowlist table this SD reads but never writes. 'Each live venture project measured separately' is interpreted as per-venture_id scoping within the shared DB, since no separate-Supabase-project-per-venture model exists.",
        evidence: 'LEAD-phase Explore fork investigated 7 concrete questions against the live codebase: confirmed audit-security-linter.mjs (direct pg, weekly cron, catalog-inference-only, no anon read) as the correct extension base; confirmed pending-migrations-check.js as the real auto-apply-at-handoff hook (not scripts/apply-migration.js\'s manual path, not a diff-scoped CI lint); confirmed no exposed-schema config, no chairman-owned allowlist artifact, and no separate-Supabase-project-per-venture model exist yet.',
        open_gap: "Requirement (3)'s specific 'name-matching hold detector' near-miss could not be located as an existing bug during LEAD Explore -- treated as a design constraint (semantic-shape classification, never name-matching) for this SD's OWN new code, not a specific patch target. PLAN should re-search before EXEC if a specific offending classifier needs direct remediation.",
      },
    },
  };

  const { error: updErr } = await supabase.from('strategic_directives_v2').update(update).eq('id', sdRow.id);
  if (updErr) throw updErr;
  console.log('LEAD spine populated for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
