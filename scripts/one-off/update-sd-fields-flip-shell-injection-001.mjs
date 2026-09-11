#!/usr/bin/env node
// LEAD enrichment for SD-MAN-INFRA-FLIP-SHELL-INJECTION-001 (worker Alpha 64728de4, 2026-09-11).
// Same shape as scripts/one-off/update-sd-fields-security-critical-safety-001.mjs. Every fact
// below was measured in this worktree at origin/main 50b076a (see metadata.lead_measurement_20260911).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-MAN-INFRA-FLIP-SHELL-INJECTION-001';

const description = `Flip .github/workflows/shell-injection-argv-lint.yml from advisory (continue-on-error: true) to blocking, after landing the one named flip precondition, B-3 reflow-safe violation identity, in scripts/lint/shell-injection-argv-lint.mjs.

WHY IT IS NOT SAFE TO FLIP TODAY (measured 2026-09-11 in this worktree at origin/main 50b076a): the lint's diff mode scans every ADDED line vs the merge base (collectDiffAdded, shell-injection-argv-lint.mjs:125) and identifies a violation only as file:line (isAllowed, :116-119; findViolations, :178-190). Inserting a line above a pre-existing violation moves it, the moved line is "added" in the -U0 diff, and it resurfaces as new (TS-11 in tests/unit/lint/shell-injection-argv-lint.test.js:172 documents exactly this). With continue-on-error removed, every PR that touches one of the 130 backlog files would inherit that file's old violations as a red check. Full-mode census today: 237 violations across 130 files (S1 template-literal/bare-variable exec: 224; S2 shell-option non-literal-false: 13; 0 in test paths); the allowlist ledger carries 4 file:line entries, all with reasons.

THE PRECEDENT TO REUSE, NOT REINVENT: scripts/lint/schema-lint-scope.mjs already exports violationKey() (:38, a key with NO line number) and partitionViolations(violations, baselineKeys) (:53) — "the backlog must not become the toucher's problem" — and scripts/lint/schema-reference-lint.mjs:246 baselineViolationKeys() shows how the merge-base version of each touched file is read (git show <mergeBase>:<file> as a single argv token, no shell) and scanned to build the baseline set. A new file has no baseline, so all of its violations are genuinely new; a degraded run (no resolvable merge base) yields null and must never be read as "everything is pre-existing" (schema-lint-scope.mjs:46-51).

THE CHANGE: (1) shell-injection-argv-lint.mjs gains an exported violationKey(v) = file | selector | normalized line text (whitespace-collapsed, no line number) and, in diff mode, partitions HEAD violations in each touched file against the baseline keys computed from the merge-base blob of that file — pre-existing sites are REPORTED (stderr, prefixed pre-existing) and never fail the run; only NEW sites set the non-zero exit. --all stays diagnostic-only and unchanged. (2) The workflow drops continue-on-error and its header records the flip date, the B-3 mechanism that made it safe, and the escape hatches (inline pragma shell-injection-argv-disable-line; allowlist entry WITH a reason). (3) The unit tests flip with it: TS-7/B-2 now assert blocking (no continue-on-error, no dated advisory note), TS-11 flips from "documents resurfacing" to "a moved pre-existing site is pre-existing, not new", plus violationKey-excludes-line, baseline partition, new-site-in-touched-file-still-blocks, and degraded-base cases. The 237-site backlog is NOT remediated by this SD; it stays a ledger, invisible to touchers by construction.

SENSITIVE PATH: .github/workflows is classifier-sensitive for worker seats; per the coordinator's instruction, a classifier denial on the workflow edit is signaled as stuck with the SD HELD (not released), never worked around. Predecessors: SD-LEO-INFRA-PUBLISH-SHELL-INJECTION-001-B (the advisory lint), SD-LEO-INFRA-CLOSE-SHELL-INJECTION-001 (SEC-1/2/3 flip preconditions, completed), QF-20260911-228 (moved FLIP_DEADLINE to 2026-10-09 and named this SD as the flip owner).`;

const scope = `IN SCOPE (locked at LEAD): (a) scripts/lint/shell-injection-argv-lint.mjs — export violationKey(); in diff mode compute per-file baseline keys from the merge-base blob (execFileSync git argv, never a shell) and partition via schema-lint-scope.mjs partitionViolations; report pre-existing, fail only on new; JSON output gains newViolations/preExisting counts and merge_base for auditability, mirroring schema-reference-lint. (b) .github/workflows/shell-injection-argv-lint.yml — remove continue-on-error on the lint step; rewrite the header note (flip date, B-3 mechanism, escape hatches); keep SHELL_INJECTION_ARGV_BASE=origin/<base_ref> and fetch-depth 0. (c) tests/unit/lint/shell-injection-argv-lint.test.js — flip TS-7/B-2 and TS-11 to the blocking contract; add violationKey / partition / new-in-touched-file / degraded-base cases. (d) Full-mode lint run recorded before the flip (measured: 237/130) and again after, as evidence the count is unchanged (identity change, not a selector change).

AMENDED AT LEAD after Explore evidence af76d00a: the partition is LOCAL to the lint file (schema-lint-scope.mjs:58 hard-codes the schema key, so it is mirrored, not imported, and that module is untouched); the base-ref guard is hoisted out of the degrade try (invalid base = loud exit 1; unresolvable merge base = degraded advisory exit 0); renames are mapped via git diff --name-status -M so a renamed file reads its baseline at the old path; the key is built from the FULL raw line, not the 120-char truncated text; --all exit semantics are unchanged (scripts/audit/control-seed-test.mjs:205 keys a registered control's BLOCKS verdict on it); continue-on-error is set to false EXPLICITLY and pinned by a workflow-blocking test (sibling precedent); no new file is added under scripts/lint/ (control-seed-test-lint.mjs:78 would demand a spec entry) — the key/partition helpers live in the lint file itself.

OUT OF SCOPE (deletion audit, Q8): remediating any of the 237 backlog sites; migrating the 4 allowlist file:line entries to content keys (the ledger + inline pragma remain the explicit escapes and still match by file:line); changing or adding selectors (S1/S2 unchanged; eval/new Function stays a different class); touching schema-lint-scope.mjs, schema-reference-lint or any other lint; a repo-wide baseline snapshot file (the merge-base blob IS the baseline, no new artifact); fixing control-seed-test.mjs:210's scannedZero regex mismatch (pre-existing harness blind spot, flagged to the coordinator, not this SD); GHA cache or runner changes.`;

const strategic_objectives = [
  'Turn shell-injection-argv-lint into a BLOCKING PR check so a NEW template-literal/bare-variable exec or shell:<non-literal-false> argv site cannot merge unnoticed (the control the advisory soak was always meant to become).',
  'Land the B-3 precondition first: reflow-safe violation identity (file | selector | normalized text, no line number) with a merge-base baseline partition, so touching a backlog file never inherits its old violations — the schema-lint-scope precedent, reused verbatim.',
  'Leave the 237-site backlog as a visible ledger (pre-existing reported, never blocking) and keep both escape hatches (inline pragma, reasoned allowlist entry) so the flip has no bypass pressure.',
  'Flip the self-enforcing test contract with the workflow so the repo cannot decay back to advisory silently.',
];

const success_criteria = [
  { criterion: 'AC-1 (B-3 identity): violationKey(v) is exported and excludes the line number; the SAME violation at line 99 and line 278 produces the same key.', measure: 'Unit: violationKey({file,selector,text,line:99}) === violationKey({...,line:278}); a moved pre-existing site partitions as preExisting (TS-11 flipped).' },
  { criterion: 'AC-2 (baseline partition): in diff mode a PR that only inserts lines above an existing violating line reports that site as pre-existing and exits 0; a PR that adds a genuinely new violating line in the same file exits 1 with exactly that site under newViolations.', measure: 'Unit (git-runner seam or temp repo) + smoke steps 2-3; JSON output carries merge_base and counts.' },
  { criterion: 'AC-3 (no fail-open): an unresolvable merge base stays degraded-advisory (nothing scanned, warning, exit 0) and an absent baseline is never "everything pre-existing"; but an INVALID / option-shaped SHELL_INJECTION_ARGV_BASE is a loud exit 1 (guard hoisted out of the degrade try, precedent schema-reference-lint.mjs:147-165) — the hole Explore af76d00a found is closed, not frozen.', measure: 'Unit: (a) merge-base throw → mode "diff (degraded)", exit 0; (b) base "--upload-pack=x" → non-zero exit with the VALID_BASE_REF message, mode never "degraded"; (c) file absent at base → all its violations new.' },
  { criterion: 'AC-4 (flip): the parsed workflow YAML has NO continue-on-error on the lint step; header note records the flip date + mechanism; TS-7/B-2 assert blocking; FLIP_DEADLINE logic retired or inverted.', measure: 'npx vitest run tests/unit/lint/shell-injection-argv-lint.test.js passes; grep continue-on-error on the lint step returns nothing.' },
  { criterion: 'AC-5 (count invariant): full-mode census before and after is identical in violations/files (237/130 at LEAD) — identity changed, selectors did not.', measure: 'node scripts/lint/shell-injection-argv-lint.mjs --all --json before/after, recorded in the PR body.' },
  { criterion: 'AC-6 (CI proof): the SD\'s own PR runs the now-blocking workflow green, and a throwaway commit adding an execSync template literal interpolating a git command to a backlog file turns it red (then is dropped).', measure: 'gh pr checks shows shell-injection-argv-lint pass on the PR head; the negative probe run URL is recorded in the PR body.' },
];

const key_changes = [
  { change: 'scripts/lint/shell-injection-argv-lint.mjs: export violationKey(v) = file|selector|normalize(FULL raw line) (whitespace-collapsed; NOT the 120-char truncated text at :185 and NOT stripForScan output, which blanks string contents) and a LOCAL partition (schema-lint-scope.partitionViolations hard-codes the schema key at :58 — Explore af76d00a — so it is mirrored, not imported; schema-lint-scope.mjs stays untouched). Diff mode: hoist the VALID_BASE_REF check OUT of the degrade try (precedent schema-reference-lint.mjs:147-165 — an option-shaped SHELL_INJECTION_ARGV_BASE is a loud exit 1, never "degraded, nothing scanned, exit 0"); resolve mergeBase once; list touched files with git diff --name-status -M so a rename reads its baseline at the OLD path; read each baseline blob through one makeHardenedGitRunner factory (git show `${mergeBase}:${oldPath}`, stdio [ignore,pipe,ignore], cwd REPO_ROOT) and scan it with the same scanLine; a missing blob = empty baseline (all new); an unresolvable merge base = degraded advisory exit 0, unchanged (SD-LEO-INFRA-SCHEMA-LINT-DEGRADED-FAILOPEN-001). Exit keyed on newViolations in diff mode; --all unchanged (baseline null ⇒ all new ⇒ exit 1, which scripts/audit/control-seed-test.mjs:205 relies on for its BLOCKS verdict). JSON adds merge_base, newViolations, preExisting; no repo consumer parses the JSON today.', impact: 'Touching a backlog file no longer inherits its old violations; only genuinely new sites block; the base-ref fail-open is closed at the moment the check becomes load-bearing; the registered control-seed trial keeps its BLOCKS verdict.' },
  { change: '.github/workflows/shell-injection-argv-lint.yml: set continue-on-error: false EXPLICITLY on the lint step (mirror the sibling flip schema-reference-lint.yml:54, pinned by tests/unit/schema-reference-lint-workflow-blocking.test.js:20-38 — an explicit false is grep-pinnable, an absent key is not); replace the dated advisory note with the flip record (date, B-3 mechanism, escape hatches); add a concurrency group (precedent :45-47).', impact: 'A new shell-injection-shaped argv site fails the PR check. Sensitive path — classifier denial → /signal stuck + hold the SD.' },
  { change: 'Flip-contract prose lives in THREE places (Explore af76d00a): the workflow header (2026-09-09), the test assertions (:156-157, B-2 else :167) and the allowlist _scope_note:3 soak claim; plus scripts/audit/control-seed-specs.json:384 observability_proof.input describes the pre-baseline mechanism. All four are updated in the same PR so no copy still claims an advisory soak.', impact: 'No stale advisory claim survives the flip; the registered control\'s proof text matches the shipped mechanism.' },
  { change: 'tests/unit/lint/shell-injection-argv-lint.test.js: TS-7/B-2 assert the blocking contract; TS-11 asserts moved-site-is-pre-existing; new cases for violationKey line-exclusion, partition, new-in-touched-file blocks, degraded base stays advisory.', impact: 'The self-enforcing contract now guards the blocking state instead of the soak deadline.' },
  { change: 'Evidence: full-mode census before/after (237/130 at LEAD) and one negative CI probe recorded in the PR body.', impact: 'Proves the flip changed identity, not detection, and that the blocking check actually fires.' },
];

const risks = [
  { risk: 'Renamed files: the precedent does NOT map renames (schema-reference-lint.mjs:187 ACMR only includes the new path; the baseline read at mergeBase:<newpath> falls into catch → new Set(), :262-265 — Explore af76d00a), so copied verbatim every violation in a renamed backlog file would read as new on the PR that renames it.', impact: 'medium', likelihood: 'low', mitigation: 'Map renames explicitly: git diff --name-status -M <mergeBase>..HEAD gives old→new for R entries; read the baseline blob at the OLD path. Covered by a unit case (rename of a file with one baseline site → 0 new). The reasoned-allowlist escape remains for anything unmapped.' },
  { risk: 'Identical violating text twice in one file collapses to one key; adding a second copy of an existing bad line is masked as pre-existing.', impact: 'low', likelihood: 'low', mitigation: 'Accepted, same as the schema-lint precedent; a duplicate of an already-ledgered site adds no new sink class. Documented in the lint header.' },
  { risk: 'Classifier denies the .github/workflows edit for the worker seat.', impact: 'high', likelihood: 'medium', mitigation: 'Per coordinator: /signal stuck with the ready diff, HOLD the SD (keep the claim), cascade; never work around. The lint + test changes ship first on the same branch so the workflow edit is a one-line follow-through.' },
  { risk: 'Blocking turns an in-flight PR red the day it lands.', impact: 'medium', likelihood: 'medium', mitigation: 'By construction only NEW sites block; the pragma and reasoned allowlist remain; the count invariant (AC-5) and the negative probe (AC-6) are the release evidence.' },
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'Run node scripts/lint/shell-injection-argv-lint.mjs --all --json in the repo root.', expected_outcome: 'mode "all", violations 237 across 130 files (same as the LEAD census); each violation carries a key with no line number.' },
  { step_number: 2, instruction: 'On a scratch branch, insert one comment line at the top of a backlog file (e.g. one listed in the --all output), commit, and run the lint in diff mode with SHELL_INJECTION_ARGV_BASE=origin/main.', expected_outcome: 'Exit 0; the moved site is printed as pre-existing; newViolations is 0.' },
  { step_number: 3, instruction: 'On the same branch add a line an execSync template literal interpolating a git command to that file, commit, and re-run diff mode.', expected_outcome: 'Exit 1; exactly one new violation (the added line) is reported; the moved site is still pre-existing.' },
  { step_number: 4, instruction: 'Run npx vitest run tests/unit/lint/shell-injection-argv-lint.test.js and parse .github/workflows/shell-injection-argv-lint.yml.', expected_outcome: 'All tests pass; the lint step has no continue-on-error property; the header names the flip date and B-3.' },
];

const mechanism_verifications = [
  { verified_by: 'worker Alpha 64728de4 (LEAD, 2026-09-11 full-mode measurement in the SD worktree)', verified_at: 'scripts/lint/shell-injection-argv-lint.mjs:116' },
  { verified_by: 'worker Alpha 64728de4', verified_at: 'scripts/lint/shell-injection-argv-lint.mjs:125' },
  { verified_by: 'worker Alpha 64728de4', verified_at: 'scripts/lint/shell-injection-argv-lint.mjs:178' },
  { verified_by: 'worker Alpha 64728de4', verified_at: 'scripts/lint/schema-lint-scope.mjs:38' },
  { verified_by: 'worker Alpha 64728de4', verified_at: 'scripts/lint/schema-reference-lint.mjs:246' },
  { verified_by: 'worker Alpha 64728de4', verified_at: '.github/workflows/shell-injection-argv-lint.yml:40' },
  { verified_by: 'worker Alpha 64728de4', verified_at: 'tests/unit/lint/shell-injection-argv-lint.test.js:172' },
  { verified_by: 'Explore evidence af76d00a (Task tool, 2026-09-11)', verified_at: 'scripts/lint/schema-lint-scope.mjs:58' },
  { verified_by: 'Explore evidence af76d00a', verified_at: 'scripts/lint/schema-reference-lint.mjs:147' },
  { verified_by: 'Explore evidence af76d00a', verified_at: 'scripts/lint/schema-reference-lint.mjs:262' },
  { verified_by: 'Explore evidence af76d00a', verified_at: 'scripts/lint/shell-injection-argv-lint.mjs:185' },
  { verified_by: 'Explore evidence af76d00a', verified_at: 'scripts/audit/control-seed-test.mjs:205' },
  { verified_by: 'Explore evidence af76d00a', verified_at: 'scripts/lint/control-seed-test-lint.mjs:78' },
  { verified_by: 'Explore evidence af76d00a', verified_at: '.github/workflows/schema-reference-lint.yml:54' },
];

const lead_measurement_20260911 = {
  measured_at: '2026-09-11T14:55Z', base: 'origin/main 50b076a', command: 'node scripts/lint/shell-injection-argv-lint.mjs --all --json',
  full_mode: { violations: 237, files: 130, S1: 224, S2: 13, in_test_paths: 0, lines_scanned: 1782510 },
  allowlist_entries: 4, allowlist_key_shapes: { file_line: 4, bare_file: 0 },
  workflow: { continue_on_error: true, dated_note: '2026-09-09 in header; test FLIP_DEADLINE 2026-10-09 (QF-20260911-228)' },
};

const success_metrics = [
  { metric: 'New-site block rate', target: 'a probe commit adding one new site fails the check', actual: 'to be recorded on the SD PR (AC-6)' },
  { metric: 'Backlog inheritance', target: '0 pre-existing sites block on a touch-only PR', actual: 'to be recorded (AC-2 / smoke step 2)' },
  { metric: 'Detection invariant', target: 'full-mode count unchanged (237/130)', actual: 'to be recorded (AC-5)' },
];

const scope_exclusions = [
  'Remediating the 237 backlog sites (stays a ledger)',
  'Migrating the 4 allowlist file:line entries to content keys',
  'Adding/changing selectors (eval / new Function class stays out)',
  'Touching schema-reference-lint or other lints',
  'A committed baseline snapshot artifact (merge-base blob is the baseline)',
];

async function main() {
  const { data: existing, error: fetchErr } = await supabase
    .from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  if (fetchErr) throw fetchErr;
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({
      description, scope, strategic_objectives, success_criteria, key_changes, risks, smoke_test_steps,
      rationale: 'The advisory soak (SD-LEO-INFRA-PUBLISH-SHELL-INJECTION-001-B) exists to become a blocking control; SEC-1/2/3 landed in SD-LEO-INFRA-CLOSE-SHELL-INJECTION-001; B-3 is the last named precondition and QF-20260911-228 named this SD as the flip owner. Reusing the schema-lint-scope partition is the simplest mechanism that makes blocking safe without touching the backlog.',
      strategic_intent: 'A shell-injection-shaped argv site can no longer merge unnoticed, and the existing backlog never becomes the toucher\'s problem.',
      scope_reduction_percentage: 30,
      metadata: {
        ...existing.metadata,
        mechanism_verifications, lead_measurement_20260911, success_metrics, scope_exclusions,
        deletion_audit: { original_request: 'flip the lint to blocking', removed: scope_exclusions, reduction_percentage: 30 },
        flip_precondition_of: 'SD-LEO-INFRA-PUBLISH-SHELL-INJECTION-001-B',
        sensitive_paths: ['.github/workflows/shell-injection-argv-lint.yml'],
        needs_enrichment: false,
      },
    })
    .eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('Updated SD fields for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
