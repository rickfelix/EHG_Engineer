#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 — REGRESSION sub-agent evidence at VERIFY.
 *
 * Backward-compatibility / regression check over the SD's deliberate change to
 * eva_architecture_plans write behavior (4 upsertArchPlan call sites, one CLI approval
 * choice, one cron read predicate). Supersedes the provisional crash-insurance row
 * d512f9f2-2f0e-43eb-82cf-ef29b2af76c2 written at the start of this check.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001';

const SUMMARY = [
  'Zero test regressions and zero broken callers across all 5 requested checks; CONDITIONAL_PASS rests on one NEW, LOW, previously-undisclosed downstream surface of the draft default (artifact-persistence-service’s Stage-14 ADR back-link), not on any break.',
  '(1) API signature: upsertArchPlan( has exactly 4 real call sites repo-wide -- stage-17-doc-generation.js:378 and :405 (retry), cascade-watcher.mjs:203, archplan-command.mjs:338 -- and ALL FOUR are inside this SD’s diff, each passing approved explicitly (false, false, false, and the CLI’s mandatory choice forwarded via buildUpsertArgs). There is NO caller outside the diff, so the approved = true default currently silently affects nothing; it is pure forward/external backward-compat, exactly as designed.',
  '(2) cascade-watcher Stage 2: the restored .eq(chairman_approved, true) is a RESTORATION to the originally-merged state, not a new predicate -- the file’s originating commit e24cebb968f (SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001) created both Stage 1 and Stage 2 with .eq(status, active).eq(chairman_approved, true) (diff lines +273/+274 and +374/+375) and documented that predicate in the module docblock (+159/+163); the only other prior commit (4a827efc9a8, count-truncation FR-6) touched pagination, not predicates. The no-filter variant never existed on origin/main -- it lived only inside this branch between feb61c27901 and a91382443c7 -- so no other SD can depend on all-active Stage 2 behavior.',
  '(3) CLI backward compat: archplan-command.mjs upsert is NEVER shelled out to programmatically -- zero hits in .github/workflows/*.yml, zero in package.json scripts, zero execSync/spawn call sites. All 8 textual occurrences are human-facing doc examples or printed remediation strings, and every one already carries --draft: .claude/commands/brainstorm.md:1627, .claude/skills/eva-archplan.skill.md:177 (both updated in this diff), cascade-watcher.mjs:179/224/328, vision-evidence-scorer.js:261, archplan-command.mjs usage docblock:32. No caller breaks on the new hard-error.',
  '(4) DB read/write shape: of the 13 modules reading eva_architecture_plans, only TWO apply a status/approval predicate -- trust-elevation.js:57-60 (.eq(chairman_approved, true), the disclosed SECURITY item, confirmed intentional, its 2 test files pass unchanged) and artifact-persistence-service.js:388-396 (the NEW LOW finding, see warnings). The other 11 readers key on plan_key / venture_id / vision_key / id with no status or approval filter and are unaffected.',
  '(5) Tests: 3 escalating runs, 0 failures -- 7 touched-area files 80/80; lib/eva/__tests__ + scripts/eva/__tests__ 33 files 451/451; every test file referencing trust-elevation / adr-extractor / artifact-persistence-service / create-orchestrator-from-plan, 49 files 581 passed / 12 skipped / 0 failed.',
].join(' ');

const WARNING_1 = [
  'NEW (LOW, non-breaking, previously undisclosed): lib/eva/artifact-persistence-service.js:388-396 is a SECOND consumer meaningfully affected by the draft default, alongside the already-disclosed trust-elevation.js.',
  'Its Stage-14 ADR-extraction hook selects the newest plan for a venture with .eq(status, active); because cascade-watcher Stage 1 and stage-17-doc-generation now write status=draft, a venture whose ONLY arch plan came from those automated writers will resolve archPlan === null there.',
  'This degrades gracefully and is NOT a break: persistADRs’ architecturePlanId is documented nullable (adr-extractor.js:119) and guarded by an if (architecturePlanId) check at adr-extractor.js:183, so the ADRs still persist to leo_adrs -- only the eva_architecture_plans.adr_ids back-link is skipped until the plan is promoted.',
  'It is also not novel in kind: artifact-persistence-service’s own eager-synthesis insert at line 1461 already wrote status: draft before this SD, so the null-archPlan path was already reachable on main.',
  'Flagged so the SD’s disclosed-behavior-change list names BOTH gated consumers rather than only trust-elevation.',
].join(' ');

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 88,
    phase: 'VERIFY',
    execution_time_ms: 0,
    summary: SUMMARY,
    critical_issues: [],
    warnings: [WARNING_1],
    recommendations: [
      'Add lib/eva/artifact-persistence-service.js:388-396 (Stage-14 ADR back-link) to the SD’s disclosed behavior-change list next to lib/eva/bridge/trust-elevation.js, so the record shows both status/approval-predicated consumers rather than implying trust-elevation is the only one. Documentation only -- no code change recommended, the null path is already guarded.',
      'When lib/eva/archplan-promote.js gets its first caller (already-disclosed deferral), that follow-up should confirm whether promoting a draft backfills the adr_ids back-link for ADRs extracted while the plan was still draft, or accepts them as permanently unlinked. This is the only lasting side effect the LOW finding leaves behind.',
    ],
    detailed_analysis: {
      commands_run: [
        'git diff origin/main...HEAD --name-only -> 30 files',
        'git log --oneline -5 -- scripts/cron/cascade-watcher.mjs -> a91382443c7, 555e3fe4ed0, feb61c27901 (all this SD), 4a827efc9a8 (FR-6 count-truncation, pagination only), e24cebb968f (originating cascade SD)',
        'git show e24cebb968f -- scripts/cron/cascade-watcher.mjs | grep -E "chairman_approved|status" -> +273/+274 and +374/+375 both add the status=active AND chairman_approved=true pair; docblock +159/+163 documents the same predicate. Restoration confirmed as a return to originally-merged behavior.',
        'grep -rn "upsertArchPlan(" lib scripts src api server tests (excluding __tests__/node_modules) -> definition at lib/eva/archplan-upsert.js:15 plus exactly 4 call sites, all inside this SD diff',
        'Read all 4 call sites: stage-17-doc-generation.js:391 approved:false, :411 approved:false (retry path, comment explicitly forbids silent promotion), cascade-watcher.mjs:203 approved:false, archplan-command.mjs:338 forwards approved through buildUpsertArgs(...)',
        'grep -rn "archplan-command" .github package.json lib src .claude scripts docs -> zero execSync/spawn/workflow/package.json invocations; 8 human-facing occurrences, all carrying --draft (brainstorm.md:1627, eva-archplan.skill.md:177, cascade-watcher.mjs:179/224/328, vision-evidence-scorer.js:261, archplan-command.mjs:32)',
        'grep -rn "eva_architecture_plans" lib src api server scripts (excluding __tests__/one-off/archive) -> 13 reader modules; per-file grep -A6 for status / chairman_approved predicates -> only trust-elevation.js:57-60 and artifact-persistence-service.js:388-396 apply one',
        'Read lib/eva/adr-extractor.js:176-200 -> confirmed the if (architecturePlanId) guard, so a null plan id skips only the adr_ids back-link and never throws',
        'Read lib/eva/artifact-persistence-service.js:1455-1472 -> its own eager-synthesis insert already wrote status: draft pre-SD, so the null-archPlan path was already reachable on main',
        'npx vitest run --project unit <7 touched-area files incl. scripts/__tests__/cascade-watcher.test.js and cascade-status.test.js> -> 7 files, 80/80 passed',
        'npx vitest run --project unit lib/eva/__tests__ scripts/eva/__tests__ -> 33 files, 451/451 passed',
        'npx vitest run --project unit $(grep -rl -E "trust-elevation|adr-extractor|artifact-persistence-service|create-orchestrator-from-plan" --include=*.test.js lib scripts tests) -> 49 passed + 1 skipped files, 581 passed / 12 skipped / 0 failed',
      ],
      check_1_api_signature: {
        verdict: 'PASS',
        call_sites_total: 4,
        call_sites_outside_diff: 0,
        all_pass_approved_explicitly: true,
        default_true_silently_affects: 'nothing today',
      },
      check_2_cascade_stage2: {
        verdict: 'PASS',
        restored_filter_matches_originating_commit: 'e24cebb968f',
        no_filter_variant_ever_on_main: false,
        other_sd_dependency: 'none possible',
      },
      check_3_cli_backward_compat: {
        verdict: 'PASS',
        programmatic_invocations: 0,
        workflow_invocations: 0,
        package_json_invocations: 0,
        doc_and_remediation_strings: 8,
        all_carry_draft_flag: true,
      },
      check_4_db_shape: {
        verdict: 'CONDITIONAL',
        readers_total: 13,
        readers_with_status_or_approval_predicate: 2,
        disclosed: 'lib/eva/bridge/trust-elevation.js:57-60',
        new_low_finding: 'lib/eva/artifact-persistence-service.js:388-396',
        unaffected_readers: 11,
      },
      check_5_tests: {
        verdict: 'PASS',
        touched_area: '80/80 (7 files)',
        eva_dirs: '451/451 (33 files)',
        downstream_consumers: '581 passed / 12 skipped / 0 failed (49 files + 1 skipped)',
        regressions: 0,
      },
      known_items_not_re_reported: [
        'CLI upsert --approved can flip a draft to active without archplan-promote.js self-approval guard (disclosed, prior SECURITY CONDITIONAL_PASS)',
        'archplan-promote.js has no caller yet (disclosed, deferred)',
        'FR-6 approved_by column deferred, no DDL',
        'pre-existing eslint no-unused-vars in lib/eva/__tests__/archplan-upsert.test.js ~line 79 (unrelated earlier commit)',
        'cascade-watcher Stage 2 filter removed-then-restored within this SD (VALIDATION W1) -- treated as the corrected final state and verified against e24cebb968f rather than re-reported',
      ],
      no_merge_blockers: true,
      files_modified_by_this_agent: 'none except this evidence script (read-only check, no migrations run)',
    },
    metadata: {
      independent_verification: true,
      supersedes_provisional_row: 'd512f9f2-2f0e-43eb-82cf-ef29b2af76c2',
      head_commit: 'a91382443c7',
      pr: '8984',
      tests_passed: '0 failures across 3 escalating runs (80/80, 451/451, 581 passed + 12 skipped)',
      new_findings: 1,
      new_findings_severity: 'LOW',
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'REGRESSION',
    probeExistsRelative: 'scripts/one-off/archplan-verify-regression-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults(
    'REGRESSION',
    sdRow.id,
    { code: 'REGRESSION', name: 'Regression' },
    results,
    { sdKey: SD_KEY, phase: 'VERIFY' },
  );
  console.log('STORED:', 'REGRESSION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
