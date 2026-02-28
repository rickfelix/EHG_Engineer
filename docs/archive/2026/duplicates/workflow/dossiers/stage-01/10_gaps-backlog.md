---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
<!-- ARCHIVED: 2026-01-26T16:26:54.888Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-01\10_gaps-backlog.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 1: Gaps & Backlog


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, migration, schema, guide

## Identified Gaps

### P0 (Critical)

**Gap 1: No Automated Quality Scoring**
- **Issue**: "Idea quality score" metric listed but not implemented
- **Impact**: Low-quality ideas advance to Stage 2 without screening
- **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:15 (metric listed), EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-01.md:22-23 (weakness "Limited automation")
- **Recommendation**: Implement AI quality scoring agent
- **Proposed Artifact**: `/ehg/agent-platform/app/agents/idea_quality_scorer.py`
  - **Purpose**: Score ideas 0-100 based on clarity, market potential, feasibility
  - **Why Needed**: Exit gate enforcement before Stage 2

**Gap 2: No Recursion Support**
- **Issue**: No recursion triggers defined; if later stages invalidate idea, must restart
- **Impact**: Lost progress, user frustration
- **Evidence**: Recursion consistency scan (Stage 1: N/N/N), EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-01.md (no recursion section)
- **Recommendation**: Define trigger from Stage 5 (FIN-001) or Stage 10 (TECH-001) back to Stage 1
- **Proposed Artifact**: Recursion rule in `recursion_events` table schema
  - **Purpose**: Allow re-scoping if core assumptions invalidated
  - **Why Needed**: Reduce waste from fully executing doomed ideas

### P1 (High)

**Gap 3: No Time-to-Capture Tracking**
- **Issue**: "Time to capture" metric listed but not measured
- **Impact**: Cannot optimize onboarding UX
- **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:17, EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-01.md:42-44 ("Missing threshold values")
- **Recommendation**: Add `workflow_started_at` timestamp to ventures table
- **Proposed Artifact**: Database migration adding timestamp column
  - **Purpose**: Calculate delta between start and Stage 1 completion
  - **Why Needed**: Identify UX friction points

**Gap 4: No Agent Orchestration Mapping**
- **Issue**: No agents explicitly assigned to Stage 1 in stages.yaml or critiques
- **Impact**: Cannot automate research/validation at this stage
- **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:2-42 (no agent refs), agent scan of `/ehg/agent-platform/` (no Stage 1 mappings found)
- **Recommendation**: Map Market Sizing Agent and Complexity Assessment Agent to Stage 1
- **Proposed Artifact**: Stage-to-agent mapping table or config file
  - **Purpose**: Define which agents run at which stages
  - **Why Needed**: Enable automation roadmap (Manual → Assisted → Auto)

### P2 (Medium)

**Gap 5: No Rollback Procedures**
- **Issue**: No rollback defined if user wants to revise after advancing to Stage 2
- **Impact**: Manual intervention required
- **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-01.md:47-49 ("Add Rollback Procedures")
- **Recommendation**: Define rollback decision tree
- **Proposed Artifact**: Rollback SOP document
  - **Purpose**: Guide users/admins on reverting to Stage 1
  - **Why Needed**: Reduce support burden

---

## Related Backlog Items

**From `/docs/workflow/backlog/backlog.yaml`** (if exists): [TBD - file not found in current scan]

## Open Questions

1. **Chairman Approval**: Should it be required or optional at Stage 1?
   - Current: Not explicitly defined in stages.yaml
   - Critique mentions "Chairman feedback" as input but not as gate
   - **Recommendation**: Clarify in configurability matrix

2. **Voice Transcription**: Is EVA voice input implemented?
   - Stages.yaml lists "Voice recording" as input
   - No EVA agent file found in `/ehg/agent-platform/app/agents/`
   - **Recommendation**: Verify implementation or mark as missing

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Missing metrics | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 14-17 |
| Critique weaknesses | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-01.md | 22-26 |
| Recommendations | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-01.md | 28-71 |
| Agent scan | EHG | 0d80dac | agent-platform/app/agents/ | N/A |
