#!/usr/bin/env node
/**
 * SECURITY sub-agent RE-VERIFICATION for SD-LEARN-FIX-ADDRESS-PAT-LES-012, EXEC-TO-PLAN.
 * Supersedes the FAIL verdict in sub_agent_execution_results 9d21ac12 (that row stands as
 * the incident record; this row is the re-review against HEAD 23a0b39532c).
 *
 * READ PROVENANCE: worktree
 * C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEARN-FIX-ADDRESS-PAT-LES-012
 * at HEAD 23a0b39532c9694e60ad16b4d02211a21f13f857. Every DB figure below was re-measured
 * live by this reviewer via the exec_sql RPC (SELECT-only) against product_requirements_v2
 * and governance_audit_log -- none is carried over from the team lead's status report or
 * from any other sub-agent's row.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-012';

const findings = [
  {
    id: 'restore-independently-verified-byte-exact-on-1364-rows',
    severity: 'INFO',
    summary:
      "BLOCKING CONDITION 1 -- SUBSTANTIALLY MET, RE-MEASURED NOT ACCEPTED. I recomputed the restore state from the ORIGINAL backfill audit rows rather than trusting the reported figures. Anchoring on governance_audit_log UPDATE rows in [2026-09-14 02:46:00, 02:49:00] whose new_values->metadata carries integration_backfill, taking DISTINCT ON (record_id) ORDER BY changed_at ASC (so the restore's own later audit rows cannot contaminate the baseline): 1,382 rows had pre-backfill keys; 1,364 now satisfy jsonb containment p.metadata @> original; 18 do not; 0 lost the provenance marker. Those match the reported 1,364/1,382 exactly. I then ran TWO checks the status report did not claim, because containment alone only proves old-keys-are-present: (a) NO OVER-RESTORE -- 0 of the 1,364 carry any key outside original-union-marker, so the restore did not merge in foreign data; (b) VALUE FIDELITY -- (p.metadata - 'integration_backfill') = old_values->'metadata' is EXACTLY TRUE for all 1,364, 0 divergent, i.e. byte-identical subtrees, not merely key-present. The remediation therefore did not introduce a second incident. Separately: integration_operationalization is non-NULL on all 1,570 and 0 rows remain NULL table-wide, so the restore did not undo the SD's actual objective.",
  },
  {
    id: 'eighteen-rows-still-missing-64-keys-recoverable-but-time-sensitive',
    severity: 'HIGH',
    summary:
      "THE REMAINING GAP, STATED PRECISELY. 18 rows still hold only the single integration_backfill key, and 64 metadata keys across them are still destroyed. All 18 retain an intact governance_audit_log row with recoverable prior keys (re-verified: with_recoverable_keys = 18/18), so nothing is permanently lost yet. 206 rows currently read marker-only = 188 that were genuinely {} before the backfill (correct end state, nothing to restore) + these 18. A SPECIFIC, TIME-SENSITIVE RISK the status report did not name: restore-integration-backfill-metadata.mjs:92-99 skips any row whose metadata key count is not exactly 1. If ANY legitimate writer touches one of these 18 PRDs before the authorization arrives -- and PRD metadata has live concurrent writers, e.g. storeSubAgentResults stamps metadata.security_analysis, which I observed happen on this very SD's PRD -- that row's key count becomes 2, the script skips it PERMANENTLY, and its keys are never restored by the automated path. The audit row survives, so manual recovery would still be possible, but the automated remediation abandons it silently. This is why the 18 are urgent rather than merely outstanding.",
  },
  {
    id: 'permission-blocker-corroborated-and-enumeration-hypothesis-refuted',
    severity: 'INFO',
    summary:
      "I TESTED THE STATED BLOCKER RATHER THAN ACCEPTING IT, and also tested a competing hypothesis. (a) CORROBORATED: my own attempt to run scripts/one-off/restore-integration-backfill-metadata.mjs -- in DRY-RUN, which performs no writes -- was denied by the Claude Code auto-mode permission classifier, from a different seat than the team lead's. The blocker is real and is not specific to that session. (b) COMPETING HYPOTHESIS REFUTED: fetchAllMarkedRows uses .range() OFFSET pagination with NO .order(), which is exactly the silent-row-skipping shape this SD's own backfill header blames for the prior ad-hoc backfill only reaching 707 rows -- so a plausible alternative explanation for the 18 was enumeration loss, not permissions. I replicated that query verbatim across 3 independent trials: 1,570 returned / 1,570 distinct / 0 duplicates each time, and it saw all 206 marker-only rows (ground truth from a COUNT: 206). Enumeration is NOT dropping the 18. The permission gate is genuinely the only thing standing between the current state and 1,382/1,382. The missing ORDER BY remains a latent fragility worth fixing (Postgres guarantees no ordering without it; it is stable here by luck of a 2-page result set), but it is not this gap's cause.",
  },
  {
    id: 'preservation-assertion-is-a-genuine-guard-mutation-tested',
    severity: 'INFO',
    summary:
      "BLOCKING CONDITION 3 -- MET, AND PROVEN NON-VACUOUS. This mattered more than usual: my original FAIL found that FR-5's AC-4 passed equally well under the destructive implementation, so a new assertion that merely passes today would repeat that defect. Running the suite is not evidence the assertion has teeth. I therefore MUTATION-TESTED it: I reconstructed the old blind-replace writeBackfillRow against the test's own makeWriteFakeSupabase fake and re-ran the preservation assertion. Result: post-write metadata keys = ['integration_backfill'], 0 of 4 pre-existing keys survived -- the assertion FAILS against the old implementation. It is a genuine regression guard. The fake is also faithful to the real mechanism: state.row = { ...state.row, ...patch } models PostgREST's column-level replace, which is precisely the semantic that caused the incident. Full suite re-run at HEAD: 4 files, 61 tests, all passing (backfill-integration-operationalization-v2, prd-creator-integration-default, gates/integration-section-parity, prd/integration-placeholder-consumer-parity).",
  },
  {
    id: 'rollback-plan-corrected-in-the-database-with-supersession-visible',
    severity: 'INFO',
    summary:
      "BLOCKING CONDITION 4 -- MET, verified in the DATABASE (source of truth) rather than in the authoring script. The live PRD row PRD-SD-LEARN-FIX-ADDRESS-PAT-LES-012's integration_operationalization.observability_rollout.rollback_procedure now reads: 'INCIDENT UPDATE (2026-09-14) ... the original text (re-null rows carrying the provenance marker) was WRONG -- it destroys the metadata restoration path. Correct procedure: run scripts/one-off/restore-integration-backfill-metadata.mjs to restore pre-backfill metadata from governance_audit_log BEFORE any other remediation; only re-null integration_operationalization afterward if a full backfill revert is genuinely needed.' Good practice worth recording: the wrong text was marked wrong and superseded IN PLACE rather than silently deleted, so a future reader sees the correction and its reason instead of an unexplained rewrite.",
  },
  {
    id: 'backfill-merge-correct-but-uses-the-documented-read-spread-write-antipattern',
    severity: 'MEDIUM',
    summary:
      "BLOCKING CONDITION 2 -- MET FOR THE INCIDENT CLASS, with a named residual. writeBackfillRow (backfill-integration-operationalization-v2.mjs:88-125) now SELECTs the row's current metadata and spreads it into the payload, so provenance is added and nothing pre-existing is dropped. That closes the blind replace. The residual: read-then-spread-then-write is ITSELF the pattern lib/coordinator/safe-metadata-merge.mjs:14-19 names as 'the read-spread-write anti-pattern ... unsafe by construction' -- between the SELECT and the UPDATE, a concurrent metadata write is lost, because the UPDATE lands a full blob built from a stale snapshot. The .is('integration_operationalization', null) guard does NOT close this: it protects the integration column, not metadata, and a concurrent writer can stamp metadata on a row whose integration column is still NULL (again, storeSubAgentResults does exactly this to PRD rows). WHY THIS IS MEDIUM AND NOT A BLOCKER: 0 rows table-wide remain NULL, so a re-run enumerates nothing, and the write-path fix in this same SD prevents new NULL rows from appearing -- so the exposed set is empty today and stays empty by construction. It is a correctness debt in a script that should not need to run again, not a live hazard. The same read-then-merge shape now sits at prd-creator.js:355-362; there the read and write are in one function with a narrow window and it is the conventional pattern for that path, so I rate it the same residual, not a separate defect.",
  },
  {
    id: 'restore-script-write-guard-does-not-match-its-own-comment-and-docstring',
    severity: 'MEDIUM',
    summary:
      "A DEFECT IN THE REMEDIATION SCRIPT ITSELF, found by reading the guard rather than the comment above it. restore-integration-backfill-metadata.mjs:130-132 comments 'only restore if the row STILL has exactly the single provenance key (never clobber a newer legitimate write)', but the filter it applies is .not('metadata->integration_backfill', 'is', null) -- which tests only that the MARKER IS PRESENT, never that the row still has exactly one key. The marker is present on all 1,570 rows by definition, so this guard is satisfied unconditionally and enforces nothing. The real single-key check lives at :92-99 and reads row.metadata from the snapshot fetched once at :80, so the read-to-write window is the ENTIRE loop duration, not per-row. Consequence: if a concurrent writer adds a key to one of the target rows mid-run, the write proceeds and .update({ metadata: restoredMetadata }) blind-replaces -- destroying that new key. Same defect class as the incident, inside the script written to remediate it. Compounding it, the module docstring at :21-23 asserts the per-row guard is 're-checked live, not from a stale read', which is not true of :92. The :146 post-write key-count check would catch some cases after the fact but cannot prevent the loss. CONCRETE FIX: make the write a compare-and-swap on the pre-read value -- .eq('metadata', row.metadata) -- or re-SELECT the row immediately before writing and re-check the key count. This should be corrected BEFORE the authorized run against the final 18, since that run is exactly when a concurrent write is most likely to matter.",
  },
  {
    id: 'incident-note-misattributes-the-root-cause-to-this-sub-agent',
    severity: 'LOW',
    summary:
      "A CORRECT FIX ATTACHED TO A SUBTLY WRONG REASON, recorded because the reason is what the next engineer will copy. The incident header at backfill-integration-operationalization-v2.mjs:68-80 states 'Root cause per SECURITY: no read-before-write, so the prior value was never available to merge.' That is not what evidence row 9d21ac12 found. My finding was that the write BLIND-REPLACED a jsonb column, and my root-cause finding ('repo-had-a-named-helper-for-exactly-this-anti-pattern') explicitly stated that read-spread-write is ALSO the documented-unsafe form and that the real gap is the absence of an atomic-merge seam for product_requirements_v2. As written, the header canonises read-before-write as the SECURITY-endorsed remedy, which is precisely how the residual in the finding above will get reproduced in the next script that needs a metadata patch. Suggested correction: 'Root cause: supabase .update() replaces a jsonb column; no atomic-merge seam exists for product_requirements_v2 (lib/coordinator/safe-metadata-merge.mjs covers strategic_directives_v2 only). Interim fix: read-before-write, which closes the blind replace but retains a documented TOCTOU residual.'",
  },
  {
    id: 'followups-recommendation-file-the-helper-generalisation-leave-the-rest-out',
    severity: 'INFO',
    summary:
      "MY ANSWER ON THE OPEN FOLLOW-UPS, since it was asked directly. PULL IN: none. FILE NOW AS ITS OWN SD: generalising lib/coordinator/safe-metadata-merge.mjs to a (table, pk, patch) signature, or adding a lint rule refusing a literal metadata object inside a supabase .update() outside an approved merge seam. That is the only follow-up that structurally prevents recurrence of THIS class, and both residuals above (backfill TOCTOU, restore-script guard) collapse into it -- but it touches a shared helper with 9 live call sites whose hold-flag semantics on strategic_directives_v2 are safety-critical, so folding it into this SD would blow well past the LOC guidance and put an unrelated blast radius on an incident-remediation branch. It should be filed rather than left as a prose note, because an unfiled follow-up on a shared helper is indistinguishable from a decision not to do it. LEAVE OUT ENTIRELY: the 2 pre-existing LES-010 main-guard retrofits and guarding scripts/archive/one-time/backfill-prd-integration.js -- genuinely unrelated to this SD's defect, and the archived script is already inert by virtue of living under scripts/archive/.",
  },
  {
    id: 'security-axes-unchanged-and-re-checked-at-head',
    severity: 'INFO',
    summary:
      "THE FOUR NON-DATA AXES, RE-CHECKED AT HEAD 23a0b39532c RATHER THAN INHERITED FROM THE PRIOR ROW, since the branch gained a new script and ~1,690 lines since that review. CREDENTIALS: the new restore script uses createSupabaseServiceClient() (service-role required, throws without it, no anon fallback); no key is logged, and its console output is counts plus error .message strings only. INJECTION: no raw SQL, no RPC, no string-built filters anywhere in the new or changed files; every filter value is a constant, a module constant (WINDOW_START/WINDOW_END), or a row id returned by the preceding SELECT. NC-EXEC-006: restore-integration-backfill-metadata.mjs:164 carries the isMainModule(import.meta.url) guard, so importing it for inspection cannot trigger a live restore -- important because this file mutates production data; its named exports (fetchAllMarkedRows, findPreBackfillMetadata, run) are inert at import. PROVENANCE: the marker payload is unchanged and still leaks nothing (ISO timestamp, SD key, script name, PAT reference, shape string; no session id, credential, token or path), and it now sits ALONGSIDE the restored keys rather than in place of them, so it augments the audit trail as originally intended instead of replacing it.",
  },
];

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 95,
    findings,
    conditions: [
      'Complete the restore of the final 18 rows (64 keys) once authorization lands. EXIT PREDICATE, independently checkable: jsonb containment p.metadata @> original holds for 1,382/1,382 rows measured against the ORIGINAL backfill audit window, with 0 rows losing the integration_backfill marker.',
      'Before that authorized run, fix restore-integration-backfill-metadata.mjs:130-132 so the write-time guard actually enforces the single-key condition its comment claims (compare-and-swap on the pre-read metadata, or a fresh re-SELECT and key-count re-check immediately before the UPDATE). As written the guard enforces nothing and the run could blind-replace a concurrent write.',
      'Correct the root-cause attribution in backfill-integration-operationalization-v2.mjs:68-80, which credits SECURITY with "no read-before-write" as the root cause; the finding was the jsonb blind replace, and read-spread-write is itself the documented-unsafe form.',
      'File the safe-metadata-merge generalisation (or the equivalent lint rule) as its own SD rather than carrying it as a prose follow-up.',
    ],
    justification:
      'Upgraded from FAIL (row 9d21ac12) to CONDITIONAL_PASS on re-measured evidence, not on the status report. All three code/process conditions are genuinely closed: the merge fix is real, the preservation assertion is mutation-tested and FAILS against the old implementation (so it is not a repeat of the vacuous AC-4), and the rollback plan is corrected in the database. The data condition is 98.7% closed and, critically, closed CORRECTLY: the 1,364 restored rows are byte-identical to their pre-backfill state with zero over-restore and zero divergence, so the remediation introduced no second incident. It is not a PASS because 64 metadata keys across 18 rows remain destroyed, and because the remediation script that must finish the job carries a write-time guard that does not do what its comment says. It is no longer a FAIL because nothing here is an unaddressed engineering defect or an unrecovered loss: all 18 retain intact audit rows, the holding state is idempotent and cannot corrupt further, and the sole obstacle is an external permission gate which I independently confirmed from a separate seat and which is not caused by any enumeration or logic defect in the script.',
    metadata: {
      supersedes_evidence_row: '9d21ac12-b2e8-4838-bf69-113ac51959d1',
      reviewed_at_head: '23a0b39532c9694e60ad16b4d02211a21f13f857',
      blocking_conditions_status: {
        '1_restore_from_audit_log': 'PARTIAL -- 1,364/1,382 byte-exact, 18 outstanding, all 18 still recoverable',
        '2_backfill_true_merge': 'MET -- blind replace closed; read-spread-write TOCTOU residual, exposed set currently empty',
        '3_preservation_assertion': 'MET -- mutation-tested, fails against the old implementation',
        '4_rollback_plan_corrected': 'MET -- verified in the live PRD row, supersession visible',
        'bonus_prd_creator_346': 'MET -- now merges into existing metadata, undefined when neither side supplies it',
      },
      measured: {
        rows_with_original_keys: 1382,
        fully_restored_containment: 1364,
        not_restored: 18,
        rows_that_lost_the_marker: 0,
        over_restored_rows_with_unexpected_keys: 0,
        value_fidelity_exact_match: 1364,
        value_fidelity_divergent: 0,
        keys_still_missing: 64,
        outstanding_rows_with_recoverable_audit_keys: 18,
        marker_only_rows_now: 206,
        marker_only_that_were_genuinely_empty_pre_backfill: 188,
        integration_operationalization_null_table_wide: 0,
        marked_rows_that_went_null_again: 0,
        enumeration_trials: '3x 1,570 returned / 1,570 distinct / 0 duplicates / 206 marker-only seen',
        tests: '4 files, 61 tests, all passing at HEAD',
        mutation_test_result: 'preservation assertion fails against the old blind-replace implementation (0 of 4 prior keys survive)',
      },
      checks_run: [
        'git log/rev-parse and git diff --stat origin/main...HEAD (12 files, +1,692/-137)',
        'containment re-measurement anchored on DISTINCT ON (record_id) ORDER BY changed_at ASC over the ORIGINAL backfill audit window, so restore-era audit rows cannot contaminate the baseline',
        'over-restore check: any current key outside original-union-marker',
        'value-fidelity check: (metadata - marker) = old_values->metadata exact jsonb equality',
        'integration_operationalization NULL counts, table-wide and across the marked set',
        'outstanding-row audit recoverability count',
        'full read of the corrected writeBackfillRow and of restore-integration-backfill-metadata.mjs (all 171 lines)',
        'read of prd-creator.js:325-372 (the :346 metadata-merge fix)',
        'attempted dry-run of the restore script from an independent seat (denied by the permission classifier, corroborating the reported blocker)',
        'verbatim replication of fetchAllMarkedRows offset pagination, 3 trials, vs a COUNT ground truth',
        'vitest run of all 4 new/changed test files at HEAD',
        'mutation test of the preservation assertion against a reconstructed old blind-replace implementation',
        'live DB read of the PRD rollback_procedure text (source of truth, not the authoring script)',
        'credential / injection / NC-EXEC-006 / provenance re-check across the new restore script',
      ],
      non_blocking_followups: [
        'Add .order() to fetchAllMarkedRows -- offset pagination without a stable sort is unordered by contract; measured stable across 3 trials here only because the result set spans 2 pages',
        'File the safe-metadata-merge.mjs generalisation (table, pk, patch) or an equivalent lint rule as its own SD',
        'Leave the 2 pre-existing LES-010 main-guard retrofits and the archived backfill-prd-integration.js out of this SD',
      ],
    },
    phase: 'EXEC_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_KEY,
    { name: 'SECURITY' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN', source: 'manual' },
  );

  console.log('SECURITY RE-VERIFICATION EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  supersedes:', '9d21ac12-b2e8-4838-bf69-113ac51959d1');
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
