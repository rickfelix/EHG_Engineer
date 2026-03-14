# Brainstorm: DB-Only Enforcement Formalization for Strategic Artifacts

## Metadata
- **Date**: 2026-03-13
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: None (infrastructure/protocol work)
- **Chairman Review**: 3 items reviewed, 3 accepted (1 scope expansion: include brainstorm/*.md)

---

## Problem Statement

The LEO protocol requires all strategic artifacts (brainstorms, vision documents, architecture plans) to live in the database as the single source of truth. However, the enforcement is purely conventional — a MEMORY.md entry and skill file notes. This has produced 110+ orphaned markdown files in `docs/plans/` and an unknown number of brainstorm files that were never registered in the DB. The `/brainstorm` skill's Step 9.5 creates intermediary markdown files that often fail to register in EVA, breaking the scoring pipeline.

Four specific gaps exist:
1. No PreToolUse hook blocks file creation in `docs/plans/` or `brainstorm/`
2. No brainstorm skill definition explicitly routes vision/arch output to DB-only
3. 110+ orphaned markdown files in `docs/plans/` need migration and cleanup
4. `archplan-command.mjs` (and `vision-command.mjs`) `extract` requires `--source` file path — no stdin/content support for DB-only workflows

## Discovery Summary

### Priority Order
1. **PreToolUse hook** — hard enforcement, prevents future violations
2. **Brainstorm skill update** — update Steps 9.5A/9.5C to generate in-memory, pass to upsert
3. **Command enhancement** — add `--content` flag to both vision-command.mjs and archplan-command.mjs
4. **Orphan cleanup** — migrate existing files to DB, archive to `docs/plans/archived/`

### Enforcement Scope (Chairman-expanded)
Three artifact types covered:
- `docs/plans/*-vision.md` → `eva_vision_documents`
- `docs/plans/*-architecture.md` → `eva_architecture_plans`
- `brainstorm/*.md` → `brainstorm_sessions.content`

### Hook Design
- Modify existing `pre-tool-enforce.cjs` (not a new hook) to avoid conflict with `database-first-enforcer.js` `.md` whitelist
- Block `Write` tool calls targeting `docs/plans/*.md` (excluding `archived/`) and `brainstorm/*.md`
- Allow `Read` and `Edit` on existing files (needed for migration)
- Distinguish new file creation from overwrites via `existsSync` check

### Key Constraint
- This is a full SD despite small LOC (2-3 hours estimated) — Chairman decision to follow standard pipeline

## Analysis

### Arguments For
- Eliminates an entire class of "orphaned file" bugs permanently — 110 files prove soft convention doesn't work
- Unifies the query surface for all strategic artifacts — one SELECT instead of file crawling + DB queries
- The hook pattern becomes a template for future governance enforcement
- Small scope with high leverage — prevents recurring cleanup work

### Arguments Against
- The existing enforcer's `.md` whitelist creates a hook ordering/conflict problem requiring careful resolution
- Skill files are instructional, not deterministic — Claude may still attempt file writes (hook is the real gate)
- Including brainstorm/*.md in enforcement requires the brainstorm skill to store full content in `brainstorm_sessions.content`, which may need a schema check (content column type/size)

### Protocol: Friction/Value/Risk Analysis

| Dimension | Score |
|-----------|-------|
| Friction Reduction | 8/10 — Every session currently risks creating orphaned files; hook eliminates this entirely |
| Value Addition | 9/10 — Unified query surface enables automated analysis, Chairman dashboards, EVA scoring |
| Risk Profile | 3/10 — Low risk: hook is additive to existing enforcer, rollback is removing 15-20 lines |
| **Decision** | **Implement** (Friction 8 + Value 9 = 17 > Risk 3 * 2 = 6) |

## Team Perspectives

### Challenger
- **Blind Spots**: (1) Existing `database-first-enforcer.js` whitelists ALL `.md` files — new hook conflicts, needs architectural resolution. (2) BOTH commands use `readFileSync`, not just archplan — scope is larger than initially assessed. (3) No consideration of brainstorm/*.md files — half-enforcement is confusing (Chairman resolved: include brainstorms).
- **Assumptions at Risk**: (1) "Allow reads/edits for migration" requires `existsSync` check to distinguish creates from overwrites — non-trivial. (2) Folding 4 concerns into one orchestrator may violate scope governance. (3) Orphaned files may have `source_file_path` DB references that break on archival.
- **Worst Case**: Modified enforcer with overly broad regex blocks legitimate markdown writes across all sessions. Or: enforcement ships before enablement (hook blocks old way before new way works).

### Visionary
- **Opportunities**: (1) Zero-drift compliance via compile-time prevention — wall, not guardrail. (2) Content pipeline unification — single query surface for all strategic artifacts. (3) Immutable audit trail with versioning, lineage tracking, quality scoring.
- **Synergies**: Enables EVA intake pipeline, Chairman review pipeline, discovery strategy scoring, codebase health scoring. Hook pattern becomes template for future governance hooks.
- **Upside Scenario**: Every strategic artifact queryable, joinable, scorable from single data layer. Chairman dashboard shows real-time strategic pipeline. Discovery strategy scoring fully automated via SQL.

### Pragmatist
- **Feasibility**: 4/10 difficulty (straightforward engineering)
- **Resource Requirements**: 2-3 hours, single developer, zero infrastructure cost
- **Constraints**: (1) Hook must distinguish creates vs overwrites. (2) Skill files are heuristic, not deterministic. (3) Orphan cleanup needs DB cross-reference first.
- **Recommended Path**: Hook first (30 min) → skill updates (30 min) → command enhancement (45 min) → orphan cleanup (60 min)

### Synthesis
- **Consensus Points**: Hook is critical first move; orphan cleanup needs DB cross-reference; both commands need content support
- **Tension Points**: SD overhead vs quick-fix (Chairman decided: full SD); hook conflict resolution approach
- **Composite Risk**: Low-Medium

## Open Questions
- What is the `brainstorm_sessions.content` column type? Is it large enough for full brainstorm markdown?
- Should `source_file_path` references in DB be updated to null/archived paths during cleanup?
- Does the enforcer modification need a feature flag or can it ship directly?

## Suggested Next Steps
- Create vision and architecture documents (proceeding now)
- Register in EVA for HEAL scoring
- Create SD with children for each enforcement gap
