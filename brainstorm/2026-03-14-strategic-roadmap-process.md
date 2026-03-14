# Brainstorm: Strategic Roadmap Process

## Metadata
- **Date**: 2026-03-14
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Chairman Review**: 1 item reviewed, 1 accepted
- **SD**: SD-MAN-INFRA-STRATEGIC-ROADMAP-PROCESS-001

---

## Problem Statement
Brainstormed ideas with vision and architecture documents either become SDs immediately or disappear. There's no "future roadmap" — no place to track planned capabilities that have been researched and designed but aren't ready for execution yet. The Vision page Pipeline tab only shows active SDs, missing the strategic planning layer.

## Discovery Summary

### Current State
- brainstorm_sessions table has 215 entries, many with vision/arch docs but no SD
- No roadmap_status field — only metadata.roadmap_status (unreliable JSONB key)
- Pipeline tab shows SDs by status — doesn't surface brainstorms without SDs
- sd_capabilities tracks delivered capabilities (empty) — no planned capabilities tracking

### Design Decisions
- **Lifecycle**: Planned → Promoted → Archived (3 states)
- **UI**: Replace Pipeline tab with unified view (Active Pipeline + Roadmap sections)
- **Cards**: Rich cards showing title, source, capabilities, vision/arch links, promote button
- **Promote**: One-click creates SD from brainstorm's vision+arch keys with pre-flight validation

## Analysis

### Arguments For
- Makes brainstormed ideas visible instead of disappearing
- One-click promote preserves full traceability (brainstorm → vision → arch → SD)
- Unified view gives chairman complete picture: active + planned
- Simple 3-state lifecycle is easy to reason about

### Arguments Against
- Replacing Pipeline tab could confuse expectations
- Promote needs pre-flight validation to avoid garbage SDs
- Dual rendering (SD cards vs roadmap cards) adds UI complexity

## Team Perspectives

### Challenger
- Blind Spots: Orphaned brainstorms during failed promotion, historical visibility, capability inference fragility
- Assumptions at Risk: roadmap_status reliability, promote idempotency, vision/arch link preservation
- Worst Case: Promotion creates garbage SDs, roadmap becomes noise

### Visionary
- Opportunities: Brainstorm-to-roadmap intelligence chain, cross-venture capability forecasting, conflict flagging
- Synergies: EVA translation-fidelity gates, chairman decision loop, retrospective closure
- Upside: Unified 90-day forecast showing active + planned + blocked

### Pragmatist
- Feasibility: 7/10
- Resources: 8-12 hours core, 3 weeks with hardening
- Constraints: Promote validation, dual rendering paths, query performance at scale
- Path: Week 1 migration + hook, Week 2 refactor PipelineTab, Week 3 hardening + feature flag

## Open Questions
- Should roadmap items be prioritized/sorted? (By crystallization score? By date?)
- Should the Promote button chain to /leo create automatically or just set status?
