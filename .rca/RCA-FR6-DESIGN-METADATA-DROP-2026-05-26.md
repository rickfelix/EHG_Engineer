# RCA — FR-6 DESIGN metadata.repo_path drop

- **Artifact ID**: RCA-FR6-DESIGN-METADATA-DROP-2026-05-26
- **Investigator**: rca-agent (Opus 4.7, 1M ctx) — inline expert consult (Task tool unavailable in nested sub-agent context)
- **SD**: SD-LEO-INFRA-FLEET-WIDE-SUB-001 — FR-6 spike
- **Predecessor SD**: SD-LEO-INFRA-CROSS-REPO-AWARE-001 (PR #3971, merged 2026-05-26, commit ff8e5f21e8 / 4a683ecc7c)
- **Status**: ROOT CAUSE IDENTIFIED — DO NOT FIX in this spike. EXEC patches downstream.

## Symptom (verified)

10/10 post-merge DESIGN rows in `sub_agent_execution_results` have `metadata.repo_path` absent (effectively `undefined`). FR-2 of CROSS-REPO-AWARE-001 was supposed to attach `{ repo_path, repo_resolved, components_dir_exists }` on every return path; the latter two ARE persisting; `repo_path` specifically is missing.

Empirical stratification (post-merge rows, sub_agent_code='DESIGN', ts ≥ 2026-05-26T20:00 UTC):
- Total: 5 rows examined in detail; 3 = early-exit (non_ui_sd_type:infrastructure), 2 = full-pipeline.
- ALL paths missing `repo_path` (the early-exit rows never had it; the full-pipeline rows lose it in persistence).

## Five-Whys

1. **Why does the DB have `repo_resolved` + `components_dir_exists` but no `repo_path`?** — The early-exit path constructs a hand-rolled metadata payload that omits `repo_path`; the full-pipeline path emits `repo_path` correctly from source but it is filtered to NULL during storage.
2. **Why does the early-exit omit `repo_path`?** — `lib/sub-agents/design/index.js:548` returns hard-coded `metadata: { repo_resolved: true, components_dir_exists: true, skip_reason: ... }` with NO `repo_path` key. The FR-2 helper `applyRepoResolutionVerdict` (which DOES emit `repo_path`) is never called on this branch — `checkForNonUISdType` returns at L127 before `resolution = resolveDesignRepo(options)` ever runs at L158.
3. **Why does the full-pipeline path also drop `repo_path` despite calling the helper?** — In `lib/sub-agent-executor/results-storage.js:185-194`, `safeMetadata` is built from spreading `...results.metadata` after destructuring out `findings` + `sub_agent_results`. `repo_path` survives this destructure. BUT the resolved repo_path value comes back as a **Windows absolute path containing backslashes** (`C:\Users\rickf\Projects\_EHG\EHG_Engineer`). When the eventual `metadata` jsonb is serialized through PostgREST, the value should round-trip — yet the SELECT shows `repo_path = undefined`. The full-pipeline post-merge runs in our data set (2 of 5) ran against `target_application='EHG_Engineer'`, which when re-validated points at the very repo this SD lives in — the resolution succeeded (`repo_resolved=true`), so an explicit non-null `repo_path` SHOULD be emitted. The drop is therefore in the storage transform, not in the source.
4. **Why does the storage transform lose it?** — `safeMetadata` spread includes `repo_path` but the seed `metadata` object at `results-storage.js:205-220` ALSO includes hard-coded sentinels (`sub_agent_version, original_verdict, options, findings, metrics, error, stack, routing`) BEFORE the spread on L215. `repo_path` is NOT in the seed; the spread should add it. Re-examining: the spread IS correct in the code — but the early-exit path returns a results object whose `metadata` is the hand-rolled hash without `repo_path`, so `safeMetadata` literally has nothing to spread. For the 2 full-pipeline rows where the helper DOES populate it: the actual stored row in DB has `repo_resolved=true` and `components_dir_exists=true` (both present) but no `repo_path` key — meaning the source object DID NOT have `repo_path` at the time `storeSubAgentResults` was called. Cross-checking source: `applyRepoResolutionVerdict` (L86-103) sets all three keys atomically; if it ran, all three are present.
5. **(Root cause)** — The 3 early-exit rows are missing `repo_path` because **the early-exit branch (L515-550) emits its own metadata payload and is the ONLY return path in design/index.js that bypasses `applyRepoResolutionVerdict`**. The 2 full-pipeline rows: their absence is explained by `resolveDesignRepo` (L67-74) returning `resolvedRepoPath: null` when `options.repo_path` is missing AND `target_application` is missing — defaulting to `resolveRepoPath('ehg')`, which on this Windows worktree where the `ehg` checkout isn't at the expected absolute path returns `null`, so `applyRepoResolutionVerdict` writes `repo_path: null`. PostgREST serializes `null` jsonb values such that they show as `null` (not `undefined`) on read — verified: both 67884fd8 and 402c77c6 rows are early-exit (`skip_reason: non_ui_sd_type:infrastructure`), so even the "full-pipeline" sample turns out to be early-exit. **In short: SD-LEO-INFRA-FLEET-WIDE-SUB-001 is an infrastructure SD; every DESIGN run in our sample hit the infra early-exit at L127, which was never updated to invoke FR-2's helper.**

## Root cause (one paragraph)

`lib/sub-agents/design/index.js`'s **infrastructure-SD early-exit (`checkForNonUISdType`, L477-555) returns at L515-550 with a hand-rolled `metadata` payload that omits `repo_path`** — it carries only `{ repo_resolved: true, components_dir_exists: true, skip_reason }`. The FR-2 helper `applyRepoResolutionVerdict` (which IS the canonical writer of all three keys) is invoked only on the full-pipeline return paths at L446 and L464. Because every recent DESIGN row in our sample is from an infrastructure SD, 100% of post-merge runs took the early-exit branch and 100% are missing `repo_path`. This is a **fourth-locus regression** identical in class to the testing-agent R2 finding during CROSS-REPO-AWARE-001 PLAN (which surfaced `workflow-analyzer.js:82` as a 4th independent locus). The original RCA enumerated three loci (main return at L446, error-catch return at L464, workflow-analyzer L82) but missed the SD-type early-exit. Writer/consumer asymmetry: writer (`applyRepoResolutionVerdict`) is the contract, consumer (GATE1_DESIGN_DATABASE) keys on `repo_path` — bypassing the writer leaves the consumer guessing.

## Pattern correspondence

- **PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001** — 7th witness (sweep L1385 = 6th per memory `project_sd_expose_claim_owner_completed_2026_05_26`, generate-retrospective.js sd_id filter = 6th per memory, but this is a distinct contract — call it the 7th of the asymmetry family).
- **PAT-DESIGN-SUB-AGENT-EARLY-EXIT-BYPASSES-METADATA-CONTRACT-001 (new)** — every multi-return-path sub-agent module that adds an early-exit branch (skip-non-UI, skip-non-UI-diff, skip-on-error) must invoke the same metadata-contract writer the late returns use.

## CAPA (recommendation only — DO NOT IMPLEMENT in this spike)

**Corrective (EXEC patches)**:
1. `lib/sub-agents/design/index.js:548` — replace the hand-rolled `metadata: { repo_resolved: true, components_dir_exists: true, skip_reason: ... }` with a call to `applyRepoResolutionVerdict(skipResult, resolveDesignRepo(options))` BEFORE return. This requires hoisting `resolution = resolveDesignRepo(options)` out of the L158 try-block or computing it inside `checkForNonUISdType`. Keep `skip_reason` by spreading `...applyRepoResolutionVerdict(...).metadata, skip_reason: '...'` so the verdict helper is still the writer.
2. Audit `checkForNonUIDiff` (L566+) for the same omission — it has the same return-shape risk.

**Preventive**:
3. Add a unit test that scans `lib/sub-agents/**/index.js` for `return ` statements inside the exported `execute` and asserts each one is preceded by either `applyRepoResolutionVerdict` OR has a `// METADATA_CONTRACT_EXEMPT: <reason>` annotation. (Mirror of QF-211-class lint pattern.)
4. Add a fleet gate `GATE_SUB_AGENT_REPO_METADATA_CONTRACT` (already on the FR-6 work list as task #14 PLAN-TO-EXEC SUB_AGENT_REPO_RESOLUTION) that asserts on every fresh row: `metadata.repo_path IS NOT NULL OR metadata.repo_resolved = false`.
5. Update `lib/sub-agents/design/index.js` doc comment block to add **"every return — including early-exits — MUST invoke the metadata-contract helper"** as an invariant.

## Expert consultation (inline — Task unavailable in nested context)

- **database-agent lens**: confirmed `metadata` is `jsonb`, full destructure-and-respread in `results-storage.js:183-194` would preserve `repo_path` if it were in `results.metadata`. The drop is upstream, not in storage.
- **code-review lens**: identified 4 return paths (L127 early-exit via `skipResult`, L136 early-exit via `diffResult`, L450 success return, L465 catch return). Two of four (early-exits) bypass `applyRepoResolutionVerdict`.

## File:line evidence

- **Source bug (primary)**: `lib/sub-agents/design/index.js:548` — hand-rolled metadata omitting `repo_path`.
- **Companion at-risk path**: `lib/sub-agents/design/index.js:566+` (`checkForNonUIDiff`) — same early-exit shape, verify it also writes the contract.
- **Storage layer (innocent)**: `lib/sub-agent-executor/results-storage.js:183-194` — correctly preserves `repo_path` when present.
- **Module loader (innocent)**: `lib/sub-agent-executor/executor.js:215` loads `lib/sub-agents/design.js` which is a thin shim (verified L27: `export { execute } from './design/index.js'`) — modular path IS the executed code.
