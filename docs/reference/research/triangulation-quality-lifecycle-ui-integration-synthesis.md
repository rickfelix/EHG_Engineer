---
category: reference
status: draft
version: 1.0.0
author: Rick Felix
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Quality Lifecycle UI Integration - Triangulation Synthesis



## Table of Contents

- [Metadata](#metadata)
- [Overall Scores Comparison](#overall-scores-comparison)
- [Areas of Strong Consensus (All Three Agree)](#areas-of-strong-consensus-all-three-agree)
  - [1. Backlog Strategy: Status on Feedback Table](#1-backlog-strategy-status-on-feedback-table)
  - [2. Release Planning: First-Class Entity](#2-release-planning-first-class-entity)
  - [3. Chairman View: Unified Inbox with Portfolio Summary](#3-chairman-view-unified-inbox-with-portfolio-summary)
  - [4. UI Location: New `/quality` Section](#4-ui-location-new-quality-section)
  - [5. Baseline Integration: Separation of Concerns](#5-baseline-integration-separation-of-concerns)
- [Areas of Divergence](#areas-of-divergence)
  - [Enhancement → SD Relationship](#enhancement-sd-relationship)
  - [DirectiveLab Integration](#directivelab-integration)
  - [Baseline Details](#baseline-details)
- [Unique Insights](#unique-insights)
  - [From Gemini Only](#from-gemini-only)
  - [From OpenAI Only](#from-openai-only)
  - [From Claude Only](#from-claude-only)
- [Consolidated Data Model](#consolidated-data-model)
- [Consolidated UI Structure](#consolidated-ui-structure)
- [Consolidated Workflow](#consolidated-workflow)
- [Chairman Dashboard (Consolidated Mockup)](#chairman-dashboard-consolidated-mockup)
- [Risks & Mitigations (Consolidated)](#risks-mitigations-consolidated)
- [Action Items for Vision Document](#action-items-for-vision-document)
- [Final Recommendation](#final-recommendation)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-18
- **Tags**: unit, schema, protocol, leo

**Date**: 2026-01-17
**Reviewers**: Claude (Opus 4.5), OpenAI GPT-4o, AntiGravity (Gemini)
**Subject**: Quality Lifecycle System Integration with EHG Application

---

## Overall Scores Comparison

| Dimension | Claude | OpenAI | Gemini | Consensus |
|-----------|--------|--------|--------|-----------|
| Integration Complexity | Medium | Medium | Medium | **Medium** |
| Solo Entrepreneur Fit | 9/10 | 9/10 | 9/10 | **9/10** |
| Recommendation | Comprehensive | Comprehensive | Comprehensive | **COMPREHENSIVE** |

**Verdict**: Complete consensus on approach. All three reviewers agree on comprehensive implementation with 9/10 solo entrepreneur fit.

---

## Areas of Strong Consensus (All Three Agree)

### 1. Backlog Strategy: Status on Feedback Table

| Claude | OpenAI | Gemini |
|--------|--------|--------|
| `status='backlog'` on feedback | `status='backlog'` on feedback | `status='backlog'` on feedback |
| "No new tables, unified approach" | "Single source of truth" | "Keeps the Inbox unified" |

**Action**: Use `status` field on `feedback` table. Values: `new → triaged → backlog → bundled → shipped`

### 2. Release Planning: First-Class Entity

| Claude | OpenAI | Gemini |
|--------|--------|--------|
| "Releases as first-class entity" | "Releases as first-class entity" | "Essential for Solo Chairman" |
| Semantic clarity - release ≠ SD | Enables scheduling, reporting | "Need to know 'What is in v2.0?'" |

**Action**: Create `releases` table with venture_id, version, target_date, status.

### 3. Chairman View: Unified Inbox with Portfolio Summary

| Claude | OpenAI | Gemini |
|--------|--------|--------|
| "Portfolio view with smart defaults" | "Unified inbox with venture filters" | "Global view for cross-venture patterns" |
| Cross-venture visibility critical | Minimizes cognitive load | "Toggling 32 views is high friction" |

**Action**: Single inbox view with venture filters and portfolio summary section.

### 4. UI Location: New `/quality` Section

| Claude | OpenAI | Gemini |
|--------|--------|--------|
| "Quality ≠ Governance" | "Clear conceptual home" | "Elevates Product Quality to top-level" |
| Room to grow | Without overloading governance | "Distinct from Governance and Operations" |

**Action**: Create new `/quality` section with inbox, backlog, releases, patterns.

### 5. Baseline Integration: Separation of Concerns

| Claude | OpenAI | Gemini |
|--------|--------|--------|
| "Releases feed baseline" | "Releases define WHAT, baselines WHEN" | "Train Schedule / Train / Cargo Manifest" |
| WHAT vs WHEN/ORDER separation | Keep baseline stable | "Baseline doesn't need to know releases" |

**Action**: Releases and baseline remain separate systems. SD links to release; baseline tracks execution order.

---

## Areas of Divergence

### Enhancement → SD Relationship

| Claude | OpenAI | Gemini |
|--------|--------|--------|
| **Option B**: `promoted_to_sd_id` on feedback | **Option C**: Junction table | **Option C**: Junction table |
| "Start simple, expand if needed" | "Many-to-many for bundling" | "Crucial for bundling" |

**Synthesis**: Two reviewers recommend junction table. Gemini's reasoning is compelling: "One SD often addresses multiple enhancements (e.g., 'UI Polish Phase 1' addresses 15 feedback items)."

**Action**: Use junction table `feedback_sd_map`. The bundling use case is real and important.

### DirectiveLab Integration

| Claude | OpenAI | Gemini |
|--------|--------|--------|
| **Option B**: Promotion button | **Option B**: Promote-to-SD button | **Option A**: "From Enhancement" mode |
| Natural workflow from backlog | Keeps flow explicit | Add "Source Selection" step |

**Synthesis**: All agree on the concept (link enhancements to SD creation). Difference is UX approach. Gemini's suggestion of a "Source Selection" step in DirectiveLab is more integrated.

**Action**: Implement both:
1. "Promote to SD" button in backlog (opens DirectiveLab with pre-fill)
2. "Source Selection" step in DirectiveLab (for creating SD and selecting enhancements)

### Baseline Details

| Claude | OpenAI | Gemini |
|--------|--------|--------|
| **Option A**: Releases feed baseline | **Option D**: Quarterly + release tags | **Option A**: Releases feed baseline |
| Keep separate but connected | Add target_release_id for filtering | Baseline doesn't need release directly |

**Synthesis**: All agree on separation of concerns. OpenAI is slightly more conservative (release as tag only). Claude and Gemini agree on releases feeding the baseline planning process.

**Action**: Releases feed baseline. Add `target_release_id` to SD for filtering. Baseline system itself unchanged.

---

## Unique Insights

### From Gemini Only

| Insight | Value | Action |
|---------|-------|--------|
| **"FATIGUE METER"** - visual indicator of cognitive load | High | Add to dashboard UI |
| **"Over-Bundling" risk** - alert if SD links to >10 feedback items | High | Add validation/warning |
| **"Orphaned Feedback" risk** - release health check | High | Add release health script |
| **Cadence recommendations** - Triage (Weekly), Release Planning (Monthly) | Medium | Document as best practice |
| **"Train Schedule / Train / Cargo Manifest" analogy** | High | Use in documentation |

### From OpenAI Only

| Insight | Value | Action |
|---------|-------|--------|
| **`release_items` junction table** (separate from `feedback_sd_map`) | Medium | Consider if needed |
| **More conservative baseline integration** | Low | Noted but use Gemini/Claude approach |
| **"Lightweight for solo operator"** emphasis | High | Keep implementation simple |

### From Claude Only

| Insight | Value | Action |
|---------|-------|--------|
| **Layered scheduling** - target_quarter (rough) → target_release (specific) | Medium | Implement both fields |
| **"YAGNI" principle on junction table** | Low | Overridden by consensus |
| **Cross-links between sections** | High | Implement bidirectional navigation |

---

## Consolidated Data Model

```sql
-- ============================================================
-- FEEDBACK TABLE (Enhanced)
-- ============================================================
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Type discriminator
  type VARCHAR(20) NOT NULL CHECK (type IN ('issue', 'enhancement')),

  -- Source
  source_application VARCHAR(50) NOT NULL,  -- 'ehg', 'venture_a', etc.
  source_type VARCHAR(30) NOT NULL,         -- 'manual_feedback', 'auto_capture', 'uat_failure'
  source_context JSONB,                     -- { "url": "...", "user": "..." }

  -- Core content
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Status lifecycle
  status VARCHAR(30) DEFAULT 'new',         -- new, triaged, backlog, bundled, shipped, rejected

  -- Triage fields
  priority VARCHAR(20),                     -- P0-P3 for issues
  value_estimate VARCHAR(20),               -- high, medium, low (enhancements)
  effort_estimate VARCHAR(20),              -- small, medium, large (enhancements)
  votes INTEGER DEFAULT 0,

  -- Scheduling (layered precision)
  target_quarter VARCHAR(10),               -- Rough: 'Q1 2026', 'Q2 2026', 'Future'
  target_release_id UUID REFERENCES releases(id),  -- Specific release

  -- Issue-specific
  severity VARCHAR(20),
  error_hash VARCHAR(64),

  -- Conversion tracking
  original_type VARCHAR(20),
  converted_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  triaged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_feedback_type ON feedback(type);
CREATE INDEX idx_feedback_status ON feedback(status);
CREATE INDEX idx_feedback_source_app ON feedback(source_application);
CREATE INDEX idx_feedback_release ON feedback(target_release_id);
CREATE INDEX idx_feedback_created ON feedback(created_at DESC);

-- ============================================================
-- RELEASES TABLE (New)
-- ============================================================
CREATE TABLE releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  venture_id UUID,                          -- NULL for EHG global
  version VARCHAR(50),                      -- 'v2.1.0'
  name VARCHAR(100),                        -- 'The Dark Mode Update'

  status VARCHAR(20) DEFAULT 'planned',     -- planned, active, shipped
  target_date DATE,
  shipped_at TIMESTAMPTZ,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_releases_venture ON releases(venture_id);
CREATE INDEX idx_releases_status ON releases(status);
CREATE INDEX idx_releases_target ON releases(target_date);

-- ============================================================
-- FEEDBACK-SD MAP (Junction Table - Consensus)
-- ============================================================
CREATE TABLE feedback_sd_map (
  feedback_id UUID REFERENCES feedback(id) ON DELETE CASCADE,
  sd_id VARCHAR(100) REFERENCES strategic_directives_v2(id),

  relationship_type VARCHAR(20) DEFAULT 'addresses',  -- addresses, partially_addresses, related
  created_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (feedback_id, sd_id)
);

-- ============================================================
-- SD ENHANCEMENT (Add to existing table)
-- ============================================================
ALTER TABLE strategic_directives_v2
ADD COLUMN target_release_id UUID REFERENCES releases(id);

-- Index for release queries
CREATE INDEX idx_sd_release ON strategic_directives_v2(target_release_id);
```

---

## Consolidated UI Structure

```
/quality                          ← NEW TOP-LEVEL SECTION
├── inbox                        (All feedback, unified view)
│   ├── Filters: Venture, Type, Priority, Release
│   ├── "Needs Attention" section (P0/P1)
│   └── Quick actions: Triage, Backlog, Reject
│
├── backlog                      (status='backlog', grouped by venture)
│   ├── Filters: Venture, Value, Quarter
│   ├── Drag to schedule (target_quarter)
│   └── "Promote to SD" button
│
├── releases                     (Release planning per venture)
│   ├── Timeline view by venture
│   ├── Release cards with progress
│   ├── "Create Release" button
│   └── Health check warnings
│
└── patterns                     (AI-detected clusters)
    └── "5 ventures requested PDF export"

Cross-links:
- /quality/backlog → "Promote to SD" → /governance/directive-lab
- /governance/directive-lab → "Source Selection" step → select enhancements
- /governance/prd-manager → "View linked enhancements" sidebar
```

---

## Consolidated Workflow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         QUALITY-TO-DELIVERY PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  1. CAPTURE (Daily)                                                              │
│     User submits via /inbox or Feedback Widget                                   │
│     → feedback (status='new')                                                   │
│                                                                                  │
│  2. TRIAGE (Weekly - Gemini recommendation)                                      │
│     Chairman reviews in /quality/inbox                                           │
│     → Quick actions: Backlog, Reject, or Assign Release                         │
│     → status='triaged' → status='backlog'                                       │
│                                                                                  │
│  3. RELEASE PLANNING (Monthly - Gemini recommendation)                           │
│     Chairman bundles in /quality/releases                                        │
│     → Group related enhancements                                                 │
│     → Create SD from bundle via DirectiveLab                                     │
│     → feedback_sd_map links created                                             │
│     → status='bundled'                                                          │
│                                                                                  │
│  4. BASELINE (As needed)                                                         │
│     LEAD adds SDs to baseline with sequence_rank                                 │
│     → SD.target_release_id provides release context                             │
│     → npm run sd:baseline tracks execution                                      │
│                                                                                  │
│  5. LEO PROTOCOL (Continuous)                                                    │
│     LEAD → PLAN → EXEC                                                           │
│     → Standard LEO workflow                                                      │
│                                                                                  │
│  6. SHIP (On SD completion)                                                      │
│     → feedback items marked 'shipped'                                           │
│     → Release marked 'shipped' when all SDs complete                            │
│     → Notification to original reporters (future)                               │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Chairman Dashboard (Consolidated Mockup)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  QUALITY CONTROL STATION                                       [+ Add Feedback]  │
├──────────────────────────────────────────────────────────────────────────────────┤
│  FATIGUE METER: [████░░░░░░ Low]  |  OPEN: 12  |  NEXT RELEASE: v2.1 (4 days)   │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  [ INBOX (5) ]        [ BY VENTURE ]        [ PATTERNS (1) ]                     │
│                                                                                  │
│  🔥 NEEDS ATTENTION                                                              │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ [EHG]       P0 Issue      Payment checkout broken           [Triage →]    │ │
│  │ [Venture A] P1 Issue      Dashboard not loading             [Triage →]    │ │
│  │ [EHG]       High Enhance  Dark mode request        Votes: 3 [Triage →]    │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  📋 BACKLOG BY VENTURE                                                           │
│  ├── EHG (5)           ███████░░░ 3 scheduled for v2.1                          │
│  ├── Venture A (3)     ██████████ all scheduled                                 │
│  └── Venture B (4)     ████░░░░░░ 2 scheduled                                   │
│                                                                                  │
│  📦 RELEASE RADAR: v2.1                                                          │
│  ██████████████░░░░░░  70% Ready                                                 │
│  • SD-UI-004 (In Progress) ← 5 enhancements                                      │
│  • SD-DB-009 (Pending) ← 2 issues                                                │
│  ⚠️ 2 orphaned items not linked to any SD                                        │
│                                                                                  │
│  🔍 CROSS-VENTURE PATTERNS                                                       │
│  └── "PDF export" requested by 3 ventures → [Create Bundled SD]                  │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Risks & Mitigations (Consolidated)

| Risk | Source | Mitigation |
|------|--------|------------|
| **Inbox Zero Fatigue** | Gemini | AI Pre-triage: auto-tag, auto-prioritize, auto-backlog low-confidence |
| **Context Switching** | Gemini | Physical boundary via `/quality` section |
| **Over-Bundling** | Gemini | Alert if SD links to >10 feedback items |
| **Orphaned Feedback** | Gemini | Release health check script |
| **Navigation Complexity** | OpenAI | Top-level badges + quick links |
| **Table Overload** | OpenAI | Indexes on status, type, source_application, target_release_id |
| **Enhancement Overload** | All | Auto-prioritize by votes/value, batch triage |

---

## Action Items for Vision Document

| Priority | Action | Source |
|----------|--------|--------|
| **High** | Add `releases` table to schema | Consensus |
| **High** | Add `feedback_sd_map` junction table | Consensus (2/3) |
| **High** | Create `/quality` section in UI | Consensus |
| **High** | Add `target_release_id` to SD table | Consensus |
| **Medium** | Implement "Fatigue Meter" concept | Gemini |
| **Medium** | Add over-bundling warning (>10 items) | Gemini |
| **Medium** | Create release health check script | Gemini |
| **Medium** | Add "Source Selection" step to DirectiveLab | Gemini |
| **Low** | Add cadence recommendations to docs | Gemini |

---

## Final Recommendation

**PROCEED with Comprehensive Implementation**

All three reviewers unanimously agree:
1. Comprehensive model is necessary (not minimal)
2. Solo entrepreneur fit is excellent (9/10)
3. Integration complexity is manageable (Medium)
4. Key components: `/quality` section, `releases` table, `feedback_sd_map`, unified inbox

**Gemini's insight is key**: "The 'Simple' models will break down as Venture count > 5. Structure now saves sanity later."

**The metaphor to remember** (from Gemini):
- **Baseline** = Train Schedule (WHEN)
- **SD** = Train (execution unit)
- **Release** = Cargo Manifest (WHAT ships together)

---

*Synthesis completed: 2026-01-17*
*Ready for vision document update*
