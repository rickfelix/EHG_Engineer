<!-- Archived from: .claude/plans/2026-05-27-migration-code-override-sweep.md -->
<!-- SD Key: SD-LEO-INFRA-AUDIT-MIGRATION-SET-001 -->
<!-- Archived at: 2026-05-27T23:43:00.572Z -->

# Plan: Audit migration SET DEFAULT vs code overrides

## Priority
medium

## Type
infrastructure

## Goal

Produce an audit deliverable scanning every `ALTER COLUMN ... SET DEFAULT` and `CREATE TABLE ... DEFAULT` migration in `database/migrations/` against code literals that would override the new default at insert time. The recurring pattern (proven by F12 from SD-LEO-INFRA-AUTO-STORY-QUALITY-GATE-001): a migration sets `user_stories.status DEFAULT 'draft'` to make auto-generated boilerplate invisible to the quality gate, but a second writer at `lib/sub-agents/modules/stories/execute.js:296` hardcodes `status: 'ready'` and the migration's intent is silently negated.

For each `SET DEFAULT` migration:
1. Identify table.column and the new default value.
2. Grep production code (exclude archive/, tests/) for object-literal writes to that column: `{ ..., status: 'X', ... }`, `INSERT INTO table (status) VALUES (...)`, sequelize/supabase calls with the column.
3. Classify each found writer: (a) honors the new default (omits the column from insert, or sets the same value), (b) overrides the new default (sets a different literal), (c) ambiguous (computed value — review case-by-case).
4. For overrides: distinguish (i) intentional override (justified by code comment or call-site context) from (ii) drift-bug like F12 (the override was historical, predates the migration, nobody updated it).

Deliverable: per-migration override report. Chairman triages. Fixes filed as follow-up QFs.

## Steps

- [ ] LEAD: 8-question strategic gate; scope (audit-only Tier 2)
- [ ] LEAD: invoke validation-agent, risk-agent (read-only, low risk)
- [ ] LEAD-TO-PLAN: handoff via handoff.js execute
- [ ] PLAN: write PRD; FR-1 migration enumeration, FR-2 code override detection, FR-3 classification rubric, FR-4 report deliverable
- [ ] PLAN-TO-EXEC: handoff via handoff.js execute
- [ ] EXEC: write `scripts/one-off/_audit-migration-set-default.mjs` — globs database/migrations/, extracts (table, column, default_value) tuples
- [ ] EXEC: write `scripts/one-off/_audit-code-overrides.mjs` — for each tuple, greps code for matching object-literal/INSERT/upsert patterns; produces overrides JSON
- [ ] EXEC: write `scripts/one-off/_render-migration-override-report.mjs` — consumes JSON, produces `docs/audits/sd-leo-infra-migration-code-override-sweep-001.md`
- [ ] EXEC: chairman review of audit report (PAUSE POINT)
- [ ] EXEC: file follow-up QFs for high-priority drift-bug overrides (the F12-shaped ones)
- [ ] EXEC-TO-PLAN: handoff via handoff.js execute
- [ ] PLAN-TO-LEAD: handoff via handoff.js execute
- [ ] LEAD-FINAL-APPROVAL: handoff via handoff.js execute
- [ ] PR: create + auto-merge

## Acceptance

- `docs/audits/sd-leo-infra-migration-code-override-sweep-001.md` exists with per-migration table: migration file, table.column, new default, override sites (file:line + classification)
- All `SET DEFAULT` migrations in `database/migrations/` accounted for (no audit gaps)
- ≥1 follow-up QF filed for drift-bug overrides (or chairman documents "no F12-shaped drift found" as acceptable outcome)

## Scope

+ scripts/one-off/_audit-migration-set-default.mjs — migration enumerator
+ scripts/one-off/_audit-code-overrides.mjs — code override detector
+ scripts/one-off/_render-migration-override-report.mjs — report renderer
+ docs/audits/sd-leo-infra-migration-code-override-sweep-001.md — deliverable
+ docs/audits/sd-leo-infra-migration-code-override-sweep-001-raw.json — intermediate (gitignored)

## Risks

- Code-override detection may have false positives (the literal `status: 'ready'` in a comment, in a string, in a test). Mitigation: tooling filters out comments and string content via simple heuristics; chairman triages remaining classifications.
- Some overrides will be intentional (e.g., admin-set status for a specific workflow). Mitigation: classification rubric explicitly includes "intentional override" category; chairman validates per-case.
- Tooling may need to evolve per-DB-flavor (Postgres `DEFAULT` syntax vs other migrations). Mitigation: scope to Postgres-only for v1; document limitation.

## Target Application
EHG_Engineer

## Origin
- F12 pattern from SD-LEO-INFRA-AUTO-STORY-QUALITY-GATE-001 (PR #4019) + QF-20260527-530 (second-writer fix): the canonical example of "migration set default, code literal negated it." This audit catches every other instance of the same shape.
- Campaign brief from chairman 2026-05-27
