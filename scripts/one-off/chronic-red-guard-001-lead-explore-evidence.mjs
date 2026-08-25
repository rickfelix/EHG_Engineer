#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-INFRA-CHRONIC-RED-GUARD-001, LEAD-TO-PLAN phase.
 *
 * Records the discovery work actually performed before LEAD's scope correction was written:
 * locating both guard workflows/scripts, tracing their classification and blocking logic,
 * measuring real CI history via `gh run list`/`gh run view`, and finding the pre-existing
 * disposition-ledger mechanism that FR-1/FR-2/FR-3 as submitted would have duplicated.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CHRONIC-RED-GUARD-001';

const findings = [
  {
    id: 'both-guards-located-and-classification-confirmed',
    severity: 'INFO',
    summary: 'Drift guard: .github/workflows/migration-deploy-drift-guard.yml driving scripts/verify-migration-apply-state.mjs. CEREMONY_PENDING classification confirmed at :504-508 (relabels a chairman-gated NOT_APPLIED/PARTIAL file); confirmed blocking via gaps array (:531) -> failSet (:677) -> exit 1 under --strict (:783). Sentinel: .github/workflows/security-linter-sentinel.yml driving scripts/sentinels/audit-security-linter.mjs. pg_net probe confirmed at :160-212 and, independently re-read directly, EXPLICITLY EXCLUDED from the `findings`/`clean` sum (:210-212) and therefore cannot drive --strict exit 1 (:255) -- the SD/QF premise that pg_net causes the sentinel red is code-contradicted, not merely unconfirmed.',
  },
  {
    id: 'ci-history-measured-not-assumed',
    severity: 'INFO',
    summary: '`gh run list --workflow=migration-deploy-drift-guard.yml --limit 20 --json conclusion,createdAt,status` returned 20/20 failures back to 2026-08-21 (a separately-run 100-sample check returned 100/100 failures back to >=2026-08-07) -- QF-20260824-600\'s "8 consecutive red runs" is a large undercount. `gh run list --workflow=security-linter-sentinel.yml --limit 20` returned 12 consecutive weekly failures from 2026-06-08 through 2026-08-24 with the last success at 2026-06-02 -- QF-20260824-315\'s "6 consecutive weekly reds since 07-20" mistook a 6-week sampling window for the actual streak start; the true streak is twice as long and starts 6 weeks earlier. Cross-checked: the pg_net log line does not appear at all in the 2026-06-08 or 2026-07-20 run outputs, corroborating that it cannot be the historical cause either.',
  },
  {
    id: 'drift-guard-actual-3-step-failure-structure',
    severity: 'INFO',
    summary: '`gh run view <latest-run-id> --json jobs` on run 32744548692 (and confirmed identical across 4 more sampled runs 2026-08-21 -> 2026-08-24) shows 3 independently-failing steps: "Strict apply-state verifier (recent-only)" (FR-1\'s target), "Disposition ledger is in sync with its seeder" (not in the submitted FR-1\'s scope), and "FR-6 fail-open wiring proof" (not in the submitted FR-1\'s scope). The submitted SD\'s FR-4 ("both workflows green on next scheduled run") is unachievable by FR-1 alone even under the ORIGINAL premise, before the premise correction is even applied.',
  },
  {
    id: 'fr6-wiring-proof-is-a-genuine-defect-not-ceremony-noise',
    severity: 'HIGH',
    summary: '`gh run view 32744548692 --log-failed` shows the FR-6 step running tests/integration/migration-apply-state-ledger-wiring.test.js: 4/5 tests pass, 1 fails -- "an APPLIED ledger entry cannot suppress a real gap or fake completion, end to end" expects the tool\'s output to contain the string "LEDGER CONTRADICTS SCHEMA" and instead receives the normal advisory report. This is a genuine, live, unrelated-to-ceremony defect in the ledger\'s corrupt-entry fail-open safety mechanism -- confirmed via the actual assertion diff in the log, not inferred from the step name.',
  },
  {
    id: 'existing-disposition-ledger-mechanism-would-be-duplicated-by-submitted-fr1-fr2-fr3',
    severity: 'HIGH',
    summary: 'scripts/lib/migration-disposition-ledger.mjs + docs/audits/migration-dispositions.json already implement everything the submitted SD\'s FR-2/FR-3 proposed to build for the drift guard: a data manifest (not a predicate edit), per-entry reason + review_by + sd_key (hasReadableReason() at :65-68, invariant at :109), suppressing-vs-non-suppressing disposition types (SUPPRESSING_DISPOSITIONS at :43), an anti-ghost guard so APPLIED never suppresses (:29-31), and -- most directly relevant -- a source:"auto:chairman-gate-marker" entry type built specifically for CEREMONY_PENDING-classified chairman-gated files. The 2026-08-24 drift-guard log itself shows this mechanism ALREADY actively suppressing 4 findings including a database/chairman-gated/ file. The submitted FR-1 (a new predicate branch) would have duplicated this and itself violated the SD\'s own FR-3 principle ("baselines are data, never predicate edits").',
  },
  {
    id: 'sentinel-real-cause-is-a-live-accumulating-backlog-plus-a-predicate-level-anti-pattern',
    severity: 'HIGH',
    summary: 'The sentinel\'s live finding breakdown (2026-08-24 run): 12 rls_disabled_in_public tables, 1 sensitive_columns_exposed, 2 function_search_path_mutable SECURITY DEFINER functions -- these ARE the `findings` sum that drives --strict, unlike pg_net. Sampled across 3 runs, the RLS count alone trends 1 (2026-06-08) -> 11 (2026-07-20) -> 12 (2026-08-24): a live, worsening regression, not a static acknowledged state a baseline could legitimately absorb wholesale. Separately, audit-security-linter.mjs:52-72 already hardcodes an EXEMPTED_TABLES/EXEMPTED_TABLE_PATTERNS allowlist DIRECTLY IN THE PREDICATE -- the sentinel itself currently violates the "baselines are data" principle the submitted SD\'s FR-3 is meant to establish. Also found: the exemption list\'s :61 entry (venture_artifacts_storm_quarantine_20260610) has an unexempted sibling in the live findings (venture_artifacts_storm_quarantine_20260704), inflating the count by one for a reason unrelated to any real new exposure.',
  },
  {
    id: 'pg-net-carveout-independently-confirmed-genuine',
    severity: 'INFO',
    summary: 'lib/security/pg-net-exposure.js:1-45 confirmed to exist and to document a real, thoroughly-evidenced platform block: postgres has zero grant-authority over supabase_admin-owned net.* objects, REVOKE silently no-ops, ALTER DEFAULT PRIVILEGES hard-errors 42501, GRANT supabase_admin TO postgres is refused by a Supabase guard, and a SECURITY DEFINER event-trigger workaround was built and independently failed for the same reason. The SD\'s "out of scope: pg_net remediation" carve-out is grounded in something real -- it is simply moot for THIS SD, since pg_net was never the sentinel\'s blocking cause in the first place.',
  },
  {
    id: 'no-duplicate-or-overlapping-open-sds',
    severity: 'INFO',
    summary: 'Searched strategic_directives_v2 across 10 terms (drift guard, CEREMONY_PENDING, security-linter, sentinel, chronic red, acknowledged-baseline, pg_net, rls_disabled, migration-dispositions, ledger). Only SD-LEO-INFRA-CHRONIC-RED-GUARD-001 itself is open on this topic. Relevant completed ancestor SDs confirmed terminal: SD-LEO-INFRA-APPLY-STATE-CEREMONY-PENDING-001 (created the CEREMONY_PENDING classification), SD-LEO-INFRA-REVOKE-DEFAULT-PUBLIC-001 (created the pg_net report-only probe), SD-LEO-INFRA-MIGRATION-APPLY-STATE-TRIAGE-001 (created the disposition ledger this SD\'s corrected FR-1 now reuses rather than duplicates).',
  },
  {
    id: 'both-source-qfs-confirmed-to-exist-and-match-transcribed-content',
    severity: 'INFO',
    summary: 'QF-20260824-600 ("Drift guard: CEREMONY_PENDING chairman-gated files should warn, not block", status=escalated, ~10 LOC est., ladder decision e38f6e14) and QF-20260824-315 ("Security sentinel: acknowledged-baseline strict mode (stop 6-week chronic red)", status=escalated, ~10 LOC est., ladder decision bfeb85ff) both confirmed to exist with content matching what the SD transcribed. Neither is independently resolved. Both QFs\' original ~10 LOC estimate is far below the actual measured scope (a genuine test-wiring defect plus a live 15-finding security backlog) -- the QF-to-SD escalation itself was correctly triggered by size, just not by the QFs\' own (incorrect) root-cause diagnosis.',
  },
];

const warnings = [
  'The corrected FR-2 (finding-by-finding disposition of 12 RLS-disabled tables + 1 sensitive-column exposure + 2 mutable-search-path functions) is materially larger engineering work than the ~10 LOC either source QF estimated, and may warrant PLAN decomposing it into a child SD (RLS/security remediation) separate from the guard-hardening mechanics (ledger re-seed + FR-6 fix + sentinel baseline-format migration) if the remediation volume proves large during PRD authoring.',
  'The 3 currently-NOT_APPLIED migrations found live in the drift guard\'s gap list (20260821_worker_wind_down_events.sql, 20260821_purge_killed_venture_scheduler_queue.sql, 20260819_eva_scheduler_metrics_created_at_index.sql) are a different action class (deploying migrations) than this SD\'s guard-hardening scope -- PLAN must explicitly decide whether resolving them is in-scope here or a named companion action, not silently assume either.',
];

const recommendations = [
  'PLAN should author FR-1 as a seeder-reliability fix (re-seed + harden npm run migration:dispositions:seed) rather than any predicate edit, and confirm this alone clears both the ceremony-attributable portion of "Strict apply-state verifier" and the entire "Disposition ledger is in sync with its seeder" step.',
  'PLAN should treat FR-1b (the FR-6 wiring defect) as a real, standalone bug fix with its own acceptance criteria (the test tests/integration/migration-apply-state-ledger-wiring.test.js must pass, specifically the "APPLIED ledger entry cannot suppress a real gap" case) -- not folded silently into FR-1\'s ledger-reseed work, since it is a different code path (verify-migration-apply-state.mjs\'s corrupt-entry detection logic, not the ledger data itself).',
  'PLAN should require FR-2 to explicitly enumerate a disposition (remediate vs. individually-justified baseline) for each of the 15 live sentinel findings before EXEC begins, and explicitly reject a blanket/wildcard baseline entry as satisfying the acceptance criteria.',
  'PLAN should decide and document whether the 3 live NOT_APPLIED migrations are in this SD\'s scope (apply them) or a named, cross-referenced companion action -- FR-4\'s "both green" claim cannot be verified true or false until this is settled.',
];

const summary = 'Explore-phase discovery for SD-LEO-INFRA-CHRONIC-RED-GUARD-001 located both guard workflows/scripts in full, traced their classification and blocking logic to exact line numbers, measured real CI history via gh run list/gh run view rather than trusting the submitted QF-derived premise, and found a pre-existing disposition-ledger mechanism (scripts/lib/migration-disposition-ledger.mjs) that the submitted FR-1/FR-2/FR-3 would have duplicated. Two of the submitted SD\'s three core causal claims (pg_net causes sentinel reds; CEREMONY_PENDING is the drift guard\'s sole blocker) were code- and history-contradicted; a genuine, previously-unknown FR-6 wiring defect and a live, accumulating (1->11->12) sentinel security backlog were surfaced instead. This exploration output was the basis for LEAD\'s scope correction (see metadata.lead_scope_correction on this SD).';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 95,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        '.github/workflows/migration-deploy-drift-guard.yml',
        'scripts/verify-migration-apply-state.mjs',
        '.github/workflows/security-linter-sentinel.yml',
        'scripts/sentinels/audit-security-linter.mjs',
        'scripts/lib/migration-disposition-ledger.mjs',
        'docs/audits/migration-dispositions.json',
        'lib/security/pg-net-exposure.js',
      ],
      ci_history_commands: [
        'gh run list --workflow=migration-deploy-drift-guard.yml --limit 20 --json conclusion,createdAt,status',
        'gh run list --workflow=security-linter-sentinel.yml --limit 20 --json conclusion,createdAt,status',
        'gh run view 32744548692 --json jobs',
        'gh run view 32744548692 --log-failed',
      ],
      quick_fixes_reviewed: ['QF-20260824-600', 'QF-20260824-315'],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
