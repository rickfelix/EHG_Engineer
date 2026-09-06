import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = '11f9e1ac-a769-47f1-82b4-950a32a0d977';
const PRD_ID = `PRD-${SD_ID}`;
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const prd = {
  id: PRD_ID,
  directive_id: SD_ID,
  sd_id: SD_ID,
  title: 'Worktree Claim Guard: Branch-Derived Key Precedence',
  status: 'approved',
  executive_summary:
    'ENFORCEMENT-4 keys its block decision on the worktree DIRECTORY NAME, which the slot-free reuse policy leaves stale; the guard now derives the key from the checked-out git BRANCH first, falls back to a reuse marker, then the path, fixing the false block that pushed a worker to bypass the hook.',
  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'Branch-first key derivation, anchored (not slug-carrying)',
      description:
        'New function deriveWorktreeKey({branch, marker, filePath}) in scripts/hooks/worktree-claim-decision.cjs (CJS, alongside shouldBlockWorktreeEdit -- pre-tool-enforce.cjs cannot require() the ESM lib/ship/work-key-derivation.mjs, so the ANCHORED slug-stopping pattern from deriveWorkKeyFromBranch (lib/ship/work-key-derivation.mjs:23, regex (?=-[a-z]|$) anchor) is re-implemented inline here, NOT lib/worktree-reaper/detectors.js:40 / scripts/safe-worktree-remove.mjs:46\'s byte-identical keyFromBranch copies, which return the branch remainder INCLUDING any trailing slug (e.g. feat/SD-X-001-close-paths -> "SD-X-001-close-paths", not a key) -- validation-agent\'s independent LEAD-TO-PLAN pass (evidence 2c68e858-4630-47e3-8b1f-76d3b873500a) flagged this as a HIGH-severity false-block-relocation risk: shouldBlockWorktreeEdit blocks on Boolean(claimedSdKey) && claimedSdKey !== worktreeKey, so a truthy-but-garbage key would newly false-block every slug-carrying branch. deriveWorktreeKey returns {key, source} where source in (branch|marker|path); ENFORCEMENT-4 (pre-tool-enforce.cjs:1002-1039) calls it with `git -C <worktree root> rev-parse --abbrev-ref HEAD` (resolved via child_process.execFileSync, never execSync/shell string) as `branch`, the FR-2 marker file contents (if present) as `marker`, and the existing WORKTREE_PATH_RE match as `filePath` fallback input.',
      priority: 'MUST',
      acceptance_criteria: [
        'deriveWorktreeKey is exported from worktree-claim-decision.cjs and unit-tested standalone (no live worktree required)',
        'A branch like feat/SD-X-001-close-paths derives key "SD-X-001" (anchored), not "SD-X-001-close-paths"',
        'The derived key and its source (branch|marker|path) are threaded into both the audit row (auditPermissionDecision metadata) and the block message text',
      ],
    },
    {
      id: 'FR-2',
      requirement: 'Coordinator-written, reap-safe reuse marker',
      description:
        'A small marker file (e.g. .worktree-reuse.json at the tree root) naming the new key, writer session, and timestamp, written by a new writeReuseMarker(treePath, {key, writerSession}) helper (mirroring lib/worktree-reaper/reap-eligible-marker.js\'s established shape: best-effort try/catch, never throws, JSON {key, writer_session, marked_at}) for the coordinator\'s existing slot-free reuse directive to call -- Explore\'s search confirmed no reuse-marker-file convention exists today (only the unrelated push-based PRESERVE-stage git-ref mechanism from SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001). The marker is added to .gitignore (never committed) and must not increase scripts/worktree-reaper.mjs\'s dirty-file count for removal-safety purposes (open QF-20260903-092 concern flagged by validation-agent) -- the reaper\'s git-status-based dirty check already ignores untracked+gitignored paths by construction (git status --porcelain does not list gitignored files), so no reaper code change is required; a unit specimen (FR-4) asserts this.',
      priority: 'MUST',
      acceptance_criteria: [
        'writeReuseMarker() never throws (best-effort) and is callable from coordinator tooling with just (treePath, key)',
        'The marker file path is listed in .gitignore',
        'A tree with a fresh marker + an unrelated dirty tracked file is NOT flagged by the reaper as ineligible for removal due to the marker itself (specimen distinguishes marker-caused-dirty from genuine-work-dirty)',
      ],
    },
    {
      id: 'FR-3',
      requirement: 'Fail-open preserved; a garbage key never enters the comparison',
      description:
        'deriveWorktreeKey falls through branch -> marker -> path in strict order: a git error (execFileSync throw), a branch that does not match the anchored key pattern, or a missing/unreadable marker file each fall through to the NEXT source rather than returning a non-key string. Only the terminal WORKTREE_PATH_RE-derived key (or null, if that also fails to match) is ever compared in shouldBlockWorktreeEdit -- this is the existing fail-open contract (a guard error must never block legitimate work), extended so a key-shaped-but-wrong derivation (e.g. an unanchored slug capture) is treated as a non-match, not a false key, closing the FR-1 relocation risk at its root.',
      priority: 'MUST',
      acceptance_criteria: [
        'git binary unavailable (PATH manipulation in test) exercises the exact same block/allow verdict as today\'s path-only guard',
        'A branch that does not match the anchored pattern (e.g. "main", "chore/cleanup") falls through to marker then path, never producing a partial/garbage key',
        'No new code path can throw out of ENFORCEMENT-4 uncaught -- the existing try/catch envelope (pre-tool-enforce.cjs:1014-1036) still wraps the new derivation call',
      ],
    },
    {
      id: 'FR-4',
      requirement: 'Four unit specimens extending the existing claim-guard test suite',
      description:
        'New specimens added to tests/unit/claim/test-seams-fr9.test.js (the existing execFileSync-driven "spawn the real hook with JSON stdin, assert exit code" pattern -- reused rather than a fifth new test file, per validation-agent and Explore\'s independent recommendation): (a) reused-tree ALLOW -- directory QF-20260903-188, branch feat/SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B, session claims 002-B, asserts exit 0 with audit source=branch (note: lib/git/branch-owner.test.js:90 already documents this exact orchestrator-child-key hazard -- SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B is itself a child key, so the anchored pattern must resolve it to the full child key, not truncate to the parent SD-LEO-ORCH-CAPA-RECORD-TRUTH-002); (b) true cross-claim BLOCK -- directory and branch both name SD-X, session claims SD-Y, asserts exit 2 naming SD-X (source=branch) and SD-Y; (c) QF-held case from QF-20260804-087 unchanged (regression specimen, no new code path); (d) git unavailable -- PATH stripped of git for the child process -- falls back to path-regex, asserts identical verdict to pre-FR-1 behavior. Additionally, scripts/hooks/__tests__/pre-tool-enforce-clmmulti-002.test.js\'s static source-string pins on the current ENFORCEMENT-4 text block MUST be updated in the same PR (FR-1 rewrites that exact slice) -- flagged by validation-agent as unbudgeted-but-required LOC, not optional cleanup.',
      priority: 'MUST',
      acceptance_criteria: [
        'All 4 specimens (a)-(d) pass in tests/unit/claim/test-seams-fr9.test.js',
        'Specimen (a) uses the real child-key example SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B and asserts the FULL child key is derived, not the parent prefix',
        'scripts/hooks/__tests__/pre-tool-enforce-clmmulti-002.test.js is updated to match the new ENFORCEMENT-4 source and still passes',
        'tests/unit/worktree-claim-decision-qf087.test.js (specimen c\'s underlying behavioral test) passes unmodified, confirming no regression to the QF-held tri-state',
      ],
    },
    {
      id: 'FR-5',
      requirement: 'CI exit predicate + cross-hook lint, with audit metadata sufficient to compute it',
      description:
        'FR-5a (CI count): permission_audit_log.metadata is free-form JSONB (currently only {worktreeSdKey, claimedSdKey}); FR-1\'s audit write must ADD derivedKey, source (branch|marker|path), the observed branch string (or null with a reason code if unresolvable), and claimedSdKey -- without these fields the predicate "blocks whose derived key came from the path source WHILE the tree\'s branch named the session\'s own claim" is uncomputable from source alone, per validation-agent\'s C3 finding. A new script (scripts/ci/claim-guard-path-source-false-block-count.mjs or similar) queries permission_audit_log for PAT-CLMMULTI-002 block rows since the SD\'s merge commit where metadata.source=\'path\' AND a re-derivation of metadata.branch against the anchored pattern would have matched metadata.claimedSdKey -- asserting 0. FR-5b (lint): a new or extended lint (following the existing *-lint.mjs convention in scripts/lint/) statically greps hook files for the old bare WORKTREE_PATH_RE-only pattern (a directory-name match with no branch/marker precedence check) and fails if any hook OTHER than worktree-claim-decision.cjs itself derives an SD key from a directory-name match alone.',
      priority: 'MUST',
      acceptance_criteria: [
        'permission_audit_log rows for PAT-CLMMULTI-002 carry derivedKey, source, branch (or null+reason), and claimedSdKey after this SD ships',
        'The FR-5a CI script runs against the real permission_audit_log table and returns 0 for the asserted window, printing its exact predicate (never a hardcoded expected count)',
        'The FR-5b lint passes today (this SD is the ONLY hook doing directory-name-only derivation, by construction) and fails if a future hook regresses to bare WORKTREE_PATH_RE matching',
      ],
    },
  ],
  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'Derivation lives in worktree-claim-decision.cjs, not a new ESM module',
      rationale:
        'pre-tool-enforce.cjs is CJS and cannot require() lib/ship/work-key-derivation.mjs (ESM). worktree-claim-decision.cjs is already CJS, already the pure-predicate home for shouldBlockWorktreeEdit, and already unit-tested -- validation-agent flagged that a fourth copy-paste of the branch-key pattern would make this SD instance #5 of open QF-20260903-073 ("a correct shared helper exists and the consumer doesn\'t call it"). The anchored REGEX PATTERN is reused (copied, since cross-module require is blocked by the CJS/ESM boundary); the FUNCTION is net-new in the CJS file, not a duplicate module.',
    },
    {
      id: 'TR-2',
      requirement: 'git invoked via execFileSync with an argv array, never a shell string',
      rationale:
        'Matches the codebase-wide runHardenedGit convention (lib/git/hardened-runner.cjs) used elsewhere this session for the same reason: a shell-string git invocation is vulnerable to injection via a maliciously-named branch and silently mishandles quoting on Windows. `git -C <worktree root> rev-parse --abbrev-ref HEAD` must be spawned as execFileSync(\'git\', [\'-C\', worktreeRoot, \'rev-parse\', \'--abbrev-ref\', \'HEAD\']).',
    },
    {
      id: 'TR-3',
      requirement: 'DB sd_key uppercase assumption spot-checked, not assumed',
      rationale:
        'resolveSessionClaimedSdKey (pre-tool-enforce.cjs:242-283) returns a bare strategic_directives_v2.sd_key string for direct === comparison against the branch-derived key. Explore\'s pass noted this is format-compatible ONLY if sd_key is consistently uppercase in the DB -- EXEC must run one query (`select distinct sd_key from strategic_directives_v2 where sd_key != upper(sd_key)`) before relying on a bare === comparison, and if any lowercase/mixed-case keys exist, normalize both sides with .toUpperCase() at the comparison site rather than assuming.',
    },
    {
      id: 'TR-4',
      requirement: 'No change to the qfHeld tri-state or SD-vs-SD block semantics',
      rationale:
        'Explicitly out of scope per the SD. isQuickFixWorktree/sessionHoldsQuickFixClaim (worktree-claim-decision.cjs) are untouched; deriveWorktreeKey only changes HOW worktreeKey is computed, not how it is subsequently used in shouldBlockWorktreeEdit\'s existing predicate.',
    },
  ],
  system_architecture: {
    overview:
      'ENFORCEMENT-4 (pre-tool-enforce.cjs) gains a precedence chain before its existing shouldBlockWorktreeEdit call: resolve the worktree\'s checked-out branch via execFileSync git, parse it with a new anchored deriveWorktreeKey() in worktree-claim-decision.cjs, fall back to a coordinator-written reuse marker file, and only then to the existing WORKTREE_PATH_RE directory match. The derived key and its source are carried through to both the audit sink and the operator-facing block message. A CI script and a lint provide the FR-5 exit predicates from the enriched audit metadata.',
    components: [
      { name: 'deriveWorktreeKey()', responsibility: 'Branch -> marker -> path precedence chain, anchored slug-stopping regex, returns {key, source}', technology: 'scripts/hooks/worktree-claim-decision.cjs (CJS)' },
      { name: 'ENFORCEMENT-4 call site', responsibility: 'Resolves git branch via execFileSync, reads the marker file, calls deriveWorktreeKey, threads {key, source} into the existing shouldBlockWorktreeEdit + audit + message flow', technology: 'scripts/hooks/pre-tool-enforce.cjs:1002-1039' },
      { name: 'writeReuseMarker()', responsibility: 'Best-effort marker-file writer for coordinator reuse tooling', technology: 'new small helper, mirrors lib/worktree-reaper/reap-eligible-marker.js' },
      { name: 'claim-guard-path-source-false-block-count.mjs', responsibility: 'FR-5a CI predicate over permission_audit_log', technology: 'scripts/ci/' },
      { name: 'directory-name-only-derivation lint', responsibility: 'FR-5b static grep across scripts/hooks/', technology: 'scripts/lint/' },
    ],
    data_flow:
      'Edit/Write tool call -> pre-tool-enforce.cjs ENFORCEMENT-4 -> git branch resolved (execFileSync) -> marker file read (if branch not key-shaped) -> deriveWorktreeKey() in worktree-claim-decision.cjs -> {key, source} -> resolveSessionClaimedSdKey (DB) -> shouldBlockWorktreeEdit(verdict) -> auditPermissionDecision (writes derivedKey/source/branch/claimedSdKey to permission_audit_log.metadata) -> allow or block+message.',
    integration_points: [
      'scripts/hooks/pre-tool-enforce.cjs (ENFORCEMENT-4 call site, lines 1002-1039)',
      'scripts/hooks/worktree-claim-decision.cjs (new deriveWorktreeKey, existing shouldBlockWorktreeEdit)',
      'permission_audit_log (metadata JSONB, additive fields only)',
      'lib/worktree-reaper/reap-eligible-marker.js (shape precedent for the new reuse marker, not a shared import)',
      'tests/unit/claim/test-seams-fr9.test.js (FR-4 specimen host)',
      'scripts/hooks/__tests__/pre-tool-enforce-clmmulti-002.test.js (must be updated, not just extended)',
    ],
  },
  test_scenarios: [
    { id: 'TS-1', scenario: 'Reused tree, branch names own claim', test_type: 'integration', given: 'Directory QF-20260903-188 (a completed, released QF), branch checked out as feat/SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B, session DB-claims SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B', when: 'An Edit tool call targets a file inside that worktree', then: 'Allowed; audit row records derivedKey=SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B, source=branch' },
    { id: 'TS-2', scenario: 'True cross-claim edit', test_type: 'unit', given: 'Directory and branch both name SD-X, session DB-claims SD-Y', when: 'An Edit tool call targets a file inside that worktree', then: 'Blocked (exit 2); message and audit row name SD-X (source=branch) and SD-Y as the session claim' },
    { id: 'TS-3', scenario: 'Slug-carrying branch does not produce a garbage key', test_type: 'unit', given: 'Branch feat/SD-X-001-close-paths, session DB-claims SD-X-001', when: 'deriveWorktreeKey is called directly', then: 'Returns key=SD-X-001 (anchored match), not SD-X-001-close-paths -- the truthy-mismatch check never fires on a spurious slug' },
    { id: 'TS-4', scenario: 'git binary unavailable', test_type: 'unit', given: 'PATH stripped of git for the hook child process, directory names SD-X, session claims SD-Y', when: 'An Edit tool call targets a file inside that worktree', then: 'Falls back to path-regex; verdict identical to pre-FR-1 (blocked, source=path)' },
    { id: 'TS-5', scenario: 'Marker file present, non-key-shaped branch', test_type: 'unit', given: 'Branch is "main" (not key-shaped), a valid reuse marker names SD-Z, session claims SD-Z', when: 'An Edit tool call targets a file inside that worktree', then: 'Allowed; audit row records derivedKey=SD-Z, source=marker' },
    { id: 'TS-6', scenario: 'QF-held case unchanged (regression)', test_type: 'unit', given: 'A QF worktree the session holds via sessionHoldsQuickFixClaim', when: 'An Edit tool call targets a file inside that worktree', then: 'Allowed exactly as before FR-1 (qfHeld tri-state untouched)' },
    { id: 'TS-7', scenario: 'Marker file does not count as reaper-blocking dirt', test_type: 'integration', given: 'A tree with only a fresh .worktree-reuse.json marker (gitignored, untracked) and no other changes', when: 'scripts/worktree-reaper.mjs evaluates the tree for removal eligibility', then: 'The marker alone does not mark the tree as dirty/ineligible (git status --porcelain does not surface gitignored paths)' },
    { id: 'TS-8', scenario: 'FR-5a CI predicate reproducibility', test_type: 'integration', given: 'permission_audit_log rows written since the merge commit with the new metadata fields', when: 'The FR-5a CI script runs twice against unchanged data', then: 'Returns the identical count both times and states its exact predicate in output' },
    { id: 'TS-9', scenario: 'FR-5b lint catches a regression', test_type: 'unit', given: 'A fixture hook file added that matches a bare directory-name-only derivation pattern', when: 'The lint runs', then: 'Fails, naming the offending file' },
  ],
  acceptance_criteria: [
    'A reused worktree whose checked-out branch names the operating session\'s own DB claim is never blocked, with the audit row and message showing source=branch (SD success criterion 1)',
    'A genuine cross-claim edit (branch/directory name a different SD than the session holds) is still blocked, naming both keys and the branch source (SD success criterion 2)',
    'A git error, an unparseable branch, and a missing marker each fall through to the existing path-regex behavior with zero change in verdict from today (SD success criterion 3)',
    'The FR-5a CI predicate over permission_audit_log returns 0 path-derived false blocks on a session\'s own claim since the merge commit, computed from newly-added metadata fields (SD success criterion 4)',
    'A slug-carrying branch (e.g. feat/SD-X-001-close-paths) resolves to the anchored key SD-X-001, not the full remainder -- closing the false-block-relocation risk validation-agent identified before it could ship',
  ],
  risks: [
    {
      risk: 'Adopting an unanchored branch-to-key parser (e.g. the reaper\'s keyFromBranch copies) relocates the false-block defect onto every slug-carrying branch instead of removing it',
      probability: 'MEDIUM',
      impact: 'HIGH',
      mitigation: 'FR-1 explicitly specifies the ANCHORED deriveWorkKeyFromBranch pattern (lib/ship/work-key-derivation.mjs) as the model, not the reaper\'s unanchored copies; FR-4 specimen (a) uses a real slug-bearing child-key branch (SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B) as its own regression guard.',
      rollback_plan: 'LEO_CLAIM_GUARD=off env var (existing kill-switch, already checked at ENFORCEMENT-4\'s entry) disables the entire guard including this change with zero code rollback needed.',
    },
    {
      risk: 'FR-5a\'s CI predicate is uncomputable if the audit metadata is not enriched in the same PR as FR-1',
      probability: 'MEDIUM',
      impact: 'MEDIUM',
      mitigation: 'FR-5\'s description makes the metadata enrichment (derivedKey, source, branch, claimedSdKey) an explicit acceptance criterion of FR-1\'s own audit write, not a separate follow-up -- both land in the same PR by construction.',
      rollback_plan: 'permission_audit_log.metadata is free-form JSONB; reverting the enrichment is a no-op for any existing consumer since no other reader depends on the new fields yet.',
    },
    {
      risk: 'FR-1\'s rewrite of the ENFORCEMENT-4 source block breaks scripts/hooks/__tests__/pre-tool-enforce-clmmulti-002.test.js\'s static source-string pins, and this goes unbudgeted',
      probability: 'HIGH',
      impact: 'LOW',
      mitigation: 'FR-4 explicitly requires updating that test file in the same PR as FR-1, flagged by validation-agent as required (not optional) LOC.',
      rollback_plan: 'The test file itself has no runtime dependents; a broken pin only fails CI, it cannot ship a regression silently.',
    },
    {
      risk: 'The reuse-marker mechanism (FR-2) is never actually wired into the coordinator\'s slot-free reuse tooling, leaving the marker source permanently unused (dead code)',
      probability: 'MEDIUM',
      impact: 'LOW',
      mitigation: 'FR-2 scopes only the marker file format, the read-side guard support, and a small best-effort writer helper the coordinator CAN call -- wiring the coordinator\'s actual reuse-directive tooling to call it is explicitly the coordinator\'s operational responsibility (the reuse POLICY itself is out of scope per the SD), tracked as a known-issue rather than blocked on here.',
      rollback_plan: 'The marker source is additive to the existing branch/path precedence chain; leaving it unused degrades to branch-then-path behavior with no functional loss.',
    },
  ],
  implementation_approach: {
    phases: [
      { phase: 1, description: 'Implement deriveWorktreeKey({branch, marker, filePath}) in worktree-claim-decision.cjs with the anchored regex; unit-test it standalone (FR-1, FR-3)' },
      { phase: 2, description: 'Wire ENFORCEMENT-4 in pre-tool-enforce.cjs to resolve branch via execFileSync git, read the marker, call deriveWorktreeKey, and enrich the audit write with derivedKey/source/branch/claimedSdKey (FR-1, FR-5a groundwork)' },
      { phase: 3, description: 'Implement writeReuseMarker() helper and the marker file convention; add the path to .gitignore (FR-2)' },
      { phase: 4, description: 'Add the 4+ new specimens to tests/unit/claim/test-seams-fr9.test.js and update scripts/hooks/__tests__/pre-tool-enforce-clmmulti-002.test.js\'s source pins (FR-4)' },
      { phase: 5, description: 'Build the FR-5a CI count script and the FR-5b cross-hook lint (FR-5)' },
    ],
    technical_decisions: [
      'Re-implement the anchored branch-key pattern inline in worktree-claim-decision.cjs rather than importing lib/ship/work-key-derivation.mjs, because pre-tool-enforce.cjs\'s CJS runtime cannot require() an ESM module (TR-1)',
      'Reject the reaper\'s existing keyFromBranch copies as the model despite being closer at hand, because they are unanchored and slug-carrying (validation-agent C1 finding) -- correctness over convenience',
      'Enrich permission_audit_log.metadata additively (no schema migration) rather than adding new columns, since the field is already free-form JSONB',
    ],
  },
  integration_operationalization: {
    consumers: [
      { name: 'Any Claude Code fleet worker session', interaction: 'Every Edit/Write tool call inside a .worktrees/ path is intercepted by this guard', frequency: 'Every Edit/Write tool invocation, continuously' },
      { name: 'FR-5a CI job / weekly CAPA sweep', interaction: 'Reads permission_audit_log for the path-source-false-block exit predicate', frequency: 'Per CI run / weekly' },
    ],
    dependencies: [
      { name: 'strategic_directives_v2.sd_key (via resolveSessionClaimedSdKey)', type: 'upstream', contract: 'Bare string equality against the derived key', failure_handling: 'DB query timeout/error -> resolveSessionClaimedSdKey returns null -> fail-open (existing contract, unchanged)' },
      { name: 'git CLI availability inside the hook\'s child process', type: 'upstream', contract: 'execFileSync git -C <root> rev-parse --abbrev-ref HEAD', failure_handling: 'Any throw (missing binary, not a git repo) is caught and falls through to marker then path (FR-3)' },
      { name: 'permission_audit_log', type: 'downstream', contract: 'Additive JSONB metadata fields written per block/allow decision', failure_handling: 'A failed audit write does not block the underlying Edit/Write decision (existing fire-and-forget contract, unchanged)' },
    ],
    data_contracts: [
      { contract_name: 'permission_audit_log.metadata (PAT-CLMMULTI-002 rows)', schema: '{worktreeSdKey, claimedSdKey} today -> adds {derivedKey, source, branch|null, reason?}', validation: 'Additive JSONB, no migration; FR-5a\'s CI script is the consumer-side validator', versioning: 'No versioning needed -- old rows simply lack the new fields, which the FR-5a query treats as pre-fix baseline (excluded from the post-merge-commit window)' },
    ],
    runtime_config: { environment_variables: ['LEO_CLAIM_GUARD (existing kill-switch, unchanged)'], feature_flags: [], deployment_considerations: 'Pure code change to two existing hook files; no server restart or migration required, takes effect on next Claude Code session start (hooks are loaded per-session).' },
    observability_rollout: {
      monitoring: ['FR-5a CI script output (path-source false-block count)', 'FR-5b lint pass/fail in CI'],
      alerts: ['A non-zero FR-5a count post-merge indicates the fix did not fully close the defect and should re-open the SD'],
      rollout_strategy: 'Direct merge to main (small, well-tested hook change); LEO_CLAIM_GUARD=off remains available as an emergency global disable',
      rollback_trigger: 'FR-5a CI predicate goes non-zero, or FR-4 specimens regress on a dependent PR',
      rollback_procedure: 'Revert the merge commit; ENFORCEMENT-4 returns to path-only derivation (the pre-existing, if imperfect, behavior) with no data migration to undo',
    },
  },
  exploration_summary: {
    files_read: [
      'scripts/hooks/pre-tool-enforce.cjs',
      'scripts/hooks/worktree-claim-decision.cjs',
      'scripts/lib/branch-key-extractor.js',
      'lib/git/branch-owner.js',
      'lib/git/branch-owner.test.js',
      'scripts/gh-merge-safe.mjs',
      'lib/ship/qf-detector.mjs',
      'scripts/sd-start.js',
      'lib/worktree-reaper/reap-eligible-marker.js',
      'lib/worktree-reaper/detectors.js',
      'scripts/safe-worktree-remove.mjs',
      'tests/unit/worktree-claim-decision-qf087.test.js',
      'tests/unit/claim/guard-order-and-mismatch-fr7-fr8.test.js',
      'tests/unit/claim/test-seams-fr9.test.js',
      'scripts/hooks/__tests__/pre-tool-enforce-clmmulti-002.test.js',
    ],
    patterns_identified: [
      'No single "branch-to-key rule the claim and PR paths use" exists, contrary to the SD\'s original premise -- at least 5 independent parsers coexist (branch-key-extractor.js, branch-owner.js, gh-merge-safe.mjs inline, qf-detector.mjs, sd-start.js ad-hoc)',
      'lib/ship/work-key-derivation.mjs\'s anchored, slug-stopping deriveWorkKeyFromBranch is the correct model; the reaper\'s keyFromBranch copies are a trap (unanchored, slug-carrying)',
      'lib/worktree-reaper/reap-eligible-marker.js is the established marker-file convention to mirror for FR-2 (best-effort write, JSON shape, gitignored)',
      'tests/unit/claim/test-seams-fr9.test.js\'s execFileSync-driven hook-spawn pattern is the right host for FR-4\'s new specimens',
    ],
    key_decisions: [
      'Correct the SD\'s own premise (no shared branch-key function exists) rather than silently building toward a function that was never real',
      'Place the new derivation function in the CJS worktree-claim-decision.cjs rather than reaching for an ESM module the hook cannot require()',
      'Enrich audit metadata in the same PR as the derivation change so FR-5a\'s exit predicate is computable from day one',
    ],
    exploration_date: '2026-09-04',
  },
};

async function main() {
  const { error } = await supabase.from('product_requirements_v2').insert(prd);
  if (error) throw error;
  console.log('Inserted PRD', PRD_ID);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
