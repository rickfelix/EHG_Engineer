<!-- Archived from: .claude/plans/2026-05-27-audit-orphan-flags.md -->
<!-- SD Key: SD-LEO-INFRA-AUDIT-METADATA-ORPHAN-001 -->
<!-- Archived at: 2026-05-27T23:42:35.682Z -->

# Plan: Audit metadata.is_* orphan flags — writers without readers

## Priority
medium

## Type
infrastructure

## Goal

Produce an audit deliverable enumerating every `metadata.is_*` boolean flag write across the EHG_Engineer codebase, paired with its corresponding read sites. Flag every write that has no matching read ("orphan flags") and every read that has no matching write ("phantom flags"). The deliverable is the audit report; fixes are filed as follow-up QFs from the report.

**Why this matters.** `metadata.is_parent`, `metadata.is_orchestrator`, `metadata.is_venture`, `metadata.is_parent_orchestrator`, etc. are scattered across SD creation paths. Whenever a writer adds a new flag without coordinating with all readers, that flag becomes dead state: it costs DB write cycles, confuses future readers ("does this flag mean something?"), and creates the illusion of safety where none exists. The recurring writer-consumer asymmetry pattern (28+ witnesses per memory `project_brainstorm_unify_vision_pipeline_4_child_plan_2026_05_26`) is exactly this shape but at coarser granularity.

The audit must:
1. Enumerate all `metadata.is_*` (and `metadata.*_flag`, `metadata.*_enabled`) write sites — `INSERT`/`UPDATE`/object-literal assignments.
2. Enumerate all corresponding read sites — `metadata?.is_*`, destructuring, JSON path access.
3. Match writers to readers; report orphans (write-no-read) and phantoms (read-no-write).
4. For each orphan flag, propose disposition: (a) remove the writer if dead, (b) add a reader if the flag was meant to influence behavior, (c) document the flag in a known-ignored list if intentional (e.g., audit-only metadata).

## Steps

- [ ] LEAD: 8-question strategic gate; scope (audit-only Tier 2)
- [ ] LEAD: invoke validation-agent, risk-agent (audit is read-only, low risk)
- [ ] LEAD-TO-PLAN: handoff via handoff.js execute
- [ ] PLAN: write PRD; FR-1 audit tooling, FR-2 audit report deliverable, FR-3 follow-up QF list
- [ ] PLAN-TO-EXEC: handoff via handoff.js execute
- [ ] EXEC: write `scripts/one-off/_audit-metadata-orphan-flags.mjs` — globs JS/MJS/CJS in production code (exclude archive/, tests/), greps for write patterns and read patterns, produces JSON intermediate
- [ ] EXEC: write `scripts/one-off/_render-orphan-flag-report.mjs` — consumes JSON, produces `docs/audits/sd-leo-infra-audit-orphan-flags-001.md` with: write site table, read site table, orphan list, phantom list
- [ ] EXEC: chairman review of audit report (PAUSE POINT per campaign brief)
- [ ] EXEC: file follow-up QFs from chairman-prioritized orphan/phantom list
- [ ] EXEC-TO-PLAN: handoff via handoff.js execute (audit deliverable is the evidence)
- [ ] PLAN-TO-LEAD: handoff via handoff.js execute
- [ ] LEAD-FINAL-APPROVAL: handoff via handoff.js execute
- [ ] PR: create + auto-merge (small — audit tooling + report only)

## Acceptance

- `docs/audits/sd-leo-infra-audit-orphan-flags-001.md` exists with: ≥20 flag writers enumerated; ≥10 corresponding readers enumerated; orphan list (writers without readers); phantom list (readers without writers); per-flag disposition recommendation
- ≥3 follow-up QFs filed for high-priority orphan/phantom cleanup
- Audit tooling is re-runnable (`node scripts/one-off/_audit-metadata-orphan-flags.mjs`) and produces consistent results

## Scope

+ scripts/one-off/_audit-metadata-orphan-flags.mjs — audit grepper
+ scripts/one-off/_render-orphan-flag-report.mjs — report renderer
+ docs/audits/sd-leo-infra-audit-orphan-flags-001.md — deliverable
+ docs/audits/sd-leo-infra-audit-orphan-flags-001-raw.json — intermediate (gitignored)

## Risks

- Audit may produce a list too long to act on. Mitigation: chairman triages and approves disposition; only highest-value orphans are fixed via follow-up QFs.
- Audit may miss flags hidden in dynamically-keyed access (`metadata[someVar]`). Mitigation: report scope limitation explicitly; future SD can extend with AST-level analysis if needed.

## Target Application
EHG_Engineer

## Origin
- Pattern surfaced repeatedly across SDs (writer-consumer asymmetry, 28+ witnesses per memory `project_brainstorm_unify_vision_pipeline_4_child_plan_2026_05_26`)
- Companion SD to SD-LEO-INFRA-CONSOLIDATE-DUAL-DETECTION-001 (which fixes the most visible 3 clusters; this audit catches the long-tail)
- Campaign brief from chairman 2026-05-27
