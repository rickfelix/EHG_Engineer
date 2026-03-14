# Brainstorm: EVA Updates — Persistent Weekly Meeting Log

## Metadata
- **Date**: 2026-03-13
- **Domain**: Protocol
- **Phase**: Discovery
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: None (cross-cutting protocol infrastructure)

---

## Problem Statement
The Friday meeting with EVA gathers structured data across 5 sections (performance review, capability report, consultant findings, intake review, chairman decisions) but nothing is persisted. After each meeting, the data evaporates. There is no historical record, no way to compare week-over-week trends, and no institutional memory of what was discussed or decided. The `/coordinator` command also produces valuable operational telemetry (fleet velocity, ETAs, claim activity) that should roll up into the weekly record.

## Discovery Summary

### Friction Point
The Friday meeting script (`friday-meeting.mjs`) already produces structured JSON output with `meeting_date`, `sections`, and `decisions` counts. The data is well-structured — it just isn't saved. If the chairman wants to look back at what was accomplished 4 weeks ago, there's nothing to query.

### Desired State
A persistent "EVA Updates" system that:
1. Logs each Friday meeting snapshot to a database table
2. Includes coordinator operational rollup (fleet velocity, ETAs, claim activity)
3. Generates a weekly digest artifact
4. Supports queryable historical trend analysis

### Scope
- **Friday meetings only** — not Monday consultant rounds or mid-week pipeline runs
- **Database + weekly digest** — queryable log with a generated summary artifact
- **Coordinator rollup** — `/coordinator` fleet data feeds into the meeting record at a high level

## Analysis

### Arguments For
- The data already exists in structured form — we're just not saving it
- Creates institutional memory of chairman decisions and their context
- Enables week-over-week trend analysis (velocity, intake patterns, decision themes)
- `/coordinator` operational data enriches the digest beyond what the meeting script alone captures
- Foundation for future AI-assisted meeting prep ("last 4 weeks show infrastructure SDs dominating — consider rebalancing")
- Pragmatist assessment: 2/10 implementation difficulty, ~2-3 hours

### Arguments Against
- Risk of silent staleness if the persist step isn't wired into the mandatory path
- The digest artifact needs a clear consumer or it becomes write-only data
- Scope creep risk: "EVA Updates" could expand to absorb every EVA interaction

### Friction/Value/Risk Analysis

| Dimension | Score | Detail |
|-----------|-------|--------|
| Friction Reduction | 7/10 | No way to review past meetings; chairman relies on memory |
| Value Addition | 9/10 | Queryable history, trend detection, AI-assisted prep |
| Risk Profile | 2/10 | Purely additive, no breaking changes |
| **Decision** | **Implement** | (7+9)=16 > (2×2)=4 |

## Team Perspectives

### Challenger
- **Blind Spots**: Digest needs a defined consumer or it rots; `eva_consultant_recommendations` already coupled to meeting context via timestamps; Friday-as-a-day isn't enforced anywhere in code
- **Assumptions at Risk**: Meeting script emits structured output but logging step could be skipped in different session windows; "Friday only" is a human convention that drifts
- **Worst Case**: Log populated for 2-3 weeks then silently goes stale with no downstream pressure to keep it current

### Visionary
- **Opportunities**: Longitudinal protocol intelligence after 8-12 weeks; chairman decision registry (captures *why* not just *what*); automated weekly digest as first-class artifact
- **Synergies**: Feeds Skunkworks go/no-go tracking, gate evaluation architecture (real data for dormant triggers), adaptive discovery strategy, experimentation baselines
- **Upside Scenario**: After 24+ weeks, Friday meeting transforms from sync to steering event with AI-generated draft decisions based on historical patterns

### Pragmatist
- **Feasibility**: 2/10 difficulty
- **Resource Requirements**: 2-3 hours, one migration + ~30 lines JS, no new dependencies
- **Constraints**: Idempotency on re-runs (ON CONFLICT by meeting_date); decisions collected async (persist after decision loop); JSONB sections column for forward compatibility
- **Recommended Path**: Single migration for `eva_friday_meeting_logs`, add `persistMeetingLog()` helper to friday-meeting.mjs

### Synthesis
- **Consensus Points**: Data is already structured and ready — purely a persistence gap
- **Tension Points**: Silent staleness risk vs. longitudinal intelligence vision — resolution is making log mandatory in workflow
- **Composite Risk**: Low

## Out of Scope
- Monday consultant rounds (already have their own persistence via `eva_consultant_recommendations`)
- Mid-week pipeline runs or ad-hoc EVA interactions
- Full app UI for viewing meeting history (database + digest only for now)
- AI-assisted meeting prep (future enhancement after sufficient historical data accumulates)

## Open Questions
- Should the digest artifact be a markdown file, a database column, or both?
- How should `/coordinator` data be structured within the meeting log (separate JSONB field vs. nested in sections)?
- Should the table be named `eva_updates` (matching the branding) or `eva_friday_meeting_logs` (matching the technical function)?

## Suggested Next Steps
- Create SD via vision/architecture pipeline
- Table naming should reflect "EVA Updates" branding
- Wire persist call into `friday-meeting.mjs` as mandatory (not optional) step
- Add coordinator rollup query to the Friday meeting data gathering phase
