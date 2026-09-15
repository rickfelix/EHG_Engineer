#!/usr/bin/env node
/**
 * SD-LEO-INFRA-APPLY-STATE-VERIFIER-002 -- VALIDATION evidence at LEAD-TO-PLAN.
 *
 * Duplicate/overlap scan + independent re-verification, as required before this SD's
 * LEAD-TO-PLAN handoff (GATE_SUBAGENT_EVIDENCE).
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
    confidence: 90,
    phase: 'LEAD-TO-PLAN',
    execution_time_ms: 0,
    summary: 'Duplicate/overlap scan clean, and the LEAD Explore premise correction independently re-verified with an exact re-derivation. (1) strategic_directives_v2 title/description search for apply-state/migration-apply-state returned 13 rows, ALL status=completed -- SD-LEO-INFRA-APPLY-STATE-VERIFIER-001 (the fix this SD guards), SD-LEO-INFRA-VERIFY-MIGRATION-APPLY-001 (the function-body-aware classification this SD\'s corpus also covers), SD-LEO-INFRA-APPLY-STATE-CEREMONY-PENDING-001, several MIGRATION-APPLY-STATE-* / MIGRATION-DEPLOY-DRIFT-* triage/reconciliation SDs, and SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-B/D (ledger reconciliation, a different concern -- ledger completeness, not verifier-comparison correctness). Zero active/draft duplicates of this SD\'s specific corpus-building scope. (2) gh pr list search for verify-migration-apply-state / apply-state-verifier returned 4 open PRs, all unrelated keyword-noise matches (chairman-gated ceremony markers, ratification encodings, an unrelated header-add, an RLS grant revoke) -- none touch scripts/verify-migration-apply-state.mjs or build a regression corpus. No active PR pre-empts this work. (3) Independently re-ran Explore\'s exact live measurement in a separate process: listApplied({success:true,limit:1000}) -> 393 rows -> normalizeMigrationPath() -> 388 distinct paths -> fs.existsSync per path -> 366 exist on disk -> CREATE FUNCTION/CREATE TRIGGER regex -> 150 declare one -- an EXACT match to Explore\'s figures across all four numbers, confirming the premise correction is stable and not a one-off measurement artifact. (4) Independently re-read scripts/verify-migration-apply-state.mjs:1031-1043 directly: confirmed normalizeSqlBody()/normalizeTriggerWhenClause() are invoked ONLY inside the function/trigger bodyMismatches branch -- corroborates Explore\'s scoping recommendation (150 files, not 366 or a literal 124) independent of Explore\'s own read. (5) One noteworthy near-miss checked and ruled out: SD-LEO-INFRA-MIGRATION-APPLY-STATE-TRIAGE-001\'s title cites "126 files" -- close to but a DIFFERENT figure from the SD\'s cited "~124", and a different measurement entirely (a triage/decide-needed-or-retire count from that now-completed SD, not a current schema_migrations_applied success-row count). Neither this nor Alpha-3\'s cited census is the right anchor for this SD\'s corpus; the live re-measurement (388/366/150) is.',
    critical_issues: [],
    warnings: [
      {
        id: 'VAL-1',
        severity: 'LOW',
        issue: 'The 22 known-applied paths that no longer resolve to a file on disk were not individually enumerated in this pass (only counted) -- PLAN/EXEC should list them by path in the generator script\'s skip log so a future reader can see which specific migrations vanished, not just the count.',
        evidence: 'listApplied({success:true,limit:1000}) + normalizeMigrationPath() + fs.existsSync: 388 distinct paths, 366 exist, 22 do not (count only, not yet itemized).',
      },
    ],
    recommendations: [
      'PLAN should scope the PRD\'s corpus exactly as Explore recommended: the 1 confirmed false positive + the 150 function/trigger-declaring known-applied files -- both independently re-verified this pass.',
      'PLAN\'s PRD should have the generator script log the 22 unresolvable paths by name (not just a count) so a future reader can distinguish "known-vanished, investigated" from "known-vanished, not yet looked at".',
      'No retroactive cleanup of the 22 stale ledger rows in scope for this SD -- a data-quality item, separate from the regression-corpus deliverable.',
    ],
    detailed_analysis: {
      commands_run: [
        "Queried strategic_directives_v2 .or(title.ilike / description.ilike) for apply-state/migration apply/verify-migration-apply-state -- 13 rows, all status=completed, zero active duplicates of this SD's scope",
        'gh pr list --search "verify-migration-apply-state OR apply-state-verifier" --state open -- 4 results, all unrelated keyword-noise, none touch the target file or build a corpus',
        'Independent re-run (separate process from Explore) of listApplied({success:true,limit:1000}) + normalizeMigrationPath() + fs.existsSync + CREATE FUNCTION/TRIGGER regex -- 393/388/366/150, exact match to Explore\'s figures',
        'Independent re-read of scripts/verify-migration-apply-state.mjs:1031-1043 -- confirmed the normalizer is invoked only on function/trigger classes, corroborating the 150-file scoping recommendation from a second, independent read',
      ],
    },
    metadata: { independent_verification: true, premise_measured_live: true, duplicate_scan_complete: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    probeExistsRelative: 'scripts/one-off/apply-state-verifier-002-lead-validation-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('VALIDATION', sdRow.id, { code: 'VALIDATION', name: 'Validation' }, results, { sdKey: SD_KEY, phase: 'LEAD-TO-PLAN' });
  console.log('STORED:', 'VALIDATION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
