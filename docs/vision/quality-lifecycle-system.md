# EHG Quality Lifecycle System


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-18
- **Tags**: database, api, testing, unit

**Purpose**: Define the complete vision for EHG's quality and feedback management capabilities across EHG and all ventures.
**Created**: 2026-01-17
**Updated**: 2026-01-17 (enhancement-request-integration)
**Status**: Vision / Architecture Decision
**Validated By**: OpenAI GPT-4o, AntiGravity (Gemini), Claude (Opus 4.5) - See Triangulation Validation section

---

## Executive Summary

The Quality Lifecycle System is EHG's unified approach to quality and feedback management. It spans five stages (Prevention, Capture, Triage, Resolution, Learning) and applies not just to EHG itself, but to ALL ventures that EHG creates.

Key principles:
- **Single unified `feedback` table** - All feedback (issues + enhancements) goes to one place
- **Type discriminator** - Clear distinction between issues (bugs) and enhancements (feature requests)
- **Multi-venture architecture** - EHG and every venture feed the same system
- **Dual interfaces** - CLI for developers, Web UI for business users
- **Single `/inbox` command** - Report AND manage all feedback with one command
- **Noise control** - AI triage, prioritization, and snooze to prevent feedback fatigue

### Why Unified Feedback?

All three triangulation reviewers (Claude, OpenAI, Gemini) unanimously agreed: A solo entrepreneur needs ONE inbox, not separate systems for bugs and feature requests. Splitting them guarantees one system will be neglected.

---

## The Problem with "UAT" Naming

We started with "UAT" (User Acceptance Testing) because Phase 1 was about testing. But now we're expanding to include:

- **Feedback from the Chairman** - Not testing, it's issue reporting
- **Automatic error capture** - Not testing, it's system monitoring
- **Issue lifecycle management** - Not testing, it's project management
- **Multi-venture feedback** - Not just EHG, it's all ventures

"UAT" is too narrow. The Quality Lifecycle System is the proper framing.

---

## Quality Lifecycle System Overview

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                           EHG QUALITY LIFECYCLE SYSTEM                                     │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                           │
│  ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐          │
│  │ PREVENTION│   │  CAPTURE  │   │  TRIAGE   │   │RESOLUTION │   │ LEARNING  │          │
│  │           │   │           │   │           │   │           │   │           │          │
│  │ PRDs      │   │ /uat      │   │ Prioritize│   │ /quick-fix│   │ /learn    │          │
│  │ User      │──▶│ /inbox    │──▶│ AI Triage │──▶│ Full SD   │──▶│ Patterns  │          │
│  │ Stories   │   │ Errors    │   │ Snooze    │   │           │   │ Improve   │          │
│  │ Acceptance│   │           │   │ Won't Fix │   │           │   │           │          │
│  └───────────┘   └───────────┘   └─────┬─────┘   └───────────┘   └───────────┘          │
│                                        │                                                 │
│      PLAN            POST-EXEC         │           RESOLUTION         IMPROVE            │
│                                        ▼                                                 │
│                               ┌─────────────────┐                                        │
│                               │  Snoozed/Ignored│                                        │
│                               │  (Noise Control)│                                        │
│                               └─────────────────┘                                        │
│                                                                                           │
│  FEEDBACK TYPES:   ┌──────────────────────────────────────────────────────────┐          │
│                    │ Issues (bugs, errors)  → Severity-based prioritization   │          │
│                    │ Enhancements (features)→ Value/Effort-based prioritization│          │
│                    └──────────────────────────────────────────────────────────┘          │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

### Stage 1: Prevention (PLAN Phase)
*Already exists in LEO Protocol*

| Component | Purpose |
|-----------|---------|
| PRDs | Define requirements before coding |
| User Stories | Define expected behavior |
| Acceptance Criteria | Define success conditions |

### Stage 2: Capture (POST-EXEC)
*Phase 2 implementation - Renamed from "Detection" per triangulation (neutral framing)*

Capture handles BOTH issues AND enhancements - same entry point, different processing.

| Component | Type | Description |
|-----------|------|-------------|
| `/uat` command | Structured Testing | Human tests scenarios, records PASS/FAIL |
| `/inbox new` | Ad-hoc Reporting | Users report issues OR enhancements via form |
| `/inbox new --type=enhancement` | Enhancement Capture | Explicitly flag as feature request |
| Error Capture | Automatic | System catches and logs runtime errors |

**Why "Capture" instead of "Detection"?** "Detection" implies finding something wrong (passive/negative). "Capture" is neutral - it covers both passive error logging AND active user ideas.

### Stage 3: Triage (NEW - from Triangulation)
*Critical filter between Capture and Resolution - UNIFIED workflow, DIVERGENT criteria*

| Component | Purpose |
|-----------|---------|
| Prioritization | Determine what Chairman sees first |
| AI Triage | "This looks like duplicate of #402" suggestions |
| Snooze/Ignore | Batch or defer low-priority noise (e.g., generic 404s) |
| Won't Fix/Won't Do | Explicit rejection path to prevent backlog graveyard |

**Type-Specific Triage Criteria:**

| Aspect | Issues | Enhancements |
|--------|--------|--------------|
| Priority driver | Severity + urgency | Value + effort |
| Urgency question | "Is this breaking things?" | "How much value does this add?" |
| Scale | P0-P3 (severity-based) | High/Med/Low (value/effort matrix) |
| Default path | Resolution queue (fix it) | Backlog (build when prioritized) |

**Why Triage?** All triangulation reviewers flagged "feedback fatigue" as the #1 risk. A solo entrepreneur managing 32 ventures cannot triage 1000 items. Triage is the critical filter that prevents Resolution from being overwhelmed.

### Stage 4: Resolution
*Partially exists, needs enhancement*

| Component | Purpose |
|-----------|---------|
| `/inbox` | View and manage triaged feedback (issues + enhancements) |
| `/quick-fix` | Resolve small issues (<50 LOC) or tiny enhancements |
| Full SD | Resolve complex issues OR build enhancements via LEO Protocol |

**Resolution by Type:**

| Size | Issues | Enhancements |
|------|--------|--------------|
| Tiny (<20 LOC) | `/quick-fix` | `/quick-fix` (cosmetic tweaks) |
| Small | Full SD | Full SD when prioritized |
| Large | Full SD | Full SD with PRD |
| Strategic | Full SD | Roadmap → SD when prioritized |

**Success Metrics by Type:**

| Type | Success Question |
|------|-----------------|
| Issues | "Is it fixed? Does the bug no longer occur?" |
| Enhancements | "Did users adopt it? Does it add value?" |

### Stage 5: Learning
*Already exists*

| Component | Purpose |
|-----------|---------|
| `issue_patterns` table | Track recurring issues |
| `/learn` command | Extract lessons, create improvement SDs |

---

## Multi-Venture Architecture

The Quality Lifecycle System is designed to serve not just EHG, but ALL ventures that EHG creates. Each venture inherits the same feedback and error capture infrastructure.

```
                                    UNIFIED FEEDBACK TABLE
                                    ──────────────────────
┌─────────────────────┐
│        EHG          │──┐
│  Chairman (Web UI)  │  │
│  Developers (CLI)   │  │
│  Auto Error Capture │  │
└─────────────────────┘  │
                         │     ┌─────────────────────────────────────┐
┌─────────────────────┐  │     │             feedback                │
│     Venture A       │──┼────▶│                                     │
│  Users (Web UI)     │  │     │  type:                              │
│  Auto Error Capture │  │     │  - issue (bugs, errors)             │
└─────────────────────┘  │     │  - enhancement (features, ideas)    │
                         │     │                                     │
┌─────────────────────┐  │     │  source_application:                │
│     Venture B       │──┼────▶│  - ehg                              │
│  Users (Web UI)     │  │     │  - venture_a                        │
│  Auto Error Capture │  │     │  - venture_b, venture_c, ...        │
└─────────────────────┘  │     │                                     │
                         │     │  source_type:                       │
┌─────────────────────┐  │     │  - manual_feedback                  │
│     Venture C       │──┘     │  - auto_capture                     │
│  Users (Web UI)     │        │  - uat_failure                      │
│  Auto Error Capture │        └─────────────────────────────────────┘
└─────────────────────┘
```

### Why Multi-Venture?

1. **Consistent quality tracking** - All EHG ventures report issues the same way
2. **Centralized visibility** - Chairman sees issues across the entire portfolio
3. **Shared infrastructure** - Build once, deploy everywhere
4. **Pattern detection** - Learn from issues across all ventures

### Venture Integration Blueprint

When a new venture is created, it should include:

1. **Feedback widget** - Web UI component for user feedback (issues + enhancements)
2. **Error capture middleware** - Auto-logs runtime errors
3. **API integration** - Writes to central `feedback` table with `source_application` set

### Implementation Note: EHG vs Ventures

| Application | Implementation Approach |
|-------------|------------------------|
| **EHG** | Build feedback directly into the EHG app (header or sidebar navigation) |
| **Future Ventures** | Spec captured in the **Venture Creation Workflow** (25-stage workflow) |

For EHG, we have direct control and can add the feedback widget as part of Phase 2d implementation.

For all future ventures, the feedback/error capture requirements will be a mandatory stage in the Venture Creation Workflow. This ensures every venture inherits the Quality Lifecycle System from day one.

---

## Dual Interface Architecture

The system supports BOTH command-line and web interfaces:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INTERFACE LAYER                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   CLI INTERFACE                        WEB UI INTERFACE                     │
│   (Developers, Claude)                 (Chairman, End Users)                │
│                                                                             │
│   ┌─────────────────────┐             ┌─────────────────────┐              │
│   │  /inbox             │             │  Feedback Widget    │              │
│   │  /inbox new         │             │  (EHG App)          │              │
│   │  /inbox [ID]        │             │                     │              │
│   │  /inbox --issues    │             │  - Report Issue     │              │
│   │  /inbox --enhance   │             │  - Suggest Feature  │              │
│   └──────────┬──────────┘             └──────────┬──────────┘              │
│              │                                   │                          │
│              │                                   │                          │
│              └───────────────┬───────────────────┘                          │
│                              │                                              │
│                              ▼                                              │
│                    ┌─────────────────────┐                                  │
│                    │   Feedback API      │                                  │
│                    │  (shared backend)   │                                  │
│                    └──────────┬──────────┘                                  │
│                              │                                              │
│                              ▼                                              │
│                    ┌─────────────────────┐                                  │
│                    │  feedback table     │                                  │
│                    │   (Supabase)        │                                  │
│                    └─────────────────────┘                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### CLI Interface (`/inbox` command)

For developers and Claude Code:

| Subcommand | Purpose | Stage |
|------------|---------|-------|
| `/inbox` | Show all open feedback, interactive menu | Resolution |
| `/inbox new` | Report a new issue (default type) | Capture |
| `/inbox new --type=enhancement` | Suggest a new feature | Capture |
| `/inbox [ID]` | View/update specific feedback | Resolution |
| `/inbox --issues` | Filter: issues only | Resolution |
| `/inbox --enhance` | Filter: enhancements only | Resolution |
| `/inbox --mine` | Filter: items I reported | Resolution |
| `/inbox --critical` | Filter: by severity (issues) | Resolution |
| `/inbox --app=venture_a` | Filter: by application | Resolution |

**Aliases**: `/feedback` and `/issues` work as aliases for `/inbox`.

### Web UI Interface (Feedback Widget)

For Chairman and end users:

| Component | Location | Features |
|-----------|----------|----------|
| Feedback Button (FAB) | Bottom-right corner | Always visible, opens modal |
| Feedback Form | Modal overlay | Type toggle (Issue/Enhancement), description, details |
| My Feedback | Settings/Support page | View feedback I've submitted |
| Feedback Detail | Linked from notifications | View status, resolution |

**Form Fields by Type:**

| Field | Issues | Enhancements |
|-------|--------|--------------|
| Type toggle | Bug/Error selected | Feature/Improvement selected |
| Description | What went wrong? | What would you like? |
| Severity | Critical/High/Med/Low | - |
| Value estimate | - | High/Medium/Low |
| Steps to reproduce | ✓ (optional) | - |
| Use case | - | ✓ (optional) |

Each venture app includes the same widget configured for that venture.

---

## Noise Control Strategy (from Triangulation)

All triangulation reviewers identified **feedback fatigue** as the #1 risk for a solo entrepreneur managing multiple ventures. This section defines the noise control mechanisms.

### The Problem

32 ventures × (auto-captured errors + enhancement requests) = potentially 1000s of items. A solo Chairman cannot triage this volume. Without noise control, the system becomes unusable.

**Additional risk for enhancements**: Enhancement requests can pile up faster than issues. Without noise control, "idea debt" can cause paralysis.

### Noise Control Mechanisms

#### 1. Prioritization Logic

Default view shows "My Focus Context" only:

| Priority | Criteria | Default View |
|----------|----------|--------------|
| P0 | Critical severity + current venture | Always visible |
| P1 | High severity OR current venture | Visible |
| P2 | Medium severity, other ventures | Hidden (expand to see) |
| P3 | Low severity, auto-captured | Hidden + grouped |

#### 2. AI Triage Suggestions

When viewing issues, AI provides:
- **Duplicate detection**: "This looks like Issue #402 from last week"
- **Pattern matching**: "Similar to 3 other issues in Venture B"
- **Severity recommendation**: "Auto-captured but affects checkout - suggest upgrade to High"

#### 3. Snooze / Ignore Rules

| Action | Effect | Use Case |
|--------|--------|----------|
| Snooze 24h | Hidden until tomorrow | "I'll deal with this after launch" |
| Snooze 7d | Hidden for a week | "Not urgent, revisit next sprint" |
| Ignore pattern | Auto-hide matching issues | "Ignore all generic 404s from bots" |
| Won't Fix | Closed, not counted as backlog | "Known limitation, documented" |

#### 4. Burst Grouping

For auto-captured errors:
- 100 errors in 1 minute = 1 grouped issue
- Shows: "Error X occurred 100 times (first: 10:00, last: 10:01)"
- Prevents error storms from flooding the queue

### Global Severity Standard

To enable cross-venture prioritization, severity must be consistent:

| Severity | Definition | Examples |
|----------|------------|----------|
| Critical | Revenue/data loss, security breach | Payment failures, data corruption |
| High | Major feature broken, workaround exists | Checkout slow, export fails |
| Medium | Feature degraded, minor impact | UI glitch, slow load |
| Low | Cosmetic, nice-to-have | Typo, alignment issue |

---

## EHG Application UI Integration (from UI Triangulation)

*How the Quality Lifecycle System integrates with the existing EHG application*

### New `/quality` Section

All three triangulation reviewers (Claude, OpenAI, Gemini) agreed: Quality Lifecycle needs its own top-level section, separate from Governance.

**Why separate?**
- **Governance** = SD execution, compliance, gate reviews (LEAD/developer focus)
- **Quality** = Feedback lifecycle, releases, patterns (Chairman/product focus)

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
```

### Cross-Links with Existing UI

| From | To | Action |
|------|----|----|
| `/quality/backlog` | `/governance/directive-lab` | "Promote to SD" button |
| `/governance/directive-lab` | `/quality` | "Source Selection" step (select enhancements) |
| `/governance/prd-manager` | `/quality` | "View linked enhancements" sidebar |

### Chairman Dashboard Mockup

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

### Release Planning Concept

**The Mental Model** (from Gemini):
- **Baseline** = Train Schedule (WHEN/ORDER things are built)
- **SD** = Train (the execution unit)
- **Release** = Cargo Manifest (WHAT ships together)

Releases define product scope; baselines define execution order. They're connected but separate:

```
         WHAT ships                    WHEN/ORDER built
         ──────────                    ────────────────

         ┌─────────┐                   ┌─────────────┐
         │ Release │                   │  Baseline   │
         │  v2.1   │──── feeds ───────▶│  (LEO)     │
         └─────────┘                   └─────────────┘
              │                              │
              ▼                              ▼
         5 enhancements              SD-001, SD-002, SD-003
         bundled into                in execution order
         2 SDs
```

### Recommended Cadence (from Gemini)

| Activity | Frequency | Purpose |
|----------|-----------|---------|
| **Triage** | Weekly | Review new feedback, quick decisions |
| **Release Planning** | Monthly | Bundle enhancements, create SDs |
| **Baseline Review** | As needed | Adjust execution order |

### Safeguards (from UI Triangulation)

| Risk | Safeguard |
|------|-----------|
| **Over-Bundling** | Warning if SD links to >10 feedback items |
| **Orphaned Feedback** | Release health check flags unlinked items |
| **Fatigue** | Visual "Fatigue Meter" on dashboard |

---

## What Was Built (Phase 1) - COMPLETE

| Component | Status | Description |
|-----------|--------|-------------|
| `/uat` command | DONE | Interactive human acceptance testing |
| `uat_test_runs` extensions | DONE | Session tracking with sd_id, quality_gate |
| `uat_test_results` extensions | DONE | Scenario source tracking |
| `v_uat_readiness` view | DONE | Quality gate calculation |
| Scenario Generator | DONE | Given/When/Then from user stories |
| Result Recorder | DONE | Session management, pass/fail recording |
| Risk Router | DONE | Defect routing to /quick-fix or full SD |

---

## What to Build (Phase 2) - Requirements

### Requirement 1: Chairman/User Feedback Form

**User Story**: As a user (Chairman or venture user), when I see an issue OR have an enhancement idea, I want to submit feedback via a form so that it gets logged.

#### User Experience Flow

1. User is using EHG or venture app
2. Notices something wrong OR has an idea for improvement
3. Clicks feedback button (Web UI) or runs `/inbox new` (CLI)
4. Selects type:
   - **Issue**: Something is broken, confusing, or wrong
   - **Enhancement**: An idea for improvement or new feature
5. Fills out form with type-specific fields:
   - **Issues**: Description, severity, steps to reproduce
   - **Enhancements**: Description, value estimate, use case
6. Submits form
7. Feedback is logged to database with:
   - `type`: 'issue' or 'enhancement'
   - `source_application`: Which app (ehg, venture_a, etc.)
   - `source_type`: `manual_feedback`
   - Timestamp, session info, context

#### Success Criteria

- [ ] User can submit feedback without leaving current workflow
- [ ] User can toggle between Issue and Enhancement types
- [ ] Feedback is persisted to database immediately
- [ ] Confirmation shown: "Feedback #XXX logged"
- [ ] Feedback appears in inbox queue
- [ ] Works in both CLI and Web UI

---

### Requirement 2: Automatic Error Capture

**User Story**: As a system, when an error occurs anywhere in EHG or a venture, I want it automatically logged so that no errors are lost.

#### What Happens Automatically

1. Error occurs in application (CLI, scripts, API, web app)
2. Error handler intercepts the error
3. Captures:
   - **Error message**: The actual error text
   - **Stack trace**: Where it happened
   - **Context**: Current page/command, user action
   - **Timestamp**: When it occurred
   - **Environment**: Browser, Node version, OS, etc.
4. Logs to `feedback` table with:
   - `type`: 'issue' (always - errors are issues)
   - `source_application`: Which app
   - `source_type`: `auto_capture`
   - `severity`: Auto-determined based on error type

#### Deduplication Logic

To avoid logging the same error 100 times:
- Hash the error message + stack trace
- If same hash seen within last N minutes, increment `occurrence_count`
- Store `first_seen` and `last_seen` timestamps

#### Success Criteria

- [ ] All uncaught exceptions are captured
- [ ] Critical errors in key modules are captured
- [ ] Duplicate errors are consolidated, not repeated
- [ ] Error capture does not crash the application (fail-safe)
- [ ] Works in both Node.js (CLI) and browser (Web UI)

---

### Requirement 3: Integration with /uat

**User Story**: When a user marks a test as FAIL during `/uat`, it should create a feedback record in the unified table.

#### Current State

- `/uat` failures are recorded in `uat_test_results` with status='failed'
- Code attempts to write to `uat_defects` but table doesn't exist
- No connection to unified feedback tracking

#### Desired State

- FAIL results create an entry in unified `feedback` table
- Feedback includes:
   - `type`: 'issue' (test failures are issues)
   - `source_application`: `ehg` (or venture if testing venture)
   - `source_type`: `uat_failure`
   - Link to test run and scenario
   - Failure type and description from user
   - SD context
- Risk router reads from this table

#### Success Criteria

- [ ] Every /uat FAIL creates a feedback record with `type: 'issue'`
- [ ] Feedback from /uat is indistinguishable from other sources
- [ ] Risk routing works from unified table

---

## Database Schema

### Unified `feedback` Table

*Renamed from `issues` per triangulation consensus - supports both issues AND enhancements*

```sql
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- TYPE DISCRIMINATOR (NEW - from Enhancement Triangulation)
  type VARCHAR(20) NOT NULL,                -- 'issue' | 'enhancement'

  -- Source identification (MULTI-VENTURE)
  source_application VARCHAR(50) NOT NULL,  -- 'ehg', 'venture_a', 'venture_b', etc.
  source_type VARCHAR(30) NOT NULL,         -- 'manual_feedback', 'auto_capture', 'uat_failure'
  source_id UUID,                           -- Link to uat_test_results if from /uat

  -- Common fields (both types)
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'new',         -- new, triaged, in_progress, resolved, wont_fix, backlog, shipped
  priority VARCHAR(10),                     -- P0-P3 for issues, high/med/low for enhancements

  -- Context
  sd_id VARCHAR(50),                        -- SD context (if applicable)
  user_id UUID,                             -- User who reported (if authenticated)
  session_id VARCHAR(100),                  -- Session context
  page_url VARCHAR(500),                    -- Page where feedback occurred (web)
  command VARCHAR(100),                     -- Command being run (CLI)
  environment JSONB,                        -- Browser, Node version, OS, etc.

  -- ISSUE-SPECIFIC (nullable for enhancements)
  severity VARCHAR(20),                     -- critical, high, medium, low
  category VARCHAR(50),                     -- bug, ux_issue, error
  error_message TEXT,
  stack_trace TEXT,
  error_hash VARCHAR(64),                   -- For deduplication
  occurrence_count INTEGER DEFAULT 1,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  resolution_type VARCHAR(30),              -- quick_fix, full_sd, duplicate, not_a_bug

  -- ENHANCEMENT-SPECIFIC (nullable for issues) - NEW
  value_estimate VARCHAR(20),               -- high, medium, low
  effort_estimate VARCHAR(20),              -- small, medium, large
  votes INTEGER DEFAULT 0,                  -- For future voting feature
  use_case TEXT,                            -- "As a X, I want Y so that Z"

  -- CONVERSION TRACKING (NEW - from Enhancement Triangulation)
  original_type VARCHAR(20),                -- If converted, what was it originally?
  converted_at TIMESTAMPTZ,                 -- When was it converted?
  conversion_reason TEXT,                   -- Why was it converted?

  -- Triage (from Triangulation Round 1)
  triaged_at TIMESTAMPTZ,                   -- When feedback was triaged
  triaged_by VARCHAR(100),                  -- Who triaged (user or 'ai_auto')
  snoozed_until TIMESTAMPTZ,                -- Hidden until this time
  ignore_pattern VARCHAR(255),              -- If set, similar items auto-ignored
  ai_triage_suggestion JSONB,               -- AI suggestions: {duplicate_of, pattern_match, severity_rec}

  -- Resolution
  assigned_to VARCHAR(100),
  resolution_sd_id VARCHAR(50),             -- If resolved via SD
  resolution_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_feedback_type ON feedback(type);
CREATE INDEX idx_feedback_source_app ON feedback(source_application);
CREATE INDEX idx_feedback_source_type ON feedback(source_type);
CREATE INDEX idx_feedback_status ON feedback(status);
CREATE INDEX idx_feedback_sd_id ON feedback(sd_id);
CREATE INDEX idx_feedback_error_hash ON feedback(error_hash) WHERE error_hash IS NOT NULL;
CREATE INDEX idx_feedback_severity ON feedback(severity) WHERE type = 'issue';
CREATE INDEX idx_feedback_priority ON feedback(priority);
CREATE INDEX idx_feedback_snoozed ON feedback(snoozed_until) WHERE snoozed_until IS NOT NULL;
CREATE INDEX idx_feedback_created_at ON feedback(created_at DESC);
CREATE INDEX idx_feedback_value ON feedback(value_estimate) WHERE type = 'enhancement';

-- Partial indexes for type-specific queries
CREATE INDEX idx_feedback_issues ON feedback(created_at DESC) WHERE type = 'issue';
CREATE INDEX idx_feedback_enhancements ON feedback(created_at DESC) WHERE type = 'enhancement';
```

### Releases Table (NEW - from UI Integration Triangulation)

*For bundling enhancements into versioned releases per venture*

```sql
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
```

### Feedback-SD Map (Junction Table - NEW)

*For tracking which enhancements are addressed by which SDs (many-to-many)*

```sql
CREATE TABLE feedback_sd_map (
  feedback_id UUID REFERENCES feedback(id) ON DELETE CASCADE,
  sd_id VARCHAR(100) REFERENCES strategic_directives_v2(id),

  relationship_type VARCHAR(20) DEFAULT 'addresses',  -- addresses, partially_addresses, related
  created_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (feedback_id, sd_id)
);
```

**Why junction table?** Per triangulation consensus: "One SD often addresses multiple enhancements (e.g., 'UI Polish Phase 1' addresses 15 feedback items)."

### SD Table Enhancement

*Add release linkage to existing strategic_directives_v2*

```sql
ALTER TABLE strategic_directives_v2
ADD COLUMN target_release_id UUID REFERENCES releases(id);

CREATE INDEX idx_sd_release ON strategic_directives_v2(target_release_id);
```

### Conversion Handling

**Conversion = Type Change on Same Record** (consensus from all 3 reviewers)

When an issue becomes an enhancement (or vice versa):
- Same record ID preserved
- `type` field updated
- `original_type` captures what it was
- `converted_at` captures when
- `conversion_reason` captures why (e.g., "User expected PDF export but only CSV exists - feature request not bug")

No data migration needed. Just a field update with audit trail.

### Keep Existing UAT Tables (Testing-Specific)

These tables remain unchanged because they ARE specifically about testing:

```
uat_test_runs      → Test session metadata
uat_test_results   → Individual test outcomes
uat_test_suites    → Test suite definitions
uat_test_cases     → Test case definitions
```

---

## Command Structure

| Command | Category | Purpose |
|---------|----------|---------|
| `/uat` | Capture | Structured acceptance testing |
| `/inbox` | Capture + Resolution | Report feedback (`new`) AND view/triage (primary command) |
| `/feedback` | Alias | Alias for `/inbox` |
| `/issues` | Alias | Alias for `/inbox` (backward compatibility) |
| `/quick-fix` | Resolution | Fix small issues or tiny enhancements (<50 LOC) |
| `/learn` | Learning | Extract patterns, create improvement SDs |

**Why `/inbox`?** Per Gemini's insight: "Inbox" represents "the list of unprocessed things" - like an email inbox. It's the mental model of a unified queue where both issues and enhancements arrive.

---

## Integration with Existing Systems

### Connection to issue_patterns (for /learn)

When feedback is resolved, patterns can be extracted:
- If same error_hash appears 3+ times → create pattern
- If same category of feedback recurs → flag for /learn

```
feedback (resolved) → pattern detection → issue_patterns → /learn
```

### Connection to /quick-fix and SD creation

Feedback can be routed based on complexity:

**For Issues:**
- Estimated LOC < 50 + no risky keywords → suggest `/quick-fix`
- Otherwise → suggest create SD

**For Enhancements:**
- Tiny cosmetic changes (<20 LOC) → suggest `/quick-fix`
- Small features → create SD when prioritized
- Large features → roadmap first, then SD

This is already built in the Risk Router but needs the table to read from.

---

## Implementation Phases

### Phase 2a: Foundation (Database)
1. Create `feedback` table with schema above (type discriminator, triage fields, enhancement fields)
2. Update `lib/uat/result-recorder.js` to write to new table with `type: 'issue'`
3. Verify /uat failures populate the table

### Phase 2b: CLI Interface (`/inbox` command)
4. Create `/inbox` command with subcommands:
   - `/inbox` → Show all open feedback (prioritized, hide snoozed)
   - `/inbox new` → Report a new issue (default type)
   - `/inbox new --type=enhancement` → Suggest a new feature
   - `/inbox [ID]` → View/update specific feedback
   - `/inbox snooze [ID] [duration]` → Snooze feedback
   - `/inbox wontfix [ID]` → Mark issue as won't fix
   - `/inbox wontdo [ID]` → Mark enhancement as won't do
   - `/inbox convert [ID]` → Convert issue ↔ enhancement
5. Build form interface for `/inbox new` (via AskUserQuestion) with type toggle
6. Add filter flags (`--issues`, `--enhance`, `--mine`, `--critical`, `--app`, `--all`)
7. Create `/feedback` and `/issues` as aliases

### Phase 2c: Triage & Prioritization (from Triangulation)
8. Implement priority calculation:
   - Issues: severity + venture context → P0-P3
   - Enhancements: value/effort matrix → high/med/low
9. Add burst grouping for auto-captured errors (time window)
10. Create snooze/ignore logic
11. Default view: "My Focus Context" (P0/P1 issues + high-value enhancements)

### Phase 2d: Automatic Error Capture
12. Create error capture utility for Node.js
13. Integrate into key modules (handoff, validation, database)
14. Add deduplication logic (hash + time window)
15. Test with intentional errors
16. Captured errors always have `type: 'issue'`

### Phase 2e: Web UI Interface (EHG)
17. Create feedback widget component (bottom-right FAB)
18. Add to EHG app
19. Create feedback submission API endpoint (supports both types)
20. Add "My Feedback" view (shows issues + enhancements)
21. Add type toggle in feedback form

### Phase 2f: AI Triage (Future)
22. Duplicate detection ("Similar to #402")
23. Pattern matching across ventures
24. Severity/value recommendations
25. Auto-suggest conversion ("This looks like a feature request, not a bug")

### Phase 2g: Venture Template
26. Package feedback widget for reuse
27. Create venture integration guide
28. Add error capture middleware template
29. Add to Venture Creation Workflow (25-stage)

---

## Strategic Directive Hierarchy (from SD Triangulation)

*How the implementation work is organized into Strategic Directives*

### Recommended Structure

All three triangulation reviewers (Claude, OpenAI, Gemini) agreed on:
- **Single orchestrator** - No two-level hierarchy needed for this scope
- **No grandchildren** - Each child SD is 3-7 days, manageable without further decomposition
- **Database first** - Hard dependency; all other SDs need the schema
- **Medium-to-large children** - Minimize LEAD/PRD overhead for solo entrepreneur

```
SD-QUALITY-LIFECYCLE-001 (orchestrator)
│
├── SD-QUALITY-DB-001 (database) ────────── 3-4 days
│   └── feedback table, releases table, feedback_sd_map,
│       indexes, RLS, shared priority utilities
│
├── SD-QUALITY-CLI-001 (feature) ────────── 4-5 days
│   └── /inbox command: all subcommands, filters, aliases
│
├── SD-QUALITY-TRIAGE-001 (infrastructure)─ 2-3 days
│   └── Priority calculation, burst grouping, snooze/ignore
│
├── SD-QUALITY-UI-001 (feature) ─────────── 5-7 days
│   └── /quality section + feedback widget + API endpoint
│
└── SD-QUALITY-INT-001 (infrastructure) ─── 3-4 days
    └── Error capture, /uat integration, Risk Router, /learn
```

**Total**: 6 SDs (1 orchestrator + 5 children)
**Duration**: 3-4 weeks
**Solo Entrepreneur Fit**: 9/10

### Sequencing

```
                    ┌─────────────────┐
                    │ SD-QUALITY-DB   │  Week 1
                    │   (database)    │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ SD-QUALITY-CLI  │ │SD-QUALITY-TRIAGE│ │ SD-QUALITY-INT  │  Week 2-3
│   (feature)     │ │(infrastructure) │ │(infrastructure) │
└─────────────────┘ └─────────────────┘ └─────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ SD-QUALITY-UI   │  Week 3-4
                    │   (feature)     │
                    └─────────────────┘
```

**Key Insight (from Gemini)**: "CLI verifies data model works before investing in React components" - so UI is sequenced last, not parallel.

### Child SD Details

| SD ID | Type | Title | Depends On | Key Outputs |
|-------|------|-------|------------|-------------|
| SD-QUALITY-DB-001 | database | Database Foundation | None | Tables, indexes, RLS, shared utils |
| SD-QUALITY-CLI-001 | feature | /inbox CLI Command | DB-001 | `/inbox` with all subcommands |
| SD-QUALITY-TRIAGE-001 | infrastructure | Triage & Prioritization | DB-001 | Priority calc, snooze, burst grouping |
| SD-QUALITY-UI-001 | feature | /quality Web Section | DB-001 | 4 views + widget + API |
| SD-QUALITY-INT-001 | infrastructure | System Integrations | DB-001 | Error capture, /uat hooks, Risk Router |

### Key Design Decisions

| Decision | Consensus | Rationale |
|----------|-----------|-----------|
| Widget combined with UI | 2/3 | Reduces handoffs; split if >1 week (Gemini mitigation) |
| Triage as separate SD | 2/3 | Clear boundary; but DB exports shared priority utils |
| Serial execution (practical) | 1/3 | Solo developer can't literally parallelize, but SDs ready to start |

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Schema changes ripple across features | Lock DB PRD early; migration review checkpoint |
| Web SD scope creep | Strict sub-tasking; split Widget if >1 week |
| Shared logic duplication | Priority calc exported from DB-001 as shared utility |
| Integration touches fragile code | Flag as infrastructure; prioritize tests |

### Future Work (Separate Orchestrator)

AI Triage and Venture Template are **not** part of this orchestrator. They will be handled by:
- **SD-QUALITY-AI-001** (future) - Duplicate detection, pattern matching, auto-suggestions
- **SD-QUALITY-VENTURE-001** (future) - Package widget for venture reuse, integration guide

This keeps the current orchestrator focused on **core functionality**.

---

## Open Questions

### Resolved by Triangulation (Round 1: Vision)

| Question | Resolution |
|----------|------------|
| Cognitive load / issue fatigue? | Add Triage stage with prioritization, snooze, AI triage |
| Should /uat and /issues be unified? | No - keep separate but link (UAT failures create feedback) |
| Feedback widget placement? | Bottom-right FAB (floating action button) |
| CLI vs Web UI parity? | No parity needed - CLI is power user, Web UI is simple |

### Resolved by Triangulation (Round 2: Enhancements)

| Question | Resolution |
|----------|------------|
| Same table or separate for enhancements? | **Unified** - One `feedback` table with type discriminator |
| Where do enhancements enter lifecycle? | **Capture stage** - Same entry point as issues |
| How to handle issue ↔ enhancement conversion? | **Type change on same record** with audit trail |
| What about enhancement-specific fields? | **Nullable fields** - value_estimate, effort_estimate, votes |
| Different triage criteria? | **Unified workflow, divergent criteria** per type |
| What should the command be called? | **`/inbox`** (primary), with `/feedback` and `/issues` as aliases |
| Should we rename "Detection" stage? | **Yes → "Capture"** (neutral framing) |

### Still Open

1. **Error severity mapping**: How to auto-determine severity from error type?
2. **Notification**: Should critical issues trigger immediate notification?
3. **Retention**: How long to keep resolved feedback? Archive after N days?
4. **Privacy**: Any PII or secrets that could appear in error messages?
5. **Venture routing**: Should venture feedback route to venture maintainers separately?
6. **External monitoring**: Add uptime/cron monitors as feedback source? (Gemini suggestion)
7. **Inquiry type**: Should we add a third type "inquiry" for questions? (Gemini suggestion - deferred)

---

## Summary

| Concept | Old Thinking | Current Thinking |
|---------|--------------|------------------|
| Scope | UAT = testing only | Quality Lifecycle = prevention → capture → triage → resolution → learning |
| Feedback types | Only bugs/errors | Issues (bugs) + Enhancements (features) in ONE system |
| Applications | Just EHG | EHG + all ventures (multi-venture) |
| Interfaces | CLI only | CLI (developers) + Web UI (users) |
| Table | `uat_issues` | `feedback` (unified, type-discriminated, multi-source, multi-app) |
| Capture sources | Just /uat | /uat + /inbox new + error capture |
| Stage 2 name | Detection | **Capture** (neutral framing) |
| Primary command | /uat does everything | `/inbox` (report + manage), /uat (test only) |
| Noise control | Not considered | Triage stage with prioritization, snooze, AI triage |
| Conversion | N/A | Issue ↔ Enhancement via type field change |

---

## Triangulation Validation

This vision was validated through FOUR rounds of multi-AI triangulation on 2026-01-17.

### Round 1: Vision Review

**Reviewers:**
- **OpenAI GPT-4o**: Vision Clarity 8/10, Recommendation: Refine
- **AntiGravity (Gemini)**: Vision Clarity 9/10, Recommendation: Proceed with focus

**Consensus Scores:**
| Dimension | Score |
|-----------|-------|
| Vision Clarity | 8.5/10 |
| Conceptual Completeness | 7.5/10 |
| Scalability Potential | 8.5/10 |
| Solo Entrepreneur Fit | 7.25/10 |

**Key Refinements:**
1. Added Triage stage between Detection and Resolution
2. Added Noise Control Strategy (prioritization, snooze, AI triage)
3. Added Global Severity Standard
4. Added Burst Grouping for error storms

### Round 2: Enhancement Request Integration

**Reviewers:**
- **Claude (Opus 4.5)**: Conceptual Clarity 8/10, Solo Fit 9/10, Recommendation: Unified
- **OpenAI GPT-4o**: Conceptual Clarity 8/10, Solo Fit 9/10, Recommendation: Unified
- **AntiGravity (Gemini)**: Conceptual Clarity 9/10, Solo Fit 10/10, Recommendation: Unified

**Consensus Scores:**
| Dimension | Score |
|-----------|-------|
| Conceptual Clarity | 8.3/10 |
| Integration Complexity | Medium |
| Solo Entrepreneur Fit | 9.3/10 |

**Verdict: UNANIMOUS agreement on Unified approach**

All three reviewers independently concluded:
- Unified table is mandatory for solo entrepreneur sanity
- Type discriminator enables clean separation within unified structure
- Conversion is trivial (field update, not data migration)
- One inbox prevents system neglect

**Key Refinements:**
1. Renamed table from `issues` to `feedback`
2. Added `type` discriminator field ('issue' | 'enhancement')
3. Added enhancement-specific fields (value_estimate, effort_estimate, votes)
4. Added conversion tracking fields
5. Renamed "Detection" stage to "Capture"
6. Changed primary command to `/inbox` with `/issues` and `/feedback` as aliases
7. Updated triage to have divergent criteria per type

### Full Triangulation Documents

**Round 1 (Vision):**
- `docs/research/triangulation-quality-lifecycle-openai-response.md`
- `docs/research/triangulation-quality-lifecycle-gemini-response.md`
- `docs/research/triangulation-quality-lifecycle-synthesis.md`

**Round 2 (Enhancements):**
- `scripts/temp/quality-lifecycle-enhancements-triangulation-prompt.md`
- `docs/research/triangulation-quality-lifecycle-enhancements-synthesis.md`

### Round 3: UI Integration

**Reviewers:**
- **Claude (Opus 4.5)**: Integration Complexity: Medium, Solo Fit 9/10, Recommendation: Comprehensive
- **OpenAI GPT-4o**: Integration Complexity: Medium, Solo Fit 9/10, Recommendation: Comprehensive
- **AntiGravity (Gemini)**: Integration Complexity: Medium, Solo Fit 9/10, Recommendation: Comprehensive

**Consensus Scores:**
| Dimension | Score |
|-----------|-------|
| Integration Complexity | Medium |
| Solo Entrepreneur Fit | 9/10 |
| Recommendation | Comprehensive |

**Verdict: COMPLETE CONSENSUS on Comprehensive implementation**

All three reviewers unanimously agreed on:
- New `/quality` section separate from `/governance`
- `releases` table as first-class entity
- `feedback_sd_map` junction table for many-to-many bundling
- Unified inbox with venture filters (not per-venture navigation)
- Releases define WHAT ships; Baseline defines WHEN/ORDER (separation of concerns)

**Key Refinements:**
1. Added `releases` table for bundling enhancements into versioned releases
2. Added `feedback_sd_map` junction table (consensus 2/3 over simple field)
3. Added `target_release_id` to SD table
4. Created `/quality` section UI structure (inbox, backlog, releases, patterns)
5. Added Chairman dashboard concept with Fatigue Meter
6. Added release planning concept (Train metaphor from Gemini)
7. Added recommended cadence: Triage (weekly), Release Planning (monthly)
8. Added safeguards: over-bundling warning, orphaned feedback check

**Unique Insights by Reviewer:**

| Reviewer | Insight |
|----------|---------|
| **Gemini** | "Fatigue Meter" visual, over-bundling alert (>10 items), Train metaphor |
| **OpenAI** | Conservative baseline integration, lightweight emphasis |
| **Claude** | Layered scheduling (quarter → release), cross-section navigation |

**Round 3 (UI Integration):**
- `scripts/temp/quality-lifecycle-ui-integration-triangulation-prompt.md`
- `docs/research/triangulation-quality-lifecycle-ui-integration-synthesis.md`

### Round 4: SD Hierarchy Planning

**Reviewers:**
- **Claude (Opus 4.5)**: 8 SDs (1+7), High parallelization, Solo Fit 9/10
- **OpenAI GPT-4o**: 6 SDs (1+5), High parallelization, Solo Fit 8/10
- **AntiGravity (Gemini)**: 5 SDs (1+4), Low parallelization (serial), Solo Fit 9/10

**Consensus Scores:**
| Dimension | Score |
|-----------|-------|
| Total SDs | 6 (1 orchestrator + 5 children) |
| Structure | Single orchestrator, no grandchildren |
| Duration | 3-4 weeks |
| Solo Entrepreneur Fit | 9/10 |

**Verdict: STRONG CONSENSUS on Single Orchestrator with 5-6 Children**

All three reviewers unanimously agreed on:
- Single orchestrator (no two-level hierarchy)
- No grandchildren needed (scope doesn't warrant)
- Database must complete first (hard dependency)
- Medium-to-large child granularity (minimize overhead)

**Key Refinements:**
1. Defined 5 child SDs: DB, CLI, Triage, UI, Integration
2. Combined Widget with UI (2/3 consensus, split if >1 week)
3. Kept Triage as separate SD (2/3 consensus)
4. Sequenced UI last per Gemini insight ("CLI verifies data model first")
5. DB-001 exports shared priority utilities
6. Added risk mitigations for scope creep and schema changes

**Unique Insights by Reviewer:**

| Reviewer | Insight |
|----------|---------|
| **Gemini** | "CLI verifies data model before UI investment", serial execution for solo |
| **OpenAI** | "Lock DB PRD early, add migration checkpoint" |
| **Claude** | Maximum parallelization structure, Integration SD last for regression testing |

**Round 4 (SD Hierarchy):**
- `scripts/temp/quality-lifecycle-sd-hierarchy-triangulation-prompt.md`
- `docs/research/triangulation-quality-lifecycle-sd-hierarchy-synthesis.md`

---

*This document is the single source of truth for the Quality Lifecycle System vision.*
*Validated through four rounds of multi-AI triangulation (Claude, OpenAI, Gemini).*
*Previous "UAT Platform Phase 2" document has been consolidated here.*
