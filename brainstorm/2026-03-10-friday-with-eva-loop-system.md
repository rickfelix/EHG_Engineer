# Brainstorm: Friday with EVA — Autonomous Consultant System

## Metadata
- **Date**: 2026-03-10
- **Domain**: Integration / Protocol
- **Phase**: Discovery → Ready for SD
- **Mode**: Conversational (interactive brainstorm with multiple-choice)
- **Outcome Classification**: Ready for SD
- **Related**: Autonomous Consultant Agent (2026-03-08), Unified Strategic Intelligence Pipeline (2026-03-10), Management Review Round

---

## Problem Statement
The chairman captures 400+ ideas across Todoist, YouTube, and other channels, and the LEO protocol runs dozens of SDs — but synthesis, strategic review, and improvement identification happen manually. The chairman wants a single weekly touchpoint (Friday 9am with EVA) where all intelligence has been pre-gathered, analyzed, and structured for interactive decision-making.

## Core Insight: Separation of Concerns
- **Consultant Agent** = background worker (runs Monday, deposits findings into DB)
- **EVA** = the chairman's interface (presents findings Friday, captures decisions, executes)
- **The chairman talks to EVA, not the consultant.** The consultant feeds EVA.

## Design Decisions (from brainstorm)

### 1. Consultant Agent: Internal Strategic Auditor (not external signal processor)
**Pivot from original consultant agent brainstorm**: The consultant does NOT process Todoist/YouTube (that's handled by `/distill` on Fridays). Instead, it analyzes:

- **Retrospective mining** — recurring themes across completed SD retrospectives (strong signals only)
- **Gate calibration intelligence** — gate pass/fail rates over time, threshold adjustment suggestions
- **Capability delivery tracking** — what SDs completed, what capabilities were registered, gap analysis
- **Venture stage readiness** — proactively check if ventures have artifacts needed for next stage gate
- **Protocol health** — LEO protocol efficiency, bottleneck identification
- **Cross-venture capability reuse** — detect when ventures build similar things independently
- **Drift detection** — compare active SDs against stated OKRs/strategy

### 2. Tiered Confidence System
- **High confidence** → surfaced to EVA for Friday meeting
- **Medium confidence** → banked silently in DB
- **Graduation rule**: Medium findings that persist for 2+ weeks → auto-graduate to high
- **No noise**: Don't surface anything without 3+ data points. One gate failure isn't a pattern.

### 3. External Research (v2, architected in v1)
- Market/industry research for venture spaces
- Competitor intelligence
- Technology trends
- All feed into forecast models used by Stage 0
- Start with highest signal-to-noise source first
- Same tiered confidence system applies

### 4. Cadence: Monday (EVA Master Scheduler, not `/loop`)
- **Decision**: Use `EvaMasterScheduler.registerRound()` — same pattern as management review round
- NOT `/loop` (session-scoped, dies when terminal closes)
- Registered as a proper cron job in the scheduler, restarted via `/restart`
- One deep analysis pass on Monday
- Has full prior week's execution data
- Findings sit for 4 days (aging/graduation)
- By Friday, only strong signals remain
- `/restart` integration: when LEO stack restarts, the scheduler (and all registered rounds including consultant) come back up automatically

### 5. Friday 9am Meeting: Structured Agenda + Interactive Delivery
EVA walks through each section, pauses for chairman's input on each item:

1. **Performance Review** — baseline vs actual, OKR progress, pipeline health
2. **Capability Report** — what was delivered this week, what gaps remain
3. **Consultant Findings** — high-confidence recommendations only, grouped by domain (protocol / app / ventures)
4. **Intake Review** — `/distill` output from Todoist + YouTube
5. **Decisions** — chairman accepts/dismisses each item, EVA captures responses

### 6. Post-Meeting: EVA Acts Immediately
- No approval queue, no second pass
- Creates SDs from accepted recommendations
- Updates baselines
- Adjusts gate thresholds
- Whatever the chairman decided, EVA executes

## Architecture

```
Monday (via EvaMasterScheduler cron round):
  Consultant Agent
    → Reads: retrospectives, gate logs, capability graph, venture state, protocol metrics
    → Analyzes: patterns, drift, readiness gaps, reuse opportunities
    → Writes: eva_consultant_recommendations (with confidence_score, tier)
    → Graduates: 2+ week medium findings → high

Friday 9am (chairman sits down with EVA):
  /distill → Todoist + YouTube intake processing
  Management Review → baseline vs actual, OKRs, pipeline health
  EVA reads consultant findings (high-confidence only)
  EVA presents structured agenda interactively
  Chairman decides on each item
  EVA acts immediately on all decisions

v2 (external research):
  Monday consultant pass also runs external research
    → Market data, competitor intel, tech trends
    → Feeds forecast models (used by Stage 0)
    → Same tiered confidence system
```

## v1 Scope
- **In scope**: Internal consultant + Friday meeting format + immediate action execution
- **Architected but deferred**: External research, forecast model integration
- **Already exists**: Management review round (`management-review-round.mjs`), `/distill`, Todoist sync, YouTube sync, capability graph, retrospective system, gate logging

## Relation to Existing Brainstorms
- **Autonomous Consultant Agent (2026-03-08)**: v1 pivots from external signal processing to internal strategic auditing. External research moves to v2.
- **Unified Strategic Intelligence Pipeline (2026-03-10)**: The Friday meeting IS the management review described in subsystem #9. The consultant agent provides the intelligence layer that feeds it.

## Open Questions
- What DB tables does the consultant write to? Extend `eva_consultant_recommendations` or new table?
- How does the meeting format integrate with the EHG app? CLI-only for v1, or app-based?
- What's the minimum retrospective/gate data needed before the consultant produces useful output?
- ~~Should the Monday `/loop` run as a Claude Code session or a standalone script?~~ **Resolved**: EVA Master Scheduler round, restarted via `/restart`

## Suggested Next Steps
1. Create SD(s) from this brainstorm — likely an orchestrator with children
2. Phase 1: Consultant agent (Monday analysis pass) + DB schema
3. Phase 2: Friday meeting format (EVA agenda + interactive walkthrough)
4. Phase 3: Post-meeting action execution
5. Phase 4: External research integration (v2)
