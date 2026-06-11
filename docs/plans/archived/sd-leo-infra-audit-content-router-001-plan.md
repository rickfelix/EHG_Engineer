<!-- Archived from: .claude/plans/2026-05-27-audit-router-db-drift.md -->
<!-- SD Key: SD-LEO-INFRA-AUDIT-CONTENT-ROUTER-001 -->
<!-- Archived at: 2026-05-27T23:42:47.474Z -->

# Plan: Audit DB content vs router hardcodes drift in CLAUDE.md generator

## Priority
medium

## Type
infrastructure

## Goal

Produce an audit deliverable comparing `leo_protocol_sections` DB content against hardcoded condensed twins in `scripts/modules/claude-md-generator/file-generators.js`. CLAUDE.md is auto-generated from the DB, but several sections have a "removed from generator output, summarized inline by the router" pattern — the hardcoded twin must accurately summarize the DB version, not contradict it.

`scripts/section-file-mapping.json` already enumerates `_removed_sections_note` keys for sections excluded from the standard generator output. For each such section, the router/generator inserts an inline summary. The risk: when the DB content changes (someone updates `leo_protocol_sections` row), the hardcoded summary in `file-generators.js` does not auto-update. Over time, the inline summary drifts from being a faithful condensation to being a stale fragment that conflicts with the DB-source row.

The audit must:
1. Read `_removed_sections_note` keys from `scripts/section-file-mapping.json`.
2. For each removed section, find the hardcoded twin in `scripts/modules/claude-md-generator/file-generators.js`.
3. Read the corresponding `leo_protocol_sections` row from the DB.
4. For each pair (router-twin, DB-content): classify as (a) faithful summary, (b) summarizes but missing important content, (c) contradicts DB, (d) DB row missing entirely, (e) twin missing entirely.
5. Report findings; chairman triages priority. Fixes are filed as follow-up QFs.

## Steps

- [ ] LEAD: 8-question strategic gate; scope (audit-only Tier 2)
- [ ] LEAD: invoke validation-agent, risk-agent (read-only, low risk)
- [ ] LEAD-TO-PLAN: handoff via handoff.js execute
- [ ] PLAN: write PRD; FR-1 enumeration tooling, FR-2 comparison rubric (faithful/missing/contradicts/missing-pair), FR-3 audit report deliverable
- [ ] PLAN-TO-EXEC: handoff via handoff.js execute
- [ ] EXEC: write `scripts/one-off/_audit-router-db-drift.mjs` — reads section-file-mapping.json, file-generators.js, queries leo_protocol_sections; produces pair-by-pair report
- [ ] EXEC: chairman review of audit report (PAUSE POINT)
- [ ] EXEC: file follow-up QFs for high-priority drift cases (contradictions first, missing-pairs second)
- [ ] EXEC-TO-PLAN: handoff via handoff.js execute
- [ ] PLAN-TO-LEAD: handoff via handoff.js execute
- [ ] LEAD-FINAL-APPROVAL: handoff via handoff.js execute
- [ ] PR: create + auto-merge

## Acceptance

- `docs/audits/sd-leo-infra-audit-router-db-drift-001.md` exists with pair-by-pair table: section key, router-twin location:line, DB row id, classification, recommended action
- All `_removed_sections_note` entries in section-file-mapping.json are accounted for (no audit gaps)
- ≥1 follow-up QF filed (or chairman documents "all twins faithful" as acceptable outcome)

## Scope

+ scripts/one-off/_audit-router-db-drift.mjs — audit tooling
+ docs/audits/sd-leo-infra-audit-router-db-drift-001.md — deliverable

## Risks

- Comparison rubric (faithful vs contradicts) may require LLM evaluation rather than pure-string-match. Mitigation: rubric is human-readable; chairman reviews the LLM judgment if used.
- Some hardcoded twins may pre-date the DB row and represent the original source-of-truth. Mitigation: report flags creation timestamps; chairman decides which is canonical per-pair.

## Target Application
EHG_Engineer

## Origin
- Pattern surfaced during SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001 (PR #4021) — the new "Orchestrator Parent Lifecycle" content went into leo_protocol_sections id=439 with a 4-line inline twin in CLAUDE.md SD Continuation Truth Table. Process worked correctly there; this audit checks whether prior _removed_sections_note entries still hold.
- Campaign brief from chairman 2026-05-27
