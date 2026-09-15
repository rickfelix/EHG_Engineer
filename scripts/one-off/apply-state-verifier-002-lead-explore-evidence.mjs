#!/usr/bin/env node
/**
 * SD-LEO-INFRA-APPLY-STATE-VERIFIER-002 -- Explore evidence at LEAD-TO-PLAN.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-APPLY-STATE-VERIFIER-002';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 88,
    phase: 'LEAD-TO-PLAN',
    execution_time_ms: 0,
    summary: "LEAD-phase Explore measured the SD's scope premise directly against the live database rather than trusting its text. The SD scope cites 'about 124 per Alpha-3's earlier count' for the known-applied set to freeze as fixtures -- this is a MISCITATION: SD-LEO-INFRA-APPLY-STATE-VERIFIER-001's own description shows Alpha-3's 124 was a different, unrelated fleet-wide census of POTENTIAL false-positive CANDIDATES, not a schema_migrations_applied success-row count. Measured live: 393 schema_migrations_applied success rows / 388 distinct normalized paths (via lib/migration-audit-reader.js normalizeMigrationPath()) / 366 resolve to a file that exists on disk today / 150 of those 366 declare a CREATE FUNCTION or CREATE TRIGGER. Read scripts/verify-migration-apply-state.mjs:1031-1043 (classifyFiles()'s bodyMismatches branch): only function and trigger objects ever invoke normalizeSqlBody()/normalizeTriggerWhenClause() -- table/column/index/constraint objects classify purely on live-set membership and never touch the normalizer this SD's regression corpus exists to guard. Confirmed exactly ONE genuine confirmed false positive to date: trg_sd_mutation_audit (database/chairman-gated/20260912_sd_mutation_audit_actor_threading.sql, SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001), whose file text and live pg_get_triggerdef() reconstruction are already captured verbatim in tests/verify-migration-apply-state.test.js:640-665 (TS-1). Read SD-001's own description: 2 SUSPECT rows (SD-LEO-INFRA-FIX-CLAIM-EVICTION-001, SD-LEO-INFRA-CLAIM-PARENT-CHILD-001) were explicitly NEVER confirmed by the coordinator or Solomon -- correctly excluded from the corpus as unconfirmed.",
    critical_issues: [],
    warnings: [
      {
        id: 'EXP-1',
        severity: 'LOW',
        issue: "22 of 388 known-applied paths no longer resolve to a file on disk (renamed/moved/repo-reorganized since the ledger row was written). Investigating why is out of scope for this SD.",
        evidence: 'Direct live measurement via lib/migration-audit-reader.js listApplied({success:true, limit:1000}) + normalizeMigrationPath() + fs.existsSync per path: 388 distinct, 366 exist, 22 do not.',
      },
    ],
    recommendations: [
      'PLAN should scope the frozen fixture corpus to (a) the sole confirmed false positive (trg_sd_mutation_audit) and (b) the 150 function/trigger-declaring known-applied files -- NOT a literal ~124, and not the full 366, since the ~216 table/column/index-only files exercise zero of the normalizer code this SD guards.',
      'PLAN should design a one-time (non-CI) generator script that captures live prosrc/pg_get_triggerdef() text for the 150 files and writes it to a frozen fixture file with provenance (capture timestamp, source path), so the CI suite itself never opens a DB connection.',
      'PLAN should include a seeded-mutation test proving the corpus test is not vacuous (at least one fixture deliberately flipped to BODY_MISMATCH).',
    ],
    detailed_analysis: {
      commands_run: [
        'git log --oneline (SD-001 commit history) -- confirmed exactly 3 commits: the original fix (0033141895a) + 2 adversarial-review rounds (9581157bb6e, e212a9f71af)',
        'git show 0033141895a / 9581157bb6e / e212a9f71af -- read full commit messages, confirmed only trg_sd_mutation_audit is cited as a live-confirmed specimen; adversarial rounds fixed synthetic regressions in the fix itself, not additional live false positives',
        "Read strategic_directives_v2 row for SD-LEO-INFRA-APPLY-STATE-VERIFIER-001 (description + key_changes) -- confirmed Alpha-3's 124 figure is a fleet-wide potential-false-positive census, separate from schema_migrations_applied, and confirmed the 2 SUSPECT rows were never independently verified",
        'Read tests/verify-migration-apply-state.test.js:634-728 -- located the TS-1 confirmed-specimen test (exact file/live text pair) and the 2 adversarial-round regression tests',
        'Read scripts/verify-migration-apply-state.mjs:982-1101 (classifyFiles()) -- confirmed normalizeSqlBody()/normalizeTriggerWhenClause() are invoked ONLY on the function and trigger branches (lines 1031-1043), never on table/column/index/constraint classification',
        'Live measurement: supabase.from(\'schema_migrations_applied\').select(count,exact,head).eq(\'success\',true) -> 393; lib/migration-audit-reader.js listApplied({success:true,limit:1000}) + normalizeMigrationPath() -> 388 distinct paths; fs.existsSync per normalized path (worktree-root and repo-root candidates) -> 366 exist, 22 do not; regex /CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION|CREATE\\s+TRIGGER/i over the 366 on-disk files -> 150 declare a function or trigger',
      ],
    },
    metadata: { independent_verification: true, premise_measured_live: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    probeExistsRelative: 'scripts/one-off/apply-state-verifier-002-lead-explore-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('Explore', sdRow.id, { code: 'Explore', name: 'Explore' }, results, { sdKey: SD_KEY, phase: 'LEAD-TO-PLAN' });
  console.log('STORED:', 'Explore', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
