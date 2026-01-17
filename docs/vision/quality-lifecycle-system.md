# EHG Quality Lifecycle System

**Purpose**: Define the complete vision for EHG's quality and issue management capabilities across EHG and all ventures.
**Created**: 2026-01-17
**Updated**: 2026-01-17 (consolidated from multiple documents)
**Status**: Vision / Architecture Decision

---

## Executive Summary

The Quality Lifecycle System is EHG's unified approach to quality management. It spans four stages (Prevention, Detection, Resolution, Learning) and applies not just to EHG itself, but to ALL ventures that EHG creates.

Key principles:
- **Single unified `issues` table** - All issues from all sources go to one place
- **Multi-venture architecture** - EHG and every venture feed the same system
- **Dual interfaces** - CLI for developers, Web UI for business users
- **Single `/issues` command** - Report AND manage issues with one command

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
┌─────────────────────────────────────────────────────────────────────────────┐
│                     EHG QUALITY LIFECYCLE SYSTEM                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│   │  PREVENTION │    │  DETECTION  │    │ RESOLUTION  │    │   LEARNING  │ │
│   │             │    │             │    │             │    │             │ │
│   │  PRDs       │    │  /uat       │    │  /quick-fix │    │  /learn     │ │
│   │  User       │───▶│  /issues    │───▶│  Full SD    │───▶│  Patterns   │ │
│   │  Stories    │    │  Errors     │    │             │    │  Improve    │ │
│   │  Acceptance │    │             │    │             │    │             │ │
│   │  Criteria   │    │             │    │             │    │             │ │
│   └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘ │
│                                                                             │
│        PLAN Phase         POST-EXEC           RESOLUTION          IMPROVE   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Stage 1: Prevention (PLAN Phase)
*Already exists in LEO Protocol*

| Component | Purpose |
|-----------|---------|
| PRDs | Define requirements before coding |
| User Stories | Define expected behavior |
| Acceptance Criteria | Define success conditions |

### Stage 2: Detection (POST-EXEC)
*Phase 2 implementation*

| Component | Type | Description |
|-----------|------|-------------|
| `/uat` command | Structured Testing | Human tests scenarios, records PASS/FAIL |
| `/issues new` | Ad-hoc Reporting | Users report issues via form (CLI or Web UI) |
| Error Capture | Automatic | System catches and logs runtime errors |

### Stage 3: Resolution
*Partially exists, needs enhancement*

| Component | Purpose |
|-----------|---------|
| `/issues` | View, triage, prioritize issues (same command as detection) |
| `/quick-fix` | Resolve small issues (<50 LOC) |
| Full SD | Resolve complex issues via LEO Protocol |

### Stage 4: Learning
*Already exists*

| Component | Purpose |
|-----------|---------|
| `issue_patterns` table | Track recurring issues |
| `/learn` command | Extract lessons, create improvement SDs |

---

## Multi-Venture Architecture

The Quality Lifecycle System is designed to serve not just EHG, but ALL ventures that EHG creates. Each venture inherits the same feedback and error capture infrastructure.

```
                                    UNIFIED ISSUES TABLE
                                    ────────────────────
┌─────────────────────┐
│        EHG          │──┐
│  Chairman (Web UI)  │  │
│  Developers (CLI)   │  │
│  Auto Error Capture │  │
└─────────────────────┘  │
                         │     ┌─────────────────────────────────────┐
┌─────────────────────┐  │     │              issues                 │
│     Venture A       │──┼────▶│                                     │
│  Users (Web UI)     │  │     │  source_application:                │
│  Auto Error Capture │  │     │  - ehg                              │
└─────────────────────┘  │     │  - venture_a                        │
                         │     │  - venture_b                        │
┌─────────────────────┐  │     │  - venture_c                        │
│     Venture B       │──┼────▶│  - ...                              │
│  Users (Web UI)     │  │     │                                     │
│  Auto Error Capture │  │     │  source_type:                       │
└─────────────────────┘  │     │  - manual_feedback                  │
                         │     │  - auto_capture                     │
┌─────────────────────┐  │     │  - uat_failure                      │
│     Venture C       │──┘     │                                     │
│  Users (Web UI)     │        └─────────────────────────────────────┘
│  Auto Error Capture │
└─────────────────────┘
```

### Why Multi-Venture?

1. **Consistent quality tracking** - All EHG ventures report issues the same way
2. **Centralized visibility** - Chairman sees issues across the entire portfolio
3. **Shared infrastructure** - Build once, deploy everywhere
4. **Pattern detection** - Learn from issues across all ventures

### Venture Integration Blueprint

When a new venture is created, it should include:

1. **Feedback widget** - Web UI component for user issue reporting
2. **Error capture middleware** - Auto-logs runtime errors
3. **API integration** - Writes to central `issues` table with `source_application` set

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
│   │  /issues            │             │  Feedback Widget    │              │
│   │  /issues new        │             │  (EHG App)          │              │
│   │  /issues [ID]       │             │                     │              │
│   │  /issues --mine     │             │  - Report Issue     │              │
│   │  /issues --critical │             │  - View My Issues   │              │
│   └──────────┬──────────┘             └──────────┬──────────┘              │
│              │                                   │                          │
│              │                                   │                          │
│              └───────────────┬───────────────────┘                          │
│                              │                                              │
│                              ▼                                              │
│                    ┌─────────────────────┐                                  │
│                    │    Issues API       │                                  │
│                    │  (shared backend)   │                                  │
│                    └──────────┬──────────┘                                  │
│                              │                                              │
│                              ▼                                              │
│                    ┌─────────────────────┐                                  │
│                    │   issues table      │                                  │
│                    │   (Supabase)        │                                  │
│                    └─────────────────────┘                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### CLI Interface (`/issues` command)

For developers and Claude Code:

| Subcommand | Purpose | Stage |
|------------|---------|-------|
| `/issues` | Show open issues, interactive menu | Resolution |
| `/issues new` | Report a new issue (feedback form) | Detection |
| `/issues [ID]` | View/update specific issue | Resolution |
| `/issues --mine` | Filter: issues I reported | Resolution |
| `/issues --critical` | Filter: by severity | Resolution |
| `/issues --app=venture_a` | Filter: by application | Resolution |

### Web UI Interface (Feedback Widget)

For Chairman and end users:

| Component | Location | Features |
|-----------|----------|----------|
| Feedback Button | EHG App header | Always visible, opens modal |
| Issue Form | Modal overlay | Description, severity, category, steps |
| My Issues | Settings/Support page | View issues I've reported |
| Issue Detail | Linked from notifications | View status, resolution |

Each venture app includes the same widget configured for that venture.

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

**User Story**: As a user (Chairman or venture user), when I see an issue, I want to submit feedback via a form so that it gets logged for investigation.

#### User Experience Flow

1. User is using EHG or venture app
2. Notices something wrong, confusing, or broken
3. Clicks feedback button (Web UI) or runs `/issues new` (CLI)
4. Fills out form with:
   - **Description**: What happened / what's wrong
   - **Severity**: Critical / High / Medium / Low
   - **Category**: Bug / UX Issue / Feature Request / Other
   - **Steps to reproduce** (optional): What were you doing?
   - **Expected behavior** (optional): What should have happened?
5. Submits form
6. Issue is logged to database with:
   - `source_application`: Which app (ehg, venture_a, etc.)
   - `source_type`: `manual_feedback`
   - Timestamp, session info, context

#### Success Criteria

- [ ] User can submit feedback without leaving current workflow
- [ ] Feedback is persisted to database immediately
- [ ] Confirmation shown: "Issue #XXX logged for investigation"
- [ ] Issue appears in investigation queue
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
4. Logs to issues table with:
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

**User Story**: When a user marks a test as FAIL during `/uat`, it should create an issue in the same table.

#### Current State

- `/uat` failures are recorded in `uat_test_results` with status='failed'
- Code attempts to write to `uat_defects` but table doesn't exist
- No connection to unified issue tracking

#### Desired State

- FAIL results create an entry in unified issues table
- Issue includes:
   - `source_application`: `ehg` (or venture if testing venture)
   - `source_type`: `uat_failure`
   - Link to test run and scenario
   - Failure type and description from user
   - SD context
- Risk router reads from this table

#### Success Criteria

- [ ] Every /uat FAIL creates an issue record
- [ ] Issues from /uat are indistinguishable from other sources
- [ ] Risk routing works from unified table

---

## Database Schema

### Unified `issues` Table

```sql
CREATE TABLE issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source identification (MULTI-VENTURE)
  source_application VARCHAR(50) NOT NULL,  -- 'ehg', 'venture_a', 'venture_b', etc.
  source_type VARCHAR(30) NOT NULL,         -- 'manual_feedback', 'auto_capture', 'uat_failure'
  source_id UUID,                           -- Link to uat_test_results if from /uat

  -- Issue details
  title VARCHAR(255) NOT NULL,
  description TEXT,
  severity VARCHAR(20) DEFAULT 'medium',    -- critical, high, medium, low
  category VARCHAR(50),                     -- bug, ux_issue, feature_request, error

  -- Context
  sd_id VARCHAR(50),                        -- SD context (if applicable)
  user_id UUID,                             -- User who reported (if authenticated)
  session_id VARCHAR(100),                  -- Session context
  page_url VARCHAR(500),                    -- Page where issue occurred (web)
  command VARCHAR(100),                     -- Command being run (CLI)
  environment JSONB,                        -- Browser, Node version, OS, etc.

  -- Error-specific (for auto_capture)
  error_message TEXT,
  stack_trace TEXT,
  error_hash VARCHAR(64),                   -- For deduplication
  occurrence_count INTEGER DEFAULT 1,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,

  -- Lifecycle
  status VARCHAR(20) DEFAULT 'new',         -- new, investigating, in_progress, resolved, wont_fix
  assigned_to VARCHAR(100),
  resolution_type VARCHAR(30),              -- quick_fix, full_sd, duplicate, not_a_bug
  resolution_sd_id VARCHAR(50),             -- If resolved via SD
  resolution_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_issues_source_app ON issues(source_application);
CREATE INDEX idx_issues_source_type ON issues(source_type);
CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_sd_id ON issues(sd_id);
CREATE INDEX idx_issues_error_hash ON issues(error_hash);
CREATE INDEX idx_issues_severity ON issues(severity);
CREATE INDEX idx_issues_created_at ON issues(created_at DESC);
```

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
| `/uat` | Detection | Structured acceptance testing |
| `/issues` | Detection + Resolution | Report issues (`new`) AND view/triage issues |
| `/quick-fix` | Resolution | Fix small issues (<50 LOC) |
| `/learn` | Learning | Extract patterns, create improvement SDs |

---

## Integration with Existing Systems

### Connection to issue_patterns (for /learn)

When issues are resolved, patterns can be extracted:
- If same error_hash appears 3+ times → create pattern
- If same category of issue recurs → flag for /learn

```
issues (resolved) → pattern detection → issue_patterns → /learn
```

### Connection to /quick-fix and SD creation

Issues can be routed based on complexity:
- Estimated LOC < 50 + no risky keywords → suggest `/quick-fix`
- Otherwise → suggest create SD

This is already built in the Risk Router but needs the table to read from.

---

## Implementation Phases

### Phase 2a: Foundation (Database)
1. Create `issues` table with schema above
2. Update `lib/uat/result-recorder.js` to write to new table
3. Verify /uat failures populate the table

### Phase 2b: CLI Interface
4. Create `/issues` command with subcommands:
   - `/issues` → Show open issues, interactive menu
   - `/issues new` → Report a new issue (feedback form)
   - `/issues [ID]` → View/update specific issue
5. Build form interface for `/issues new` (via AskUserQuestion)
6. Add filter flags (`--mine`, `--critical`, `--app`)

### Phase 2c: Automatic Error Capture
7. Create error capture utility for Node.js
8. Integrate into key modules (handoff, validation, database)
9. Add deduplication logic
10. Test with intentional errors

### Phase 2d: Web UI Interface (EHG)
11. Create feedback widget component
12. Add to EHG app header
13. Create issue submission API endpoint
14. Add "My Issues" view

### Phase 2e: Venture Template
15. Package feedback widget for reuse
16. Create venture integration guide
17. Add error capture middleware template

---

## Open Questions

1. **Error severity mapping**: How to auto-determine severity from error type?
2. **Notification**: Should critical issues trigger immediate notification?
3. **Retention**: How long to keep resolved issues? Archive after N days?
4. **Privacy**: Any PII or secrets that could appear in error messages?
5. **Venture routing**: Should venture issues route to venture maintainers separately?

---

## Summary

| Concept | Old Thinking | New Thinking |
|---------|--------------|--------------|
| Scope | UAT = testing only | Quality Lifecycle = prevention → detection → resolution → learning |
| Applications | Just EHG | EHG + all ventures (multi-venture) |
| Interfaces | CLI only | CLI (developers) + Web UI (users) |
| Issues table | `uat_issues` | `issues` (generic, multi-source, multi-app) |
| Detection sources | Just /uat | /uat + /issues new + error capture |
| Commands | /uat does everything | /uat (test), /issues (report + manage) |

---

*This document is the single source of truth for the Quality Lifecycle System vision.*
*Previous "UAT Platform Phase 2" document has been consolidated here.*
