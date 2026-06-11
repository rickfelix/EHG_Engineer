---
category: architecture
status: approved
version: 1.0.0
author: LEO Protocol
last_updated: 2026-06-10
tags: [adr, architecture, decisions, index]
---

# Architecture Decision Records — Index

All ADRs for EHG_Engineer. Numbered ADRs live in this directory; one venture-factory ADR
predates the numbering scheme and lives in `01_architecture/`.

> Created by SD-MAN-DOC-DOC-HYGIENE-SWEEP-001 (the ADRs were previously unindexed orphans).

| ADR | Title | Status | Decision (one line) |
|---|---|---|---|
| [0001](0001-canonical-pause-five-point.md) | Canonical Pause is a five-point set | accepted | The only legitimate reasons to stop are the five enumerated pause points; everything else continues under AUTO-PROCEED. |
| [0002](0002-auto-proceed-default-on.md) | AUTO-PROCEED is ON by default | accepted | Phase transitions execute automatically; confirmation prompts are the exception, not the rule. |
| [0003](0003-database-first-no-markdown-source.md) | Database is the single source of truth | accepted | Strategic state lives in DB tables; markdown files are documentation, never source-of-truth. |
| [0004](0004-handoff-js-canonical-writer-no-bypass.md) | handoff.js is the canonical writer for phase transitions | accepted | All phase state flows through handoff.js's gate pipeline; bypasses are documented, rate-limited emergencies. |
| [0005](0005-mode-declaration-product-vs-campaign.md) | Sessions declare product mode vs campaign mode | accepted | A literal mode switch governs whether harness bugs are fixed inline (campaign) or deferred (product). |
| [0006](0006-pretooluse-pivot-additional-context-not-posttooluse.md) | Hook injection uses PreToolUse additionalContext | accepted | Context injection happens before tool execution via PreToolUse, not after via PostToolUse. |
| [0007](0007-goal-advisory-only-binding-rejected.md) | /goal is advisory-only | accepted | Goals inform prioritization but never bind execution; binding goal enforcement was rejected. |
| [0008](0008-scope-completion-contract-approach.md) | Scope completion is verified by contract | accepted | Completion is checked against an explicit deliverables contract, not heuristic text matching. |
| [0009](0009-lineage-fix-prerequisite-to-instrumentation.md) | Lineage fix is prerequisite to deeper instrumentation | accepted | Fix data lineage before adding instrumentation that would inherit the broken lineage. |
| [0010](0010-sibling-orchestrator-pattern-additive-over-merge.md) | Sibling orchestrators preferred over merge | accepted | New program layers add sibling orchestrators rather than merging into existing ones. |
| [0011](0011-adversarial-subagent-grilling-replaces-interactive-human.md) | Adversarial sub-agent grilling replaces interactive human grilling | accepted | Plan critique is performed by adversarial sub-agents instead of pausing for human interrogation. |
| [0012](0012-progressive-disclosure-skill-body-discipline.md) | Skill bodies follow progressive disclosure | accepted | Skill bodies stay at median 30-100 LOC with detail pushed to supporting docs. |
| [STAGE0-INTAKE-001](adr-stage0-intake-001.md) | Canonical Stage 0 Opportunity-Intake Spine | accepted (ratified 2026-05-24) | One canonical intake spine feeds Stage 0 opportunity sourcing; ad-hoc intake paths are retired. |
| [002 (legacy)](../01_architecture/adr-002-venture-factory-architecture.md) | Venture Factory Architecture | superseded — see banner in doc | Single platform hosts multiple ventures (one codebase, per-venture data); superseded per the in-doc supersession banner. |

## Conventions

- New ADRs take the next `00NN-kebab-title.md` number in this directory.
- Statuses: `proposed` → `accepted` → (`superseded` | `deprecated`), recorded in the `Status:` line of each ADR.
- Keep one decision per ADR; link related ADRs rather than amending old ones.
