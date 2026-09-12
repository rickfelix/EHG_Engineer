#!/usr/bin/env node
/**
 * SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A — SECURITY re-review at EXEC, AFTER the FR-1..FR-6
 * revert (EXEC-TO-PLAN handoff evidence). Supersedes sub_agent_execution_results row
 * 329474a3-3819-4e87-9b29-6b4d7f4803ad (CONDITIONAL_PASS on SEC-1..SEC-4).
 *
 * Question answered: are SEC-1..SEC-5 genuinely CLOSED by commit 3cb96534ed8, or only
 * absent from the diff? Each closure was settled by ATTEMPTING it against the live database
 * (BEGIN/ROLLBACK for writes, with a post-rollback persistence check; read-only SELECT for
 * the filter/partition proofs) and by grepping tracked AND untracked trees for residual
 * references. Probes: .artifacts/sec-revert-*.mjs in this worktree.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = 'aaf65001-7031-46aa-882f-9f51281dc572';
const SD_KEY = 'SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A';

const results = {
  verdict: 'PASS',
  confidence: 95,
  execution_time_ms: 0,
  critical_issues: [],
  warnings: [
    {
      id: 'SEC-7',
      severity: 'LOW',
      issue: "scripts/feedback-staleness-check.js merges metadata client-side from a snapshot read once up front, then writes the whole JSONB column per row — a lost-update window the length of the entire sweep. NOT introduced by this SD (it is the established house pattern) but WIDENED in this one script.",
      evidence: "The candidate SELECT fetches metadata for all candidates in one paginated pass, then the loop issues one UPDATE per row setting metadata = {...candidate.metadata, marked_stale_at}. Any concurrent writer that changes metadata on a candidate between the initial SELECT and that row's UPDATE has its key silently dropped, because the write replaces the whole column from the stale snapshot. Measured candidate count today: 606 (read-only count, grown from the 524 measured pre-revert), so the window for the last row spans 606 sequential round-trips. Context that bounds the severity: read-then-spread-whole-column is the pattern at ~12 other feedback.metadata write sites (lib/governance/withheld-registry.mjs:170/239/263, lib/eva/uat-failure-triage.js:80, lib/coordinator/pending-question-timer.cjs:264, lib/quality/quarantine-engine.js:141/199, lib/quality/audit-logger.js:150, lib/quality/burst-detector.js:265, lib/quality/assist-engine.js:645, lib/uat/risk-router.js:492, lib/feedback/preclaim-feedback-rows.js:110) — those hold the window for a single row for milliseconds; this one holds it for the sweep. Collision probability is low because candidates are aged, untouched rows (status new|triaged, created_at older than 90 days). Impact is a lost subsystem marker, not a security-boundary violation, and the sweep is an unattended service-role script with no untrusted input.",
      location: 'scripts/feedback-staleness-check.js:78-95 (SELECT at :64-70, per-row UPDATE at :79-90)',
      recommendation: "Move the metadata read inside the loop: re-select metadata for that one id immediately before its UPDATE, narrowing the window to the house-pattern width (~3 lines). A server-side merge (metadata = metadata || jsonb_build_object(...) via RPC) would make it atomic and is the right long-term fix for all 13 sites, but that is a separate systemic SD, not this one's scope.",
    },
    {
      id: 'SEC-8',
      severity: 'INFO',
      issue: "Both converted sweeps now export main() but retain process.exit() / process.exitCode in the error paths inside the exported function, so an in-process caller gets the host process terminated instead of an error.",
      evidence: "scripts/feedback-age-out.mjs error paths at the candidate-count select and the update both set process.exitCode then call process.exit(); scripts/feedback-staleness-check.js calls process.exit(1) on missing env, on a failed candidate scan, and on a per-row update error. These were top-level statements pre-SD (correct there); the testability refactor moved them inside an exported function without converting them to throws. A test injecting a supabase client whose select errors would kill the vitest worker rather than assert on a rejection.",
      location: 'scripts/feedback-age-out.mjs:41-45,:52-56,:92-96; scripts/feedback-staleness-check.js:38-41,:73-76,:92-95',
      recommendation: 'Throw (or return an error result) from the exported main() and keep process.exit() in the isMainModule() entry block, where it already is for the fatal-catch path. Not security-relevant; flagged because the error paths are now part of an exported API surface. Out of scope for this SD unless a caller appears.',
    },
  ],
  conditions: [],
  justification: "PASS. All five findings from the prior CONDITIONAL_PASS are genuinely closed, and each closure was settled by attempt rather than by reading the diff. SEC-1/SEC-2/SEC-3/SEC-4 are closed by deletion: lib/governance/feedback-correction.js and its test are gone from the index and the working tree, and a grep of tracked AND untracked trees (lib, scripts, server, tests, src, api) finds ZERO functional references to the module or to rootIdOf / buildFeedbackCorrection / fetchLatestFeedback — the only residual mentions are doc-strings in the prior run's own committed evidence writer. No .or() filter built from interpolated input remains anywhere in the five reverted files (SEC-1's exact mechanism), and zero INSERTs into public.feedback remain (the only .insert( is into strategic_directives_v2), which removes SEC-2's unique-index surface by construction. SEC-3 is closed positively, not just by absence: the BEFORE UPDATE freeze trigger is back in the write path, proven live — UPDATEs touching title, rubric_score and error_hash were each REJECTED P0001, so the frozen columns the correction INSERT used to rewrite (error_hash on every single correction) are protected again. SEC-4 is likewise closed positively: because a plain UPDATE keeps the row's own id, `UPDATE ... SET duplicate_of_id=id, status='duplicate'` is now REJECTED 23514 chk_duplicate_requires_reference, so the two self-duplicate CHECKs that were structurally unable to fire for a fresh-id correction are enforceable again, and the app gate (validateDuplicate comparing against the URL :id) is now comparing against the row actually being written — app and DB agree. SEC-5 is closed structurally: the sweep issues one plain .update().eq('id', candidate.id) per candidate, creating no row, and fn_anon_ingress_prior_hour_count is count(*) over feedback filtered by created_at within the last hour — an UPDATE cannot move that count, and created_at is itself a frozen column. I also enumerated every non-internal trigger on public.feedback to rule out an indirect row-creation path on UPDATE: only feedback_freeze (rejects), log_feedback_resolution_violation (RAISE WARNING only, no INSERT) and update_feedback_updated_at (sets NEW.updated_at) fire, so there is no side-channel that could feed the limiter. SEC-0's premise falsification is confirmed independently: the live feedback_no_update WHEN clause covers only 38 content/provenance columns, and a single UPDATE of all ten lifecycle columns the five files touch (status, resolved_at, resolution_notes, resolution_sd_id, resolution_type, quick_fix_id, duplicate_of_id, archived_at, metadata, updated_at) was ACCEPTED live, with the rejections above serving as negative controls that the trigger was enabled and the positives are not a disabled-trigger artifact. Everything ran inside BEGIN/ROLLBACK and the target row was verified byte-identical to its pre-probe snapshot afterwards. The two fixes kept from the conversion are independently safe: the rubric_score gate reads a column that exists (quality_score genuinely does not exist on the table, so the old gate was a permanent no-op) and only ever ADDS a 422 denial — no branch grants promotion, so it is strictly stricter with a measured blast radius of exactly 1 row in 38,223; and the 500-on-update-failure return closes a real double-mint window without leaking more than the route's existing error style, behind requireAuth. The marked_stale_at marker does NOT wholesale-replace metadata — it spreads the row's own metadata and the behavior is test-pinned — and the .is('metadata->>marked_stale_at', null) idempotency filter genuinely discriminates (partition check plus a positive control on a widely-present key). Net posture is strictly better than pre-SD. Two new non-blocking findings recorded: SEC-7 (the sweep widens a pre-existing systemic metadata lost-update race) and SEC-8 (process.exit inside a now-exported function).",
  recommendations: [
    'No blocking action. The revert is the correct disposition of SEC-0 and it closes SEC-1..SEC-5 as a side effect rather than needing the four targeted fixes the prior run asked for — confirming that ruling on the premise before investing in the fixes was the cheaper order.',
    'SEC-7 is the only finding worth a follow-up and it is ~3 lines: re-read metadata inside the per-row loop in scripts/feedback-staleness-check.js so the lost-update window is one round-trip instead of the whole 606-row sweep. The broader systemic fix (server-side jsonb merge for all 13 feedback.metadata write sites) is a separate SD and should not be scoped here.',
    'Preserve the three kept behaviours under any later refactor: the rubric_score gate (it makes a dead gate live and strictly stricter), the 500-on-link-failure return (it closes the repeat-click double-mint), and the decision NOT to write status=\'stale\' (\'stale\' is not a member of feedback_status_check, so the pre-SD write would have failed 23514 regardless of any append-only trigger — this is a real latent bug the SD fixed, independent of the reverted mechanism).',
    'For PLAN: resolve-feedback.js\'s only remaining delta vs the pre-SD baseline is one removed blank line, and scripts/feedback-link-resolution.mjs is byte-identical, so the FR-1..FR-6 revert is faithful rather than approximate. The surviving deltas are confined to server/routes/feedback.js (2 kept fixes) and the two sweeps (kept fixes plus the testability refactor).',
  ],
  detailed_analysis: [
    'SECURITY re-review at EXEC for SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A, branch feat/SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A, HEAD 3cb96534ed8 (pushed). Supersedes row 329474a3 (CONDITIONAL_PASS). Scope: verify SEC-1..SEC-5 are CLOSED by the revert, not merely absent from the diff.',
    '',
    'METHOD. Closure claims were settled by attempt, not by diff reading. Writes ran inside BEGIN/ROLLBACK with savepoints per stage and a post-rollback persistence check (the target row was re-read and compared byte-for-byte to its pre-probe snapshot: unchanged). Negative controls were included specifically so that a disabled trigger could not masquerade as a passing positive. Probes: .artifacts/sec-revert-triggers.mjs (pg_get_triggerdef + function bodies), sec-revert-schema.mjs (column types, CHECK/FK defs), sec-revert-update-probe.mjs (6 positive stages, 4 negative controls, rollback check), sec-revert-fns.mjs (the two other enabled UPDATE triggers + the limiter), sec-revert-jsonb-filter.mjs (PostgREST JSONB partition proof, read-only), sec-revert-rubric.mjs (column existence + blast radius).',
    '',
    'SEC-1 (PostgREST .or() filter injection) — CLOSED BY DELETION, residual-reference check clean. lib/governance/feedback-correction.js is absent from `git ls-files`, from the working tree, and from the filesystem; so is tests/unit/governance/feedback-correction.test.js. A grep across tracked and untracked files (lib, scripts, server, tests, src, api; *.js/*.mjs/*.cjs/*.ts) for feedback-correction / buildFeedbackCorrection / rootIdOf / fetchLatestFeedback returns zero functional hits — the only matches are doc-string and location-field mentions inside scripts/one-off/feedback-001-a-security-exec-evidence.mjs, the prior run\'s own committed evidence writer, which is expected and inert. The mechanism itself is also gone from the surviving code: no `.or(` built from interpolated input exists in any of the five reverted files, and scripts/feedback-link-resolution.mjs:36 now carries an explicit comment that it uses two separate parameterized .eq() lookups rather than a string-interpolated .or(). lib/governance/resolve-feedback.js retains its UUID_REGEX guard on feedbackId before any query.',
    '',
    'SEC-2 (fourth live partial UNIQUE index, 23505 on a correction insert) — CLOSED STRUCTURALLY. A unique index cannot be violated by an UPDATE that leaves its key columns unchanged, and there are no INSERTs into public.feedback left: the only .insert( in the five files targets strategic_directives_v2 (server/routes/feedback.js:110). Worth stating for the one index whose key touches a column the revert DOES write: idx_feedback_chairman_override_dedup keys on (category, source_type, (metadata->>\'override_key\')), and the staleness sweep writes metadata — but it merges, preserving override_key verbatim, so the index key is byte-identical after the write and no duplicate is created. The operational consequence the prior run flagged is gone with it: the sweep has no category filter and called process.exit(1) on insert error, so one chairman_override row aging past 90 days would have aborted the whole unattended sweep on every subsequent run. An UPDATE of that row now simply succeeds.',
    '',
    'SEC-3 (correction INSERT bypassing the BEFORE-UPDATE immutability trigger) — CLOSED POSITIVELY. The revert puts feedback_freeze back in the write path, and I proved it fires rather than assuming it: UPDATE SET title=... rejected P0001, UPDATE SET rubric_score=100 rejected P0001, UPDATE SET error_hash=NULL rejected P0001, all with the append-only message naming the row. That last one is the concrete regression the prior run identified — the deleted helper NULLed error_hash on EVERY correction, so the latest-state row of any corrected error-capture chain lost a value the chairman-gated migration declares immutable. It can no longer be written at all. Live pg_get_triggerdef confirms the trigger is BEFORE UPDATE with a WHEN clause over 38 content/provenance columns and that feedback_freeze\'s body is an unconditional RAISE EXCEPTION, so the WHEN clause is the entire allowlist boundary.',
    '',
    'SEC-4 (self-duplicate CHECKs structurally unenforceable for corrections; GAP-1 predicates vacuous) — CLOSED POSITIVELY. Proven live: UPDATE SET duplicate_of_id=id, status=\'duplicate\' is REJECTED 23514 chk_duplicate_requires_reference. The reason the constraints work again is exactly the reason they could not work before — a plain UPDATE keeps the row\'s own id, so chk_feedback_no_self_duplicate (duplicate_of_id <> id) and chk_duplicate_requires_reference both have a meaningful id to compare against, whereas every correction got a fresh id that no predicate in the chain could match. The app-level gate is now consistent too: lib/quality/feedback-resolution-validator.js validateDuplicate compares effective.duplicate_of_id against the URL :id (server/routes/feedback.js passes the route param), and the UPDATE targets that same row, so the app gate and the DB constraint now guard the same identity instead of disagreeing. The forgeable outcome the prior run demonstrated (PATCH /api/feedback/<correction-id>/status with duplicate_of_id=<rootId> marking a chain a duplicate of itself) has no construction left. The vacuous GAP-1 assertions went away with the deleted test file.',
    '',
    'SEC-5 (rate-limiter DoS: 524 correction inserts per sweep run against a 200/hour ceiling) — CLOSED STRUCTURALLY AND BY MEASUREMENT. scripts/feedback-staleness-check.js now issues one plain .update({resolution_notes, metadata, updated_at}).eq(\'id\', candidate.id) per candidate. fn_anon_ingress_prior_hour_count reads, verbatim, count(*) FROM public.feedback WHERE source_type IS NOT DISTINCT FROM $1 AND created_at > now() - interval \'1 hour\' — it counts ROWS by created_at, so an UPDATE is invisible to it twice over: no row is created, and created_at is itself in the frozen set and cannot be moved. I did not stop at the limiter function: I enumerated every non-internal trigger on public.feedback to rule out an indirect row-creation path, and the three that can fire on UPDATE are feedback_freeze (rejects), log_feedback_resolution_violation (RAISE WARNING only — I read the body; it builds a JSONB detail object and logs it, no INSERT anywhere) and update_feedback_updated_at (sets NEW.updated_at). There is no path by which the sweep can add a row the limiter would count. Current candidate volume measured read-only: 606 rows, up from the 524 measured pre-revert, so the exposure would have grown had the INSERT design shipped.',
    '',
    'SEC-0 (the falsified premise) — CONFIRMED INDEPENDENTLY, and the revert is the right response. The live feedback_no_update WHEN clause lists only content and provenance columns (title, description, category, type, feedback_type, original_type, source_application, source_type, source_id, provenance_source, command, environment, page_url, use_case, error_message, stack_trace, error_hash, user_id, venture_id, created_at, first_seen, sentry_*, severity, effort_estimate, value_estimate, votes, converted_at, conversion_reason, ignore_pattern, rubric_score, quality_assessment, auto_correction_status, corrective_class, source_gate, gate_run_id, sd_id). All ten columns the five files write are outside it, all ten exist on the table, and a single UPDATE of all ten was ACCEPTED (1 row). I ran six positive stages covering the exact payload shapes in production: the full ten-column write; the promote-to-sd shape (resolution_sd_id + status=\'triaged\' + updated_at); a quick_fix_id write against a real quick_fixes FK referent; duplicate_of_id + status=\'duplicate\' against a real peer row; the staleness shape (resolution_notes + server-side metadata merge + updated_at); and the age-out shape (archived_at alone). All six accepted, all four negative controls rejected, nothing persisted after ROLLBACK.',
    '',
    'KEPT FIX (a) — rubric_score gate. quality_score genuinely does not exist on public.feedback (live information_schema: rubric_score and quality_assessment exist, quality_score does not), so the pre-SD gate\'s `feedback.quality_score != null` was permanently false and the gate never fired. The corrected gate only ever ADDS a 422 denial — there is no branch in which a rubric_score value GRANTS promotion — so it is strictly stricter and cannot be an auth or authz bypass. Measured blast radius across all 38,223 feedback rows: 1 row has rubric_score < 40 and would now be blocked, 21 pass the threshold, 38,201 are NULL and so the gate still does not fire for them (unchanged behaviour, matching documented intent). Untrusted reachability is nil: app.use(\'/api/feedback\', requireAuth, feedbackRoutes) at server/index.js:248.',
    '',
    'KEPT FIX (b) — 500 on a failed feedback->SD link. Correct and a genuine improvement. The prior warn-and-succeed path let a repeat click mint a second SD, because the idempotency guard upstream reads resolution_sd_id and a failed write meant it never landed while the SD row persisted in strategic_directives_v2. The error body returns the created sd_key so the caller is not left blind about the orphan, and echoing updateError.message matches the route\'s existing error style and sits behind requireAuth, so it is not an information-disclosure regression.',
    '',
    'KEPT FIX (c) — metadata.marked_stale_at marker. It does NOT wholesale-replace metadata: the candidate SELECT includes the metadata column and the write spreads {...(candidate.metadata || {}), marked_stale_at}, preserving every other subsystem\'s keys, and this is test-pinned rather than incidental (tests/unit/scripts/feedback-staleness-check.test.js asserts payload.metadata.other_key === \'preserved\' alongside payload.metadata.marked_stale_at being defined). The per-row UPDATE rather than a bulk .in(id, ids) write is load-bearing for exactly this reason, and the code comment says so. I separately verified the idempotency filter is real rather than silently matching everything: guarded count 606, inverse count 0, unguarded count 606, so B+C=A partitions correctly; and a positive control on a key that IS widely present (metadata->>repo: 2549 not-null + 35674 null = 38223 total) proves the PostgREST ->> is-null operator discriminates rather than degenerating. Zero rows currently carry marked_stale_at, which is why the guard excludes nothing yet — expected for a marker whose first run has not happened. Separately: not writing status=\'stale\' is itself a real fix, because \'stale\' is not a member of feedback_status_check (allowed: new, triaged, in_progress, resolved, wont_fix, duplicate, invalid, backlog, shipped), so the pre-SD write would have failed 23514 regardless of any append-only trigger.',
    '',
    'REVERT FIDELITY. lib/governance/resolve-feedback.js differs from the pre-SD baseline (merge-base b26d039d7f9) by one removed blank line and nothing else; scripts/feedback-link-resolution.mjs is byte-identical. server/routes/feedback.js carries only the two kept fixes. The two sweeps carry the kept fixes plus an isMainModule/exported-main testability refactor whose DB write is a plain UPDATE matching pre-SD semantics. Targeted test run (4 files, tests/unit/governance/resolve-feedback.test.js, tests/unit/scripts/feedback-staleness-check.test.js, tests/unit/scripts/feedback-age-out.test.js, tests/integration/api-routes/feedback-routes.test.js): 42 passed, 14 skipped, 0 failed — the skips are the db-tier runtime guard refusing network against a non-designated ref, not assertion failures.',
    '',
    'WHAT I DID NOT FIND. No SQL injection (no raw SQL in the reviewed surface). No hardcoded secrets. No missing authentication — the mutation routes sit behind requireAuth, though with no role check, which is pre-existing and consistent with the rest of the router table. No mass-assignment on PATCH /:id/status: it destructures exactly five lifecycle fields from req.body (status, resolution_sd_id, quick_fix_id, duplicate_of_id, resolution_notes) and adds only updated_at, so extra body keys cannot reach the UPDATE and no frozen column is reachable from a request. No new XSS surface, no cross-schema foreign keys.',
  ].join('\n'),
  metadata: {
    reviewed_commit: '3cb96534ed8',
    reviewed_branch: 'feat/SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A',
    baseline_merge_base: 'b26d039d7f9',
    supersedes_result_row: '329474a3-3819-4e87-9b29-6b4d7f4803ad',
    scope: 'Verify SEC-1..SEC-5 closed by the FR-1..FR-6 revert; re-validate the 2 kept fixes',
    closed_findings: {
      'SEC-1': 'CLOSED by deletion — module absent from index/worktree/filesystem; zero functional refs to it or rootIdOf/buildFeedbackCorrection/fetchLatestFeedback across tracked+untracked trees; no interpolated .or() left in any reverted file',
      'SEC-2': 'CLOSED structurally — zero INSERTs into public.feedback remain; the one written column that participates in a partial unique key (metadata->>override_key) is preserved verbatim by the merge, so the index key is unchanged',
      'SEC-3': 'CLOSED positively — freeze trigger back in the write path, PROVEN: title / rubric_score / error_hash UPDATEs each rejected P0001 (BEGIN/ROLLBACK)',
      'SEC-4': 'CLOSED positively — self-duplicate CHECK fires again on a plain UPDATE, PROVEN: duplicate_of_id=id rejected 23514 chk_duplicate_requires_reference; app gate and DB constraint now guard the same identity',
      'SEC-5': 'CLOSED structurally — per-candidate plain UPDATE creates no row; fn_anon_ingress_prior_hour_count counts rows by created_at (itself frozen); no UPDATE-fired trigger on feedback inserts rows (log_feedback_resolution_violation is RAISE WARNING only)',
      'SEC-0': 'CONFIRMED falsified — all 10 lifecycle columns outside the 38-column frozen WHEN clause; full 10-column UPDATE ACCEPTED live',
    },
    proven_live: {
      lifecycle_update_accepted: '6/6 positive stages ACCEPTED (full 10-column write; promote-to-sd shape; quick_fix_id FK; duplicate_of_id+duplicate; staleness shape; age-out shape) — BEGIN/ROLLBACK',
      freeze_trigger_still_enforcing: '3/3 negative controls REJECTED P0001 (title, rubric_score, error_hash) — proves positives are not a disabled-trigger artifact',
      self_duplicate_check_enforceable: 'duplicate_of_id=id REJECTED 23514 chk_duplicate_requires_reference on a plain UPDATE',
      rollback_persistence_check: 'target row 04ccdfa4 re-read after ROLLBACK: byte-identical to pre-probe snapshot, nothing persisted',
      limiter_cannot_count_updates: "fn_anon_ingress_prior_hour_count body = count(*) FROM feedback WHERE source_type IS NOT DISTINCT FROM $1 AND created_at > now() - interval '1 hour'",
      trigger_inventory: 'all non-internal triggers on public.feedback enumerated: no UPDATE-fired trigger inserts a row',
      residual_refs: 'zero functional references to the deleted module across tracked+untracked lib/scripts/server/tests/src/api',
      jsonb_guard_partitions: 'guarded 606 + inverse 0 = unguarded 606; positive control metadata->>repo 2549 not-null + 35674 null = 38223 total',
      rubric_gate_blast_radius: 'quality_score does not exist on the table; rubric_score<40 = 1 row, >=40 = 21 rows, NULL = 38201, total 38223',
      sweep_volume: '606 candidates today (was 524 pre-revert) — all now UPDATEs, zero new rows',
      targeted_tests: '4 files, 42 passed / 14 skipped (db-tier guard) / 0 failed',
    },
    must_fix: [],
    non_blocking: ['SEC-7', 'SEC-8'],
    probe_scripts: '.artifacts/sec-revert-*.mjs in worktree SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A',
  },
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD_UUID,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_UUID,
    { name: 'Chief Security Architect', code: 'SECURITY' },
    results,
    { phase: 'EXEC', sdKey: SD_KEY },
  );
  console.log('STORED ID:', stored?.id, '| verdict:', stored?.verdict, '| phase:', stored?.phase, '| sd_id:', stored?.sd_id);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('FAILED:', err.message);
    process.exit(1);
  });
}
