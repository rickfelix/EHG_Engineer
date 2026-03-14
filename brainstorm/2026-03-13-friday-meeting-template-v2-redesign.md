# Brainstorm: Friday Meeting Template v2 Redesign

## Metadata
- **Date**: 2026-03-13
- **Domain**: Protocol / EVA Meeting System
- **Phase**: Discovery → Ready for SD
- **Mode**: Interactive brainstorm with chairman (8 design decisions)
- **Outcome Classification**: Ready for SD
- **Related**: Friday with EVA Loop System (2026-03-10), SD-MAN-ORCH-FRIDAY-EVA-AUTONOMOUS-001-B (current implementation)

---

## Problem Statement
The current Friday meeting template (v1, 6 sections) has several gaps identified during the 2026-03-13 meeting:
1. **Performance section is dead** — `management_reviews` table has 0 rows, section always shows "No data"
2. **Capability report dumps all 166 SDs** — no ranking, no highlights, no planned-vs-actual comparison
3. **Consultant findings invisible** — 42 findings banked at medium confidence, none graduated to high, so section shows "nothing this week"
4. **R&D scoring broken** — all 5 proposals have identical priority (64/100), no differentiation
5. **No /distill integration** — despite brainstorm doc saying intake should include Todoist/YouTube
6. **No week-over-week comparison** — no deltas from last meeting
7. **No action item carryover** — decisions from prior meetings not tracked forward
8. **Priority scores are raw numbers** — "64" means nothing to the chairman

## Design Decisions (from interactive brainstorm)

### 1. Overall Structure: 8-Section Deep
**Decision**: Expand from 6 to 8 sections with a pre-meeting phase. Executive briefing style with time estimates per section (~12 min total meeting).

### 2. Pre-Meeting Phase: Chairman-Prompted
**Decision**: Before the meeting agenda begins, ask the chairman:
- Run `/distill` (Todoist + YouTube intake)?
- Check consultant analysis status (verify Monday run)?
- Refresh baseline numbers?
- Skip — go straight to meeting?

If distill selected → run full distill pipeline, then return to meeting. If consultant check → verify Monday run happened, offer to trigger if missed. If baseline refresh → update sd_baseline_items counts. Multiple selections allowed.

### 3. Section 1 — PULSE CHECK: Friday-to-Friday Snapshots
**Decision**: Use Friday-to-Friday snapshot comparison, not rolling 7-day windows.
- Compare this meeting's data to last meeting's persisted snapshot in `eva_updates`
- Exact weekly comparison tied to actual meetings
- Metrics: fleet velocity (delta), baseline % (delta), pipeline counts, gate health pass rate

### 4. Section 2 — WINS & CAPABILITIES: LLM-Ranked Significance
**Decision**: Send full capability list to LLM with portfolio context, ask it to rank top 5 by strategic impact.
- Each capability shows: name, category, component count
- Footer: total capabilities + total SDs completed
- **NEW**: Planned vs actual capability tracking — what baseline expected vs what actually shipped

### 5. Section 3 — STRATEGIC ALIGNMENT: Tags + LLM Gap-Fill
**Decision**: Hybrid approach — use tag-based SD→OKR mapping where it exists, LLM fills in for untagged SDs by inferring which OKR they likely serve. Flags true orphans as drift alerts.

### 6. Section 4 — INTELLIGENCE BRIEFING: Full Intelligence Picture
**Decision**: All three approaches combined:
- LLM clusters the 42+ findings into 3-5 themes with summary paragraph per theme
- Graduation countdown showing findings approaching the 2-week mark
- Top individual findings by priority
- **5-tier priority labels** (not numeric scores): Critical / High / Medium / Low / Informational

### 7. Section 5 — INTAKE & DISTILL: Pre-Meeting Results
**Decision**: Display results from the pre-meeting distill phase (if ran). Also show new intake items pending triage and carryover (deferred items from last meeting).

### 8. Section 6 — R&D LAB: Rubric-Based Scoring with Human Labels
**Decision**: Replace flat numeric scoring with a multi-factor rubric, mapped to 5-tier human-readable labels.
- Chairman feedback: "A number doesn't mean anything to me. I need Critical/High/Medium/Low/Informational."
- Scoring rubric: novelty (0-25) + strategic fit (0-25) + feasibility (0-25) + portfolio gap (0-25) = 0-100
- Mapped to tiers: Critical=90-100, High=70-89, Medium=40-69, Low=20-39, Informational=0-19
- This tier system standardizes across: R&D proposals, consultant findings, intake items

### 9. Section 7 — BLOCKERS & RISKS: Planned vs Actual Capabilities
**Decision**: Chairman's key insight — "I want to see what capabilities we planned to implement for the week, then measure against: did we actually implement those?"
- Planned vs actual capability gaps (what was expected but NOT delivered)
- Blocked SDs with reason
- Gate failure trends (3+ failures on same gate = systemic issue)
- Overdue SDs vs baseline ETA

### 10. Section 8 — DECISIONS & ACTIONS: DB-Tracked Actions
**Decision**: New `meeting_actions` table to track action items across meetings.
- Schema: id, meeting_date, action_text, assignee, status (open/done/carried), due_date, resolved_at
- Prior meeting actions shown at start: done/carried/overdue
- New decision items presented interactively (accept/dismiss/defer)
- Accepted decisions → create SDs or update status immediately

## New Infrastructure Required

### Database Changes
1. **`meeting_actions` table** (new)
   - `id` UUID PK
   - `meeting_date` DATE FK → eva_updates
   - `action_text` TEXT NOT NULL
   - `assignee` TEXT DEFAULT 'eva'
   - `status` TEXT CHECK (open, done, carried, overdue)
   - `due_date` DATE
   - `resolved_at` TIMESTAMPTZ
   - `created_sd_key` TEXT (if decision created an SD)
   - `created_at` TIMESTAMPTZ DEFAULT NOW()

2. **Priority tier standardization**
   - Add `priority_tier` column to: `rd_proposals`, `eva_consultant_recommendations`, `eva_intake_queue`
   - Computed from `priority_score`: Critical=90-100, High=70-89, Medium=40-69, Low=20-39, Info=0-19
   - Display tier label in all UIs, store numeric score for sorting

3. **R&D scoring rubric columns** on `rd_proposals`
   - `score_novelty` INT (0-25)
   - `score_strategic_fit` INT (0-25)
   - `score_feasibility` INT (0-25)
   - `score_portfolio_gap` INT (0-25)
   - `priority_score` = sum of above (already exists, now computed)

4. **Planned capabilities per baseline period**
   - Extend `sd_baseline_items` or create mapping table
   - Track which capabilities were expected for each baseline period

5. **eva_updates snapshot expansion**
   - Store full section data (not just summary counts)
   - Enable Friday-to-Friday delta calculation

### Script Changes
- `scripts/eva/friday-meeting.mjs` — complete rewrite to v2 template
- `lib/skunkworks/friday-rd-section.js` — add rubric scoring
- `.claude/commands/friday.md` — update skill handler for pre-meeting phase

### LLM Calls (3 per meeting)
1. Capability ranking (top 5 by strategic impact)
2. OKR gap-fill (infer OKR alignment for untagged SDs)
3. Finding clustering (group 42+ findings into themes)

## Architecture

```
Pre-Meeting Phase:
  AskUserQuestion → chairman selects pre-checks
    → /distill (if selected) → full pipeline → return
    → Consultant check → verify Monday run → offer trigger
    → Baseline refresh → update counts
    → Skip → proceed to meeting

Meeting Execution:
  1. PULSE CHECK
     → Query eva_updates for last Friday's snapshot
     → Query current fleet/baseline/pipeline/gate stats
     → Compute deltas

  2. WINS & CAPABILITIES
     → Query sd_capabilities (created this week)
     → LLM ranks top 5 by strategic impact
     → Query baseline expected capabilities
     → Compute planned vs actual gap

  3. STRATEGIC ALIGNMENT
     → Query okr_objectives + okr_key_results
     → Map SDs to OKRs via tags
     → LLM gap-fills untagged SDs
     → Flag orphan SDs as drift

  4. INTELLIGENCE BRIEFING
     → Query eva_consultant_recommendations (all tiers)
     → LLM clusters into themes
     → Identify graduation candidates (age > 12 days)
     → Map priority_score to 5-tier labels

  5. INTAKE & DISTILL
     → Query eva_intake_queue (pending)
     → Show distill results from pre-meeting
     → Query last meeting's deferred items

  6. R&D LAB
     → Query rd_proposals (pending_review)
     → Apply 4-dimension rubric scoring
     → Map to priority tiers

  7. BLOCKERS & RISKS
     → Query blocked SDs
     → Compute capability delivery gaps
     → Query gate failure patterns
     → Check baseline ETAs

  8. DECISIONS & ACTIONS
     → Query meeting_actions WHERE status IN ('open','carried')
     → Present new decision items via AskUserQuestion
     → Process decisions immediately
     → Create meeting_actions for new items

Post-Meeting:
  → Collect chairman notes (AskUserQuestion)
  → Generate AI digest (LLM)
  → Persist full snapshot to eva_updates
  → Persist action items to meeting_actions
```

## Suggested Next Steps
1. Create orchestrator SD with children:
   - Child A: Database migrations (meeting_actions, priority tiers, rubric columns)
   - Child B: Rewrite friday-meeting.mjs (sections 1-4)
   - Child C: Rewrite friday-meeting.mjs (sections 5-8 + pre/post meeting)
   - Child D: LLM integration (capability ranking, OKR gap-fill, finding clustering)
   - Child E: Update skill handler + testing
2. Priority tier standardization should be its own SD or shared with Section 4/6 work
