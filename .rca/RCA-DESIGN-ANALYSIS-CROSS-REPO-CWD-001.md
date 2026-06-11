# RCA: DESIGN analysis runs against cwd, not the SD's UI repo (cross-repo false-negative)

- **RCA ID**: RCA-DESIGN-ANALYSIS-CROSS-REPO-CWD-001
- **Date**: 2026-05-26
- **Analyst**: rca-agent (Opus 4.7 1M)
- **Trigger SD**: SD-LEO-INFRA-STAGE-BUILD-MODEL-001 (PLAN phase, `add-prd-to-database.js`)
- **Classification**: `process_issue` / `infrastructure`
- **Category**: `cross_cutting` (cwd-assumption + writer/consumer-asymmetry + gate-scoring blind spot)
- **Severity**: NON-BLOCKING but SYSTEMIC — DESIGN validation is a silent no-op for every cross-repo UI SD
- **Mode**: corrective-only (root cause + CAPA; NO inline fix per request)

---

## Symptom (as observed)

During `node scripts/add-prd-to-database.js` for a UI SD, the internal DESIGN analysis printed:

```
Design Score: 0/100 (threshold: 60) ❌ FAIL
❌ 1 accessibility issue(s) found
Command failed: grep -r "style={{" src/components ... The system cannot find the path specified.
find src/components -name "*.tsx" ... cannot find the path specified
```

…yet the DESIGN module recorded overall `PASS (100% confidence)` and the PLAN-TO-EXEC `GATE1_DESIGN_DATABASE` / `1:designSubAgentExecution` gates PASSED.

### Symptom-report correction (evidence)

The symptom report stated `target_application=EHG_Engineer`. The DB says otherwise:

```
SD-LEO-INFRA-STAGE-BUILD-MODEL-001
  target_application = "EHG"               <- UI repo correctly declared
  metadata.target_repos = ["EHG","EHG_Engineer"]
applications (active): EHG -> C:/Users/rickf/Projects/_EHG/ehg   <- SSOT path correct
```

This sharpens the finding: the authoritative path to the UI repo **already exists and is correct**. The DESIGN analysis simply never consults it. This is a pure **plumbing gap**, not a data gap.

---

## Evidence Gathered (verified, not assumed)

| Claim | Evidence |
|---|---|
| `src/components` exists in ehg, NOT in EHG_Engineer | `ls` — ehg/src/components present; EHG_Engineer/src/components = "No such file or directory" |
| Orchestrator passes NO repo path to DESIGN | `scripts/prd/sub-agent-orchestrator.js:114` — `executeSubAgent('DESIGN', sdId, { timeout: 120000 })`. No `repo_path`, no `target_application`. |
| `executeSubAgent` forwards options verbatim | `lib/sub-agent-executor/executor.js:222-234` — `execOptions = { ...options, sdKey, sdUUID }` → `subAgentModule.execute(sdUUID, subAgent, execOptions)` |
| NOBODY sets `options.repo_path` in the add-prd→DESIGN chain | grep `repo_path:` across lib/scripts — only `design/utils.js:86`, `performance.js:500`, `review-workflow.js:156` set it; none on the add-prd path |
| Two inconsistent cwd defaults inside the DESIGN module | `design/index.js:108` → `options.repo_path \|\| resolveRepoPath('ehg')` (good); `design/index.js:505` (`checkForNonUIDiff`) → `options.repo_path \|\| process.cwd()` (wrong) |
| `resolveRepoPath('ehg')` returns the correct path at runtime | node probe: `resolveRepoPath('ehg') = C:\Users\rickf\Projects\_EHG\ehg`; `resolveRepoPath(undefined) = ...EHG_Engineer` |
| `resolveRepoPath` returns `null` on a registry miss | `lib/repo-paths.js:118-134` — loops `loadValidatedRegistry().apps`; falls through to `return null` if no name match / registry empty |
| `execAsync`/`execSync` with `cwd:null` (or `cwd=EHG_Engineer`) → greps cwd | Node child_process: `cwd:null` uses `process.cwd()`. cmd.exe error string "The system cannot find the path specified" matches the symptom (not a bash error) |
| All grep/find checks hardcode `src/components` and key off cwd only | `lib/sub-agents/design/checks.js:27,33,65,126,162,167,205,211,241,247` — every command is literally `... src/components ...` with `{ cwd: repoPath }` |
| The gate scores execution-recorded, NOT design_score | `scripts/modules/design-database-gates-validation.js:152-182` — awards 20/20 if a `sub_agent_execution_results` row exists with verdict PASS/COMPLETE; FAIL only adds a **warning** (L181-182). `design_score`, `design_system_check.errors`, accessibility count are never read. |
| Module verdict stays PASS because path-not-found grep returns 0 | empty/error grep output → `wc -l` = 0 → `violations: 0` → no critical issue → `verdict: 'PASS', confidence: 100` (`design/index.js:90-126`) |

---

## Root Cause

**The DESIGN sub-agent has no contract for "which repository holds this SD's UI." The add-prd orchestrator invokes it with only `{ timeout }`, so the agent guesses the repo via two divergent, cwd-anchored fallbacks — neither of which is derived from the SD's `target_application` (the authoritative SSOT).**

The chain:

1. `add-prd` → `executeDesignAnalysis(sdId, sdData, …)` (`sub-agent-orchestrator.js:99-129`) calls `executeSubAgent('DESIGN', sdId, { timeout })`. **`sdData.target_application` is in scope but is dropped — never converted to a path and never passed.**
2. `executeSubAgent` forwards options unchanged; `options.repo_path` is therefore `undefined`.
3. Inside the DESIGN module, the repo path is guessed two different ways:
   - main validation (`index.js:108`): `resolveRepoPath('ehg')` — a **hardcoded literal 'ehg'**, NOT `sdData.target_application`. Correct only by luck for EHG-UI SDs; returns `null` on any registry miss; wrong for every non-ehg venture UI SD (CronLinter, Canvas AI, …).
   - early diff short-circuit (`index.js:505`): `process.cwd()` — i.e. EHG_Engineer when LEO tooling runs. **Writer/consumer asymmetry**: two sibling code paths in the same module disagree on the default repo.
4. Every check in `checks.js` then runs `grep/find ... src/components` with `{ cwd: <guessed path> }`. When the guess is `null` (registry miss) or EHG_Engineer (cwd), `src/components` doesn't exist → cmd.exe prints "The system cannot find the path specified", `wc -l` yields 0, and the module reports **0 violations → PASS / 100% confidence**.
5. `GATE1_DESIGN_DATABASE` (`design-database-gates-validation.js:170-182`) awards full marks for the mere existence of a PASS-verdict execution row and **never inspects `design_score`** — so a 0/100 score, a "FAIL" banner, and a path-not-found error all pass the gate silently.

**The true defect point (the fix locus):** the orchestrator-to-sub-agent boundary discards `target_application`. The hardcoded `'ehg'`, the `process.cwd()` fallback, and the gate's score-blindness are three amplifiers that turn that one omission into a guaranteed, undetectable false-negative.

### Why it's a false-negative, not just noisy

Because the wrong/empty path yields **zero** violations, the failure mode is "always green," the worst kind: real accessibility/design-system violations in the actual UI repo are never surfaced, and no gate ever catches that DESIGN looked at the wrong (or empty) tree. The loud "0/100 FAIL" text is cosmetic; the machine-readable verdict the gate consumes is PASS.

---

## Related Prior Patterns (this is a repeat class)

- **PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001** (5x, infrastructure) — same shape: one code path (`index.js:108`, default 'ehg') and its sibling (`index.js:505`, default `process.cwd()`) disagree on a shared assumption (the repo root). 6th witness.
- **PAT-CROSS-REPO-BLIND-SPOT-001** (infrastructure) — "check only searches current repo, missing work shipped to ehg." Identical root: a LEO tool run from EHG_Engineer assumes cwd == the work repo.
- **ENGINEER_ROOT / cwd-assumption class** seen in SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 — `resolveRepoPath(null/undefined)` and `process.cwd()` both collapse to ENGINEER_ROOT; the venture-build EXEC-loop gap (sd-start worktrees EHG_Engineer not the target repo) is the same family. The DB-first resolver `resolveRepoPathDbFirst(targetApp, supabase)` (`repo-paths.js:157`) was built for exactly this and is the right tool to reuse here.

---

## CAPA

### Corrective Action (fix the no-op so DESIGN runs against the real UI repo)

- **What**: Resolve the SD's UI repo from `target_application` (DB-first via `resolveRepoPathDbFirst`, registry fallback) and thread it into the DESIGN analysis as an explicit `repo_path`. Stop guessing from cwd/literal-'ehg'.
- **Recommended minimal systemic change — Option (a)+(c) combined** (a is the real fix; c is the safety net that prevents silent recurrence):
  - **(a) Pass a resolved `repo_path` from the SD** — the single highest-leverage edit:
    - `scripts/prd/sub-agent-orchestrator.js:99-128` (`executeDesignAnalysis`): resolve `const repoPath = await resolveRepoPathDbFirst(sdData.target_application, supabase)` and pass `{ timeout: 120000, repo_path: repoPath, target_application: sdData.target_application }` to `executeSubAgent('DESIGN', …)`. (Mirror for `executeDatabaseAnalysis`/others if they grep the tree — DATABASE does not, so DESIGN is the only forced edit.)
    - `lib/sub-agents/design/index.js:108`: change `options.repo_path || resolveRepoPath('ehg')` → `options.repo_path || (options.target_application ? resolveRepoPath(options.target_application) : resolveRepoPath('ehg'))`. Drop the literal `'ehg'` as the primary source.
    - `lib/sub-agents/design/index.js:505` (`checkForNonUIDiff`): change `options.repo_path || process.cwd()` → `options.repo_path || resolveRepoPath(options.target_application) || process.cwd()` so the early diff short-circuit and the main validation agree (kills the writer/consumer asymmetry).
  - **(c) Make the gate distinguish "ran against the correct repo" from "ran against an empty/wrong path"** — the durable prevention:
    - In the DESIGN module, record the resolved `repo_path` and a `repo_resolved: boolean` (and ideally a `components_dir_exists: boolean`) into the `sub_agent_execution_results.metadata` it writes.
    - In `scripts/modules/design-database-gates-validation.js` (the DESIGN-execution check, ~L152-182): treat `verdict==='PASS'` with `metadata.repo_resolved===false` OR `metadata.components_dir_exists===false` as **NOT** a valid execution (fail or warn-hard), so a path-not-found run can never score 20/20. This converts today's false-negative into a detectable signal without over-blocking legitimate backend-only SDs (which already early-return via `checkForNonUISdType`/`checkForNonUIDiff`).
- **Option (b)** (make the design-sub-agent CLI accept a path arg and have add-prd pass the ehg path) is **redundant** here: the CLI invocation at `checks.js:126` already runs with `{ cwd: repoPath }` and `src/components` relative to it, so fixing `repoPath` (Option a) fixes the CLI call for free. The literal `src/components` arg at L126 can stay. Pursue (b) only if you want the standalone CLI usable outside the orchestrator — not required for this defect.
- **Where (files, in priority order)**:
  1. `scripts/prd/sub-agent-orchestrator.js` (resolve + pass `repo_path`/`target_application`) — the one required edit.
  2. `lib/sub-agents/design/index.js` (lines 108 and 505 — derive from `target_application`, unify the two defaults).
  3. `scripts/modules/design-database-gates-validation.js` (gate reads `repo_resolved`/`components_dir_exists`).
- **Who**: PLAN/EXEC of a new infra remediation SD.
- **When**: next-session (non-blocking; current SD-LEO-INFRA-STAGE-BUILD-MODEL-001 PRs should stay clean — do NOT fold this in).

### Preventive Action (stop the whole class)

- **Control 1 — single repo-resolution helper for sub-agents**: any sub-agent that reads a working tree must obtain its root from `resolveRepoPathDbFirst(sd.target_application, supabase)`, never from `process.cwd()` and never from a hardcoded app literal. Add a tiny shared `resolveSubAgentRepo(sd, supabase)` and route DESIGN/PERFORMANCE/any tree-reading agent through it.
  - **Location**: `lib/repo-paths.js` (export helper) + the per-agent `execute()` entrypoints.
  - **Type**: runtime_check + refactor.
- **Control 2 — fail-closed on unresolved/empty repo**: a tree-reading sub-agent that cannot resolve its repo, or finds the expected components dir missing, MUST emit `verdict: 'CONDITIONAL_PASS'` (or BLOCKED) with `repo_resolved:false`, NEVER `PASS / 100%` off a zero-count grep. Zero violations from an empty tree is not evidence of compliance.
  - **Location**: `lib/sub-agents/design/index.js` (verdict assembly) + gate `design-database-gates-validation.js`.
  - **Type**: validation_gate.
- **Control 3 — lint against `process.cwd()` in sub-agent file-system reads**: add an ESLint/grep CI guard flagging new `process.cwd()` and `cwd: process.cwd()` (and `cwd: null`) inside `lib/sub-agents/**`, steering authors to the resolver. Directly attacks PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 and the ENGINEER_ROOT/cwd class.
  - **Location**: CI lint config + `scripts/hooks`.
  - **Type**: pre_commit / CI.
- **Pattern**: link to PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (increment to 6 witnesses) and PAT-CROSS-REPO-BLIND-SPOT-001; consider new **PAT-SUBAGENT-CWD-REPO-ASSUMPTION-001** if a distinct sub-agent-scoped tracking entry is wanted.

### Verification

- **Test**: with the fix, run add-prd for an EHG-UI SD from the EHG_Engineer cwd and assert the DESIGN log shows `repo_path = ...\ehg`, the `src/components` greps return non-error output, and `design_score` reflects the real ehg tree (not 0). Add a unit test asserting `executeDesignAnalysis` passes a `repo_path` resolved from `target_application` (mock `resolveRepoPathDbFirst`).
- **Gate regression**: craft a fixture where DESIGN runs against an empty/non-existent path → assert `GATE1_DESIGN_DATABASE` does NOT award full credit (must consume `repo_resolved:false`). Confirms (c).
- **Non-regression**: backend-only feature SD (no UI in diff) still early-returns PASS via `checkForNonUIDiff` after the L505 default change (since an empty diff still returns null → existing flow); a non-ehg venture-UI SD (e.g. target_application='CronLinter') now greps `...\cronlinter\src\components`, not ehg/cwd.

### Expert Contributions

- **Experts consulted (INLINE, due to sub-agent depth limits — `Task`/`TeamCreate` unavailable in nested sub-agent context)**: github-agent lens (cross-repo / cwd workflow) + database-agent lens (registry & `applications.local_path` SSOT).
- **github-agent lens (cross-repo workflow)**: independent options enumerated — (a) thread resolved path from SD [recommended; smallest blast radius, fixes CLI call transitively], (b) CLI path-arg [redundant given `{cwd}` already plumbed], (c) gate distinguishes correct-vs-empty repo [necessary safety net — without it, any future regression silently re-greens]. Tradeoff: (a) alone fixes today's symptom but leaves the gate blind; (a)+(c) fixes symptom AND makes recurrence detectable. Recommendation: (a)+(c); skip (b).
- **database-agent lens (SSOT)**: `target_application='EHG'` and `applications.name='EHG' → C:/.../ehg` are both present and correct in the DB — the SSOT is sound, so the fix must be plumbing, not data. Use `resolveRepoPathDbFirst(target_application, supabase)` (DB-first, registry-fallback, `normalizeAppName`-tolerant) rather than the sync `resolveRepoPath('ehg')` literal, so venture UIs (CronLinter/Canvas AI/etc.) resolve too and a registry gap doesn't silently return `null→cwd`.
- **Findings incorporated**: the CAPA's primary edit threads `target_application` (not a literal) through `resolveRepoPathDbFirst`; the gate-hardening (Control 2 / Option c) directly implements the github-lens "detectable, not silent" requirement; Control 3 lint targets the cwd-assumption class both lenses flagged.

---

## Confidence

**0.9.** Every link in the chain is verified against source (orchestrator call, option forwarding, both divergent defaults, the runtime resolver values, the grep cwd-binding, and the gate's score-blindness). The one residual unknown is whether, on the specific failing run, `repoPath` at `index.js:108` was `null` (registry miss) vs the correct ehg path with the symptom originating from the `checkForNonUIDiff`/cwd path — but this does not change the root cause or the CAPA: in BOTH branches the orchestrator's failure to pass `target_application` is the defect, and threading the resolved path + hardening the gate fixes both.
