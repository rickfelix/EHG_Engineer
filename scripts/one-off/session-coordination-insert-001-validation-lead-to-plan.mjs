#!/usr/bin/env node
/**
 * SD-LEO-FIX-SESSION-COORDINATION-INSERT-001 — VALIDATION at LEAD-TO-PLAN.
 *
 * Retroactive escalation: the fix shipped as QF-20260905-934 / PR #8447 (MERGED) BEFORE this SD
 * existed, because the diff touched a sensitive path (.github/workflows/...) on
 * lib/quick-fix/sensitive-path-registry.js, so QF-completion tooling refused to self-close.
 *
 * This is a verification of an ALREADY-SHIPPED fix, not a requirements derivation. Every claim in
 * the requesting brief was re-derived from the repo and from GitHub Actions logs rather than
 * accepted: the four files were read at HEAD, the non-CI path's "unchanged" claim was proven from
 * the diff hunk (context lines, not + lines), the new test was RUN (3/3), and — the decisive
 * instrument — the gate's OWN CI run on the fix PR was read to confirm it now takes `diff` mode,
 * with the pre-fix baseline run read for the contrast.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD = 'SD-LEO-FIX-SESSION-COORDINATION-INSERT-001';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 95,
  execution_time_ms: 0,
  summary:
    'The shipped fix is real, correct, and matches the SD\'s stated problem. All four artifacts verified at HEAD; PR #8447 is MERGED and its merge commit is an ancestor of origin/main. Independently proven end-to-end: the gate\'s own CI run on the fix PR reported "(diff): 0 violations" — genuinely blocking mode — against the pre-fix baseline run\'s "all (degraded), advisory: 41 violation(s) ... not blocking". Zero-yield gate is now live. Conditions are governance-record gaps (0 backlog items, unlinked QF row) and one newly-armed blast radius, not code defects.',
  critical_issues: [],
  warnings: [
    {
      id: 'VAL-1',
      severity: 'MEDIUM',
      issue: 'GATE 1 blocker: the SD carries 0 backlog items and 0 PRD rows',
      evidence:
        'sd_backlog_map for sd_id c9eea195-8650-4124-831b-a27db86c136e returns 0 rows; product_requirements_v2 by directive_id returns 0 rows. VALIDATION GATE 1 requires >=1 backlog item, and a DB constraint blocks status=\'active\' without one. The SD was created retroactively by leo-create-sd.js --from-qf, which seeded metadata.qf_origin_body but no backlog entry.',
      location: 'sd_backlog_map / strategic_directives_v2 c9eea195-8650-4124-831b-a27db86c136e',
      recommendation:
        'Seed at least one backlog item from metadata.qf_origin_body before moving the SD off draft. Blocking for activation only, not for the code verdict.',
    },
    {
      id: 'VAL-2',
      severity: 'MEDIUM',
      issue: 'Audit-trail gap: QF-20260905-934 has pr_url=null and commit_sha=null despite its PR being merged',
      evidence:
        'quick_fixes id=QF-20260905-934 reads status=escalated, pr_url=null, commit_sha=null. PR #8447 is MERGED (mergedAt 2026-09-07T05:29:26Z, mergeCommit 73883f93b99a853438b2ffdf11ea9ba5e79b3bf8). For an SD whose entire stated purpose is the governance/audit trail of this delivery, the QF row does not point at its own delivery — a reader dedup-ing on pr_url/commit_sha (the documented correct discriminator) sees nothing.',
      location: 'quick_fixes.QF-20260905-934',
      recommendation:
        'Backfill pr_url=https://github.com/rickfelix/EHG_Engineer/pull/8447 and commit_sha=953957ec4dbdbc85015cbf03d3f931dbff2bb4d7 on the QF row as part of this SD\'s audit-trail purpose.',
    },
    {
      id: 'VAL-3',
      severity: 'MEDIUM',
      issue: 'Newly-armed blast radius: 39 pre-existing violations across 25 files are now genuinely blocking for any PR that touches them',
      evidence:
        'Measured live on this branch: `node scripts/lint/session-coordination-insert-classguard-lint.mjs --all --json` reports 39 violations across 25 files / 5646 scanned (scripts/stale-session-sweep.cjs alone carries 11; lib/coordinator/* carries 7 across 7 files). Before this fix the gate could never block, so this backlog was inert. Now, diff mode only scans files a PR actually touches — so main stays green — but any future PR that incidentally edits one of those 25 files will HARD-FAIL where it previously would not have. The QF\'s original fix shape listed dispositioning this backlog as step (d); commit 241d3d11a22 explicitly defers it as out of scope.',
      location: 'scripts/** and lib/** (25 files, 39 sites)',
      recommendation:
        'Record this consequence on the SD as a known, accepted trade-off, and carry the disposition of the 39 sites (fix or eslint-disable-next-line with reasons) as a follow-up SD. The linter\'s own error message already documents the sanctioned escape hatch, so an incidentally-blocked PR has an immediate unblock path.',
    },
    {
      id: 'VAL-4',
      severity: 'LOW',
      issue: 'Brief mis-cites the fix commit: 953957ec4d is the seed-spec follow-up, not the code fix',
      evidence:
        '`git show 953957ec4d --stat` = 1 file changed, +7/-1, scripts/audit/control-seed-specs.json only. The actual code fix (workflow + script + test, +129/-1 across 3 files) is commit 241d3d11a22. 953957ec4d is merely the branch tip that got merged, so "the merged commit" is defensible, but citing it as the fix commit would mislead anyone auditing this record later.',
      location: 'requesting brief / commit 953957ec4db vs 241d3d11a22',
      recommendation: 'Cite 241d3d11a22 as the code fix and 953957ec4db as the CI-remediation follow-up in the PRD and audit record. Non-blocking.',
    },
    {
      id: 'VAL-5',
      severity: 'LOW',
      issue: 'Brief overstates the sibling precedent: count-truncation-diff-lint.mjs does NOT fall back to --all',
      evidence:
        'scripts/lint/count-truncation-diff-lint.mjs:221-224 — its catch prints "diff base unavailable ... nothing to lint (advisory fallback)" and exits 0; it never runs an --all sweep. So the precedent is for local-dev advisory LENIENCY, not for the --all mechanism. The shipped in-code comment words this correctly ("mirrors the same local-dev leniency"), so the code is not wrong — only the brief\'s paraphrase is. Separately, the fetch-depth: 0 precedent IS real and was verified at .github/workflows/count-truncation-diff-lint.yml:41-43.',
      location: 'scripts/lint/count-truncation-diff-lint.mjs:221-224',
      recommendation: 'No code change. Keep the distinction in the PRD wording. Non-blocking.',
    },
    {
      id: 'VAL-6',
      severity: 'LOW',
      issue: 'Sibling control retains the same latent silent-degrade shape; four other workflows carry the related brace-glob bug',
      evidence:
        'count-truncation-diff-lint.mjs has NO CI fail-closed branch — its catch exits 0 unconditionally. Its workflow does carry fetch-depth: 0, so it is not currently zero-yield, but nothing prevents a future checkout regression from silently re-opening the identical hole there. Additionally, this workflow\'s own header comment names four workflows carrying the identical brace-glob path-filter bug (alter-default-override-lint, count-delta-gate-lint, ismainmodule-classguard-lint, realtime-subscribe-teardown-recursion-lint), deliberately left unfixed with a stated blast-radius rationale.',
      location: 'scripts/lint/count-truncation-diff-lint.mjs:219-224; .github/workflows/session-coordination-insert-classguard-lint.yml:29-33',
      recommendation: 'Follow-up candidates, correctly out of this SD\'s scope. Consider a sweep SD applying this QF\'s CI-fail-closed pattern to the sibling diff-based lints.',
    },
    {
      id: 'VAL-7',
      severity: 'LOW',
      issue: 'Requested storage parameters were non-canonical and were corrected rather than followed',
      evidence:
        'The brief asked for source=\'manual\' and metadata.repo_path set to the worktree. (a) storeSubAgentResults hardcodes source: \'sub_agent_executor\' (results-storage.js:809) with no caller override — deliberately, per SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-A, because \'manual\' is the DB column default meaning "no writer claims this row". (b) repo_path is written by applySubAgentRepoVerdict via toCanonicalRepoPath(), which strips the worktree suffix; the SUB_AGENT_REPO_RESOLUTION gate compares it for exact equality against applications.local_path = C:/Users/rickf/Projects/_EHG/EHG_Engineer. Writing the raw worktree path would have broken that gate. executed_from_cwd stays RAW (the worktree) by design, for cwd-leak detection.',
      location: 'lib/sub-agent-executor/results-storage.js:809; lib/sub-agents/resolve-repo.js:93-96,227-242',
      recommendation: 'None. Recorded so the deviation from the brief is auditable rather than silent.',
    },
  ],
  conditions: [
    { action: 'Seed >=1 sd_backlog_map item for this SD before it leaves draft (GATE 1 + the active-status DB constraint)', priority: 'high', blocking: true },
    { action: 'Backfill pr_url (#8447) and commit_sha (953957ec4d) onto quick_fixes.QF-20260905-934 — the audit trail this SD exists to create', priority: 'high', blocking: false },
    { action: 'Record on the SD that 39 pre-existing violations across 25 files are now genuinely blocking for any PR touching them, and carry their disposition as a follow-up', priority: 'medium', blocking: false },
    { action: 'Cite 241d3d11a22 (code fix) rather than 953957ec4db (seed-spec follow-up) in the PRD and audit record', priority: 'low', blocking: false },
  ],
  justification:
    'CONDITIONAL_PASS, not PASS: the code verdict is unambiguously clean — all four shipped artifacts were verified at HEAD, the merge is confirmed on origin/main, the new test passes 3/3, and the fix was proven end-to-end by the gate\'s own CI run reporting diff (blocking) mode against a pre-fix baseline of all (degraded) advisory. The conditions are governance-record gaps rather than code defects: the SD carries 0 backlog items (a GATE 1 blocker and a DB constraint on activation), the QF row it escalated from still has null pr_url/commit_sha so it does not link to its own delivery, and the now-live gate arms a previously-inert 39-site violation backlog that the SD should record as an accepted consequence.',
  recommendations: [
    'VERDICT ON THE CORE MANDATE: the already-shipped fix is REAL, CORRECT, and matches the SD\'s stated problem. Proceed to PLAN.',
    'Artifact 1/4 VERIFIED — .github/workflows/session-coordination-insert-classguard-lint.yml carries `fetch-depth: 0` on actions/checkout@v4, with a QF-20260905-934 comment stating the root cause. Confirmed at HEAD.',
    'Artifact 2/4 VERIFIED — scripts/lint/session-coordination-insert-classguard-lint.mjs:192-197 branches on `process.env.CI === \'true\'` and exits 1 with three specific stderr lines. The "non-CI path unchanged" claim is PROVEN, not asserted: in the diff of 241d3d11a22 the three fallback lines (console.warn, mode = \'all (degraded)\', scanned = candidateFilesAll) appear as CONTEXT lines, not + lines — the only additions are the comment block and the CI branch.',
    'Artifact 3/4 VERIFIED — tests/unit/lint/session-coordination-insert-classguard-lint-ci-fallback.test.js exists, and its 3 cases match the claims exactly: (a) withOriginMain+withViolation asserts mode===\'diff\', blocking===true, exit 1; (b) no origin + CI=true asserts exit 1 and stderr matching /diff base unavailable in CI/ and /Fix the workflow/; (c) no origin, no CI asserts mode===\'all (degraded)\', blocking===false, exit 0. It spawns the REAL script against REAL temp git repos with a real bare remote. RUN LIVE: 3/3 passed in 8.79s. Note the test deliberately deletes an inherited CI var (line 71) so the runner\'s own CI=true cannot mask case (c) — a genuinely careful detail.',
    'Artifact 4/4 VERIFIED — scripts/audit/control-seed-specs.json gained observability_proof{input,seen} plus a scoped `env: {CI: ""}` for the fixture trial only, with a note explaining that the harness\'s scratch repo has no HEAD so the throw would otherwise hit this PR\'s own new CI branch. Production behavior untouched.',
    'MERGE CONFIRMED — gh: PR #8447 state=MERGED, mergedAt 2026-09-07T05:29:26Z, mergeCommit 73883f93b99a853438b2ffdf11ea9ba5e79b3bf8, exactly the 4 claimed files. `git merge-base --is-ancestor 73883f93 origin/main` returns true. All 20+ PR checks passed, including control-seed-test-lint.',
    'THE DECISIVE INDEPENDENT INSTRUMENT (the check that actually settles whether the fix works, and the one a file-read alone cannot answer): I read the gate\'s OWN CI logs on both sides of the fix. PRE-FIX, run 33963260337 (merged PR #8235): "⚠️ diff base unavailable (Command failed: git diff --name-only --diff-filter=ACMR origin/main...HEAD) — falling back to --all (advisory)" then "(all (degraded), advisory): 41 violation(s) across 5457 file(s) scanned — not blocking". POST-FIX, run 34085859597 (the fix PR itself): "✅ session-coordination-insert-classguard-lint (diff): 0 violations across 1 file(s) scanned". The mode flipped from all(degraded)/advisory to diff/blocking in the real deployment. The zero-yield gate is now genuinely wired.',
    'The "1 file(s) scanned" in the post-fix run is self-consistent: of the 4 changed files only scripts/lint/...mjs falls inside the script\'s scripts|lib + .js/.mjs/.cjs candidate filter (the .json is a non-scanned extension, tests/ and .github/ are outside the two scanned roots).',
    'DUPLICATE CHECK (this sub-agent\'s primary mandate) — NO duplicate. No other SD targets this control (only this one matches on title); QF-20260807-118 matches "classguard" but is a DIFFERENT control (ismainmodule-classguard-lint) and is completed; no SD mentions fetch-depth. The retroactive SD/QF pair is expected by design here, not an accidental double-file: quick_fixes.QF-20260905-934 reads status=escalated and the SD metadata carries source_qf_id=QF-20260905-934, so the linkage is coherent in that direction.',
    'SCOPE FIDELITY vs the QF\'s stated fix shape (4 parts): (a) fetch origin/main — DELIVERED; (b) make the diff-base fallback fail CLOSED — DELIVERED, correctly narrowed to CI only; (c) "a CI-asserted predicate that the run took diff mode" — SATISFIED BY CONSTRUCTION rather than by an explicit assertion: the workflow passes no --all, so the only route to a non-diff mode is the catch, which now exits 1 in CI. Defensible, but worth noting the guarantee is structural, so a future edit adding --all to the workflow would silently defeat it; (d) disposition the pre-existing violations — EXPLICITLY DEFERRED (see VAL-3).',
    'No code changes are requested by this review. Every discrepancy found is either a brief-wording nit (VAL-4, VAL-5), an out-of-scope follow-up (VAL-6), a storage-contract correction I applied (VAL-7), or a governance-record gap for PLAN to close (VAL-1, VAL-2, VAL-3).',
  ],
  detailed_analysis: [
    'VALIDATION at LEAD-TO-PLAN for SD-LEO-FIX-SESSION-COORDINATION-INSERT-001 (retroactive QF escalation).',
    'Worktree C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/qf/QF-20260905-934, branch qf/QF-20260905-934, HEAD 953957ec4db.',
    '',
    'MANDATE. Verify that an ALREADY-SHIPPED fix is real, correct, and matches the SD\'s stated problem — not re-derive requirements. The SD exists only because lib/quick-fix/sensitive-path-registry.js flagged the .github/workflows/ path, so QF-completion tooling could not self-close and escalated for governance.',
    '',
    'METHOD. Every claim in the requesting brief was treated as unverified and re-derived: files read at HEAD; the "unchanged non-CI path" claim proven from diff hunk shape rather than from the author\'s assertion; the new test executed rather than inspected; merge state taken from gh rather than from the brief; and the fix\'s actual effect measured from GitHub Actions logs on BOTH sides of the change. That last instrument is the one that matters — a zero-yield gate is by definition a control that reads as wired while catching nothing, so reading the source can never settle the question. Only the runner\'s own output can.',
    '',
    'FINDING 1 — THE ROOT CAUSE IS CORRECTLY DIAGNOSED AND THE FIX ADDRESSES IT AT THE ROOT. The failure was not a bad rule or a bad path filter; it was that actions/checkout@v4\'s default depth-1 clone carries no origin/main ref, so candidateFilesDiff()\'s `git diff origin/main...HEAD` threw on every run and the catch degraded to `all (degraded)`, which the script\'s own `blocking = mode === \'diff\'` marks non-blocking. fetch-depth: 0 removes the cause rather than suppressing the symptom.',
    '',
    'FINDING 2 — THE HARDENING IS CORRECTLY SCOPED. The CI-fail-closed branch fires only on `process.env.CI === \'true\'`, i.e. only where a resolvable base is now guaranteed. This is the right narrowness: a bare clone or a standalone local run legitimately has no origin/main, and failing those closed would make the script hostile to local use for no safety gain. The diff proves the local path is byte-identical to before.',
    '',
    'FINDING 3 — THE TEST IS GENUINE REGRESSION COVERAGE, NOT A MOCK. It spawns the real script via spawnSync against real `git init` fixtures with a real bare remote, and asserts on the script\'s real exit codes and stderr. Case (a) is the one that gives the suite its teeth: it proves diff mode BLOCKS on a real violation, so a future regression that silently restores advisory-always would fail here even if cases (b) and (c) were satisfied. The explicit `delete env.CI` guard (line 71) shows the author anticipated the runner\'s own CI=true masking case (c) — the exact failure this test exists to prevent.',
    '',
    'FINDING 4 — MEASURED EFFECT IN THE LIVE DEPLOYMENT. Pre-fix run 33963260337: all(degraded)/advisory, 41 violations across 5457 files, exit 0. Post-fix run 34085859597: diff mode, 0 violations across 1 file, blocking. The control transitioned from structurally-incapable-of-blocking to genuinely blocking.',
    '',
    'FINDING 5 — THE ONE SUBSTANTIVE CONSEQUENCE THE RECORD SHOULD CARRY. Arming the gate did not remove the 39-site / 25-file violation backlog it was always supposed to catch (measured live via --all on this branch: 39 violations, 5646 files scanned; scripts/stale-session-sweep.cjs alone has 11). Diff-scoping keeps main green, so this is not a red-main risk. But it IS a live blast radius: the next PR to touch scripts/stale-session-sweep.cjs, fleet-dashboard.cjs, or any of the other 23 files hard-fails a check that has never once fired before. That is a legitimate and arguably correct outcome — it is what the gate is for — but it should be a recorded, accepted consequence rather than a surprise, which is why it is a condition rather than a silent pass.',
    '',
    'GATE 1 POSTURE. Duplicate check: clean. Infrastructure check: the fix reused the proven fetch-depth: 0 precedent from the sibling count-truncation-diff-lint.yml rather than inventing a mechanism — the reuse-over-rebuild outcome this sub-agent exists to enforce. Claims verification: all four artifact claims verified against code, plus two brief-level inaccuracies caught (VAL-4 commit mis-citation, VAL-5 precedent overstatement) that a file-existence check would have missed. Backlog validation: FAILS — 0 items (VAL-1), the sole blocking condition.',
    '',
    'RESIDUAL RISK: low. The fix\'s correctness is now attested by three independent instruments (source read, executed test, live CI logs on both sides of the change) that agree. The remaining exposure is organizational rather than technical: an SD with no backlog item and a QF row that does not point at its own merged PR is a weak audit trail for an SD whose entire justification is the audit trail.',
  ].join('\n'),
  metadata: {
    timestamp: new Date().toISOString(),
    escalation_type: 'retroactive_qf_escalation',
    source_qf_id: 'QF-20260905-934',
    escalation_reason: 'sensitive-path registry (.github/workflows/) blocked autonomous QF close',
    reviewed_head: '953957ec4dbdbc85015cbf03d3f931dbff2bb4d7',
    code_fix_commit: '241d3d11a22',
    seed_spec_followup_commit: '953957ec4dbdbc85015cbf03d3f931dbff2bb4d7',
    merge_commit: '73883f93b99a853438b2ffdf11ea9ba5e79b3bf8',
    pr: 8447,
    pr_state: 'MERGED',
    merge_commit_is_ancestor_of_origin_main: true,
    artifacts_verified: 4,
    artifacts_claimed: 4,
    tests_run: { ci_fallback_regression: '3/3 passed', duration: '8.79s' },
    ci_evidence: {
      pre_fix_run: '33963260337',
      pre_fix_output: 'all (degraded), advisory: 41 violation(s) across 5457 file(s) scanned — not blocking',
      post_fix_run: '34085859597',
      post_fix_output: 'diff: 0 violations across 1 file(s) scanned',
      mode_transition: 'all (degraded)/advisory -> diff/blocking',
    },
    residual_violation_backlog: { violations: 39, files: 25, scanned: 5646, measured_on: 'qf/QF-20260905-934 @ 953957ec4db', largest: 'scripts/stale-session-sweep.cjs (11)' },
    duplicate_check: { duplicates_found: 0, sds_matching_control: 1, note: 'QF-20260807-118 matches on the word classguard but targets ismainmodule-classguard-lint, a different control' },
    gate1_backlog_items: 0,
    gate1_prd_rows: 0,
    independent_instruments_used: [
      'file reads at HEAD (all four shipped artifacts)',
      'git diff hunk-shape analysis to prove the non-CI path is context-only, not merely author-asserted',
      'live vitest execution of the new regression suite (3/3)',
      'gh pr view / gh pr checks for merge state and check outcomes',
      'git merge-base --is-ancestor against origin/main',
      'gh run view --log on BOTH the pre-fix (33963260337) and post-fix (34085859597) gate runs — the decisive instrument',
      'live --all sweep of the linter to measure the residual violation backlog',
      'DB queries: strategic_directives_v2, sd_backlog_map, product_requirements_v2, quick_fixes, applications',
    ],
    brief_discrepancies_found: 4,
    storage_contract_deviations: {
      source: "requested 'manual'; writer hardcodes 'sub_agent_executor' (results-storage.js:809) per SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-A",
      repo_path: 'requested raw worktree path; canonical writer canonicalizes via toCanonicalRepoPath() so SUB_AGENT_REPO_RESOLUTION matches applications.local_path',
    },
  },
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD,
    { name: 'Principal Systems Analyst', code: 'VALIDATION' },
    results,
    { phase: 'LEAD-TO-PLAN', sdKey: SD },
  );
  console.log(
    'STORED ID:', stored?.id,
    '| verdict:', stored?.verdict,
    '| phase:', stored?.phase,
    '| confidence:', stored?.confidence,
    '| source:', stored?.source,
  );
  console.log('repo_path:', stored?.metadata?.repo_path, '| executed_from_cwd:', stored?.metadata?.executed_from_cwd);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
