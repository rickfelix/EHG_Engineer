<!-- Archived from: docs/plans/sd-man-fix-s19-s18-contract-001-plan.md -->
<!-- SD Key: SD-LEO-INFRA-STAGE-BINDING-CONTRACT-001 -->
<!-- Archived at: 2026-04-28T18:44:04.771Z -->

# Stage 19 Binding Contract for S18 Marketing Copy + Pre-Approval Playbook

## Type

infrastructure

## Priority

medium

## Target Application

EHG_Engineer (orchestrator pipeline: `lib/eva/artifact-types.js`, `lib/eva/orchestrator/analysis-steps/stage-19-sprint-planning.js`, plus operational playbook under `docs/guides/workflow/`)

## Summary

The Stage 18 → Stage 19 handoff in the EHG Engineer orchestrator pipeline did not enforce a binding contract: Stage 19 (sprint planning) would proceed regardless of whether Stage 18 (marketing copy LLM generation) had produced verified output. This let downstream sprint plans be built from missing or fabricated marketing copy, defeating the purpose of S18's honest-failure mode (which itself was hardened in the parallel `SD-MAN-FIX-S18-LLM-HONEST-FAILURE` work, never formally captured as an SD).

In addition, the S19 sprint planning analysis step had two structural defects that surfaced while wiring the contract:

1. A temporal-dead-zone (TDZ) hazard from `appType` being referenced before its `let`/`const` declaration was hoisted into the analyzer's main block — caused intermittent `ReferenceError` at runtime depending on optional-chain branch.
2. The S19 sprint plan artifact was not registered in `lib/eva/artifact-types.js`, so even when the analyzer wrote it, the pipeline did not persist it as a typed artifact — downstream stages saw no S19 output.

This SD formalises six prior commits that have been stacked on a backup branch (`wip/stage19-s18-contract-stacked-2026-04-28`) but never opened as a PR. The implementation already exists; this SD wraps it for proper LEAD→PLAN→EXEC tracking and a clean PR off `origin/main`.

**Concrete provenance (commits to be re-played onto the new SD branch):**

| SHA | Subject | Files |
|---|---|---|
| 36f590a1ee | fix(stage-19): hoist appType + register S19 artifact type so sprint planning persists | `lib/eva/artifact-types.js` (+11), `stage-19-sprint-planning.js` (+13) |
| c3bd52a655 | fix(stage-19): wire S18 marketing copy into sprint plan as binding contract | `stage-19-sprint-planning.js` (+58) |
| 72a9d8f2a6 | docs(SD-MAN-FIX-S18-LLM-HONEST-FAILURE): stage pipeline pre-approval playbook | `stage-pipeline-pre-approval-playbook.md` (+239 new file) |
| bbe9454b47 | docs: populate playbook §3 with Stage 19 findings | playbook (+8) |
| 83d006cee6 | docs(playbook): expand S19 entry with TDZ + registry + marketing-copy findings | playbook (+21), `check-s19-marketing-grounding.mjs` (+65 new) |

Excluded from this SD: `235b4285dc fix(replit-repo-seeder): idempotent re-run skips commit+push when nothing staged` — unrelated concern (~32 LOC), will ship as its own QF.

## Depends On

None. The S18 marketing-copy honest-failure behaviour referenced in commit messages was implemented in unmerged work on `feat/SD-MAN-FIX-STAGE-MARKETING-COPY-001` (DB-completed, no PR ever opened). Whether that ships or not, the Stage 19 binding contract is **fail-closed** — if S18 produces no artifact of the expected type, S19 refuses to proceed, which is the desired behaviour either way.

## Success Criteria

- **AC1**: `lib/eva/artifact-types.js` exports a registered type for the S19 sprint plan artifact (`stage_19_sprint_plan` or equivalent canonical name), discoverable via the existing artifact-types lookup, used by the persistence layer to round-trip the artifact through the pipeline.
- **AC2**: `lib/eva/orchestrator/analysis-steps/stage-19-sprint-planning.js` reads a Stage 18 marketing-copy artifact from the pipeline context **before** running its own analysis. If the artifact is absent, malformed, or its `status !== 'verified'` (or equivalent honest-failure marker), the analyzer refuses with a typed contract-violation error rather than running on missing input.
- **AC3**: The contract refusal in AC2 emits a structured failure message that names (a) the missing/invalid S18 artifact key, (b) the S19 step that refused, (c) a remediation hint pointing at the S18 step. No silent fall-through, no fabricated stub artifact.
- **AC4**: `appType` is declared (with `let`/`const`) at the top of the analyzer's main scope before any reference site, eliminating the TDZ hazard. The previous reference path remains functional under both code paths (S18 artifact present and absent).
- **AC5**: `docs/guides/workflow/stage-pipeline-pre-approval-playbook.md` is checked into the repo as a durable operational document, structured by stage with at minimum a §3 covering Stage 19 (TDZ + artifact-registry + marketing-copy contract findings). Format is consistent with existing `docs/guides/workflow/*.md` conventions.
- **AC6**: `scripts/one-off/check-s19-marketing-grounding.mjs` is checked in as a runnable verification harness for the contract — given a context object with or without an S18 artifact, asserts the analyzer's branching is correct.
- **AC7**: A vitest unit test (`tests/unit/lib/eva/orchestrator/analysis-steps/stage-19-sprint-planning.test.js` or sibling) covers: (a) S18 artifact absent → contract refusal raised with expected error shape; (b) S18 artifact present + verified → analyzer runs and returns S19 artifact of registered type; (c) S18 artifact present but `status !== 'verified'` → contract refusal; (d) the TDZ regression — calling the analyzer with the optional-chain branch that previously hit ReferenceError now succeeds.
- **AC8**: A regression test (or expansion of an existing pipeline test) verifies the registered S19 artifact type round-trips through the persistence layer end-to-end (artifact written by analyzer → fetched by next consumer → recognised by type registry).
- **AC9**: PR diff against `origin/main` matches the cherry-picked commit set (5 commits, ~415 LOC: 82 code + 268 docs + 65 verification script) plus any new test files. No drift from the implementation that already exists on the backup branch.

## Scope

### FR1 — Register S19 artifact type

In `lib/eva/artifact-types.js`:
- Add the S19 sprint-plan artifact type to the registry, following the same pattern as existing stage artifact types.
- Export name and shape so the pipeline persistence layer can discover and validate.
- Implementation already in commit `36f590a1ee`; this FR is to verify the registration is canonical and replay onto the new branch.

### FR2 — Stage 19 binding contract: refuse on missing/invalid S18 artifact

In `lib/eva/orchestrator/analysis-steps/stage-19-sprint-planning.js`:
- At the top of the analyzer (after argument validation but before any analysis logic), look up the S18 marketing-copy artifact from the pipeline context.
- Validate: artifact exists, has the expected type (canonical name from artifact-types registry), and its status field indicates verified output (per S18 honest-failure semantics).
- If any check fails, raise a typed `StageContractError` (or equivalent existing error class — reuse what S18 raises, or define if absent) with payload `{stage: 19, missing_dependency: 'stage_18_marketing_copy', remediation: '...'}`.
- Implementation already in commit `c3bd52a655`; FR is to replay and confirm error class is canonical.

### FR3 — TDZ fix: hoist `appType`

In `lib/eva/orchestrator/analysis-steps/stage-19-sprint-planning.js`:
- Move the `let appType = ...` declaration to the top of the analyzer's main scope, before any reference site (including conditional branches that previously hit a forward reference).
- Implementation already in commit `36f590a1ee`; FR is to replay.

### FR4 — Stage pipeline pre-approval playbook

Create `docs/guides/workflow/stage-pipeline-pre-approval-playbook.md`:
- Document the pre-approval workflow for the stage pipeline (S18→S19→…).
- §3 must cover Stage 19 specifics: the binding contract, the TDZ defect class, the artifact-registry requirement, the marketing-copy grounding check.
- Style should match other docs under `docs/guides/workflow/`.
- Content already in commits `72a9d8f2a6`, `bbe9454b47`, `83d006cee6`.

### FR5 — Marketing-grounding verification script

Add `scripts/one-off/check-s19-marketing-grounding.mjs`:
- Standalone harness that loads a fixture context with/without S18 artifact and asserts S19's contract branching.
- Already in commit `83d006cee6`.

### FR6 — Tests (AC7 + AC8)

Add or extend test files to cover the four scenarios in AC7 and the round-trip in AC8. The existing commits do **not** include test files for these specific contract scenarios — this FR is net-new work on top of the cherry-picked commits, satisfying the gate threshold and AC7/AC8.

## Out of Scope

- Re-implementing S18 honest-failure behaviour. That work was completed in (un-PR'd) `feat/SD-MAN-FIX-STAGE-MARKETING-COPY-001` and is referenced but not modified here.
- Generalising the binding-contract pattern to other stage pairs (S17→S18, S19→S20, etc.). Worth a follow-up SD if the pattern proves out.
- Replit-repo-seeder idempotency fix (commit `235b4285dc`) — separate QF.
- Migrating `wip/stage19-s18-contract-stacked-2026-04-28` into git history beyond the cherry-pick onto the SD branch. The wip branch stays as a local archive.

## Risks

- **Risk: Cherry-pick conflicts**. The 5 commits stack on top of a merged QF branch (`qf/QF-20260428-RETRO-AGENT-LESSON-TRIAGE` → `main` via PR #3407). Cherry-picking onto a fresh branch off `origin/main` may surface conflicts if any of the touched files diverged on `main`. Mitigation: cherry-pick commits one at a time in order; resolve any conflict deterministically against `origin/main` head; if `lib/eva/orchestrator/analysis-steps/stage-19-sprint-planning.js` has been touched on main since these commits were authored, manually re-apply the binding contract on top of the current main version.
- **Risk: Test failures from missing S18 artifact in fixtures**. AC7 scenarios require fixture contexts with shaped S18 artifacts. If existing test infrastructure does not provide these, FR6 may need to extend fixtures. Mitigation: budget extra LOC in EXEC; if fixture shape is unknown, surface to PLAN.
- **Risk: Artifact type name collision**. AC1's canonical name (`stage_19_sprint_plan` or similar) may already be present in the registry under a different alias. Mitigation: PLAN phase audits the registry and confirms.
