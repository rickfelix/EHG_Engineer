# AGENTS.md — Codex Bridge to CLAUDE.md

## Canonical Source
- **Single source of truth** for governance, roles, gates, and handoffs is **`CLAUDE.md`** (and `CLAUDE-LEO.md` if present).
- When in doubt, **open and read `CLAUDE.md`** and follow its instructions exactly.

## Model Roles (Separation of Concerns)
- **Claude Code** = Reviewer/Enforcer (agentic + security reviews, gate checks, pass/warn/fail, PR blocking).
- **OpenAI Codex (this session)** = **Builder/Refactorer**:
  - Propose code edits and migrations aligned to the PRD/LEO rules.
  - Never bypass validation; all changes go through PR and gates.

## Operating Mode for Codex
- **Default**: Read-only / ask-before-acting.
- **Edits**: Provide unified diffs (`git` patches) or inline file rewrites; do **not** run commands unless explicitly approved.
- **Scope Control**:
  - Stay within the current repo and task.
  - No network or external writes.
  - Do not modify CI/CD secrets or workflow protections.

### Dual-Lane SOP Reference
- Codex MUST follow `docs/dual-lane-SOP.md` alongside `CLAUDE.md`; these are the authoritative sources for dual-lane execution.
- Builder lane work **stops** at `[CODEX-READY]` handoffs; enforcement, PR creation, and any database interactions remain Claude/EXEC-only responsibilities.
- PLAN Supervisor retains sole authority to issue the ≥85% PASS verdict required for merge; Codex cannot bypass, duplicate, or interpret that gate.

## Required Pre-Work Before Any Edit
1. **Load rules**: read `CLAUDE.md` (+ `CLAUDE-LEO.md` if present).
2. **Identify target**: PRD requirement or issue link; list files to touch.
3. **Risk note**: call out security/DB/RLS implications.
4. **Plan**: ordered steps, plus a rollback note.

## Output Format
- **Plan**: numbered steps (what/why).
- **Patch**: unified diff per file (minimal, reversible).
- **Tests**: unit/e2e additions or updates if applicable.
- **Docs**: update any changed README/PRD snippets.

## Handoffs & Gates (Summarized)
- Quality gate ≥ 85% equals the PLAN Supervisor PASS confidence threshold (`CLAUDE.md`).
- All merges wait for Claude’s PLAN Supervisor workflow to record a PASS verdict before proceeding.

## Quick Commands (for you, the operator)
- Ask Codex: “Summarize key rules from `CLAUDE.md` relevant to this task.”
- Ask Codex: “Generate diffs only; do not run commands without approval.”
- After codex proposes patches: open PR → let Claude reviews/gates run.

> Note: If `CLAUDE.md` and this file ever disagree, **`CLAUDE.md` wins.**

---
**Sync note:** If gate names or thresholds change in `CLAUDE.md`, update this file in the same PR.
**Source of truth:** `CLAUDE.md` governs; this file never introduces new gates or names.

## Dual-Lane Workflow Implementation

### Lane Boundaries (Enforced)
- **Codex Lane**: Read-only DB access, generates patches, uses `.env.codex`
- **Claude Lane**: Write-enabled, applies patches, enforces gates, uses `.env.claude`

### Required Handoff Elements
1. Merge base SHA
2. Unified diff (`changes.patch`)
3. SLSA attestation (in-toto v1.0, predicate v0.2)
4. SBOM (CycloneDX 1.5)
5. Commit marker: `[CODEX-READY]` → `[CLAUDE-APPLIED]`

### Gate Enforcement
All changes must pass PLAN Supervisor verification (≥85% confidence) before merge.
