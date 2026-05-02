<!-- Archived from: docs/plans/opus47-module-e-scope-gate-precommit-plan.md -->
<!-- SD Key: SD-LEO-INFRA-OPUS-MODULE-SCOPE-001 -->
<!-- Archived at: 2026-04-24T20:15:27.676Z -->

# SD — Opus 4.7 Module E: Scope Gate (pre-commit)

## Type
infrastructure

## Priority
medium

## Problem

"While I'm here" edits — touching files outside the SD's declared `scope.in_files` — silently expand SD scope. Memory `feedback_scope_gate_inherits_parent_archkey.md` captures a related arch-key issue, but the broader problem is that SDs declare `in_files` / `out_files` without any pre-commit enforcement. Opus 4.7's improved codebase navigation makes the failure mode worse: the model happily follows links, sees adjacent drift, and helpfully "cleans up" — turning a 50-LOC SD into a 400-LOC PR.

Three observed categories in the 48-hour window (2026-04-22 → 2026-04-24):
- **Drift bundling**: 2 incidents (most recently CLAUDE_CORE.md on SD-LEO-FIX-PLAN-OPUS-HARNESS-001, resolved by reset-to-origin).
- **While-I'm-here refactors**: 1 incident (SD-LEARN-FIX-ADDRESS-PAT-RETRO-003).
- **Adjacent fix**: 0 this window, but memory `feedback_branch_explicit_add_never_dot.md` documents the recurring risk.

## Scope Context

Two enforcement layers:

1. **`.husky/pre-commit` hook** — reads the active SD's `scope.in_files` / `out_files`, compares staged files, and blocks if any staged file is in `out_files` or is not covered by `in_files` (the interpretation depends on scope mode — see FR-3).
2. **`scripts/modules/scope/scope-gate.js`** — shared module that both the pre-commit hook and the existing handoff-time gates can use (avoid double-implementation).

`in_files` / `out_files` already exist in `strategic_directives_v2.metadata.scope` (per reference `scripts/modules/sd-quality-validation.js`). This SD does not add new schema — it adds enforcement at commit time.

## Functional Requirements

### FR-1 — Shared Scope Module
`scripts/modules/scope/scope-gate.js` exports:
- `loadScope(sdKey)` → `{ in_files: [...], out_files: [...], mode: 'strict' | 'advisory' }`
- `validateChange(scope, stagedFiles)` → `{ passed, violations: [...], reason }`

### FR-2 — Pre-Commit Hook
`.husky/pre-commit` (extend existing):
- Resolve active SD from `claim-guard` (same resolution used by `sd-start.js`).
- If no active SD claim: pass (commits on `main` or non-SD work aren't blocked).
- Load scope. Gather staged files via `git diff --cached --name-only`.
- Run `validateChange`. On violation: print violations, suggest `--scope-override=<SD-ID>` escape hatch, exit 1.

### FR-3 — Scope Modes
- **strict** (default for Tier 3 SDs): any staged file not in `in_files` blocks.
- **advisory** (default for Tier 1/2 QFs): print warnings but don't block.
- **out_files_only**: block only files explicitly in `out_files` (permits in_files silently + warns on others). For SDs with ambiguous scope.

Mode lives in `metadata.scope.mode`; default is `out_files_only` for backward compatibility.

### FR-4 — Escape Hatch
`--scope-override=<SD-ID>` flag on `git commit` is not directly supported, so use an env var: `SCOPE_OVERRIDE=<SD-ID> git commit ...` or `SCOPE_OVERRIDE_REASON="<ticket>" git commit ...`. The hook logs the override to an audit file `~/.claude/scope-overrides.log` for `/learn` to track.

### FR-5 — CLAUDE.md Rule
Add to CLAUDE.md: "While-I'm-here edits prohibited. Staged files outside the active SD's scope block the pre-commit hook. Log adjacent drift as a follow-up SD (or amend `scope.in_files` if the touched file is in-scope but was omitted from the SD declaration)."

### FR-6 — Regression Test
- Scope-module unit tests cover all 3 modes + escape hatch.
- Pre-commit integration test using a fixture repo.

## Technical Approach

1. Build the scope-gate module.
2. Extend `.husky/pre-commit` to call it.
3. Migration updates CLAUDE.md rule + adds `metadata.scope.mode` default to existing SDs (opt-in — pre-existing SDs stay `out_files_only`).
4. Tests.

## Scope

**in_files:**
- `scripts/modules/scope/scope-gate.js` (new)
- `.husky/pre-commit` (modified)
- `database/migrations/YYYYMMDD_opus47_module_e_scope_gate_precommit.mjs` (new)
- `tests/scope/scope-gate.test.js` (new)
- `tests/scope/pre-commit-integration.test.js` (new)

**out_files:**
- Any file outside the above.

## Acceptance Criteria

1. Pre-commit hook blocks an out-of-scope file with a clear message and the escape-hatch hint.
2. All 3 modes (strict, advisory, out_files_only) behave per spec in unit tests.
3. Escape hatch works and logs the override with reason.
4. CLAUDE.md explicitly states the rule and the escape hatch.
5. Running the new hook against the current SD-LEO-FIX-PLAN-OPUS-HARNESS-001 PR (#3313) produces zero false positives.

## Non-Goals

- Adding scope declaration to existing SDs that don't have `metadata.scope` (opt-in per SD).
- Changing how scope is declared at SD creation time (that's `leo-create-sd.js`).
- Retroactive enforcement on already-merged PRs.

## References

- Source analysis: `.claude/session-module-refactor-opus47.md` Module E
- Parent SD: SD-LEO-FIX-PLAN-OPUS-HARNESS-001 (shipped 2026-04-24)
- Memory: `feedback_scope_gate_inherits_parent_archkey.md`
- Memory: `feedback_claude_md_regen_bundles_db_drift.md`
- Memory: `feedback_branch_explicit_add_never_dot.md`

## Size Estimate

200–300 LOC across scope module + hook extension + migration + tests. Tier 3 — full SD workflow.
