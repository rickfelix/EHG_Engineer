# Quality Lifecycle System Documentation


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-22
- **Tags**: database, api, rls, feature

**Orchestrator**: SD-QUALITY-LIFECYCLE-001
**Status**: Completed (100%)
**Version**: 1.0.0
**Generated**: 2026-01-18

---

## Overview

The Quality Lifecycle System is EHG's unified approach to quality and feedback management, spanning five stages: Prevention, Capture, Triage, Resolution, and Learning. It provides a single, comprehensive system for managing both issues (bugs) and enhancements (feature requests) across EHG and all ventures.

---

## Documentation Structure

### Core Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| **User Guide** | `docs/04_features/quality-lifecycle-system.md` | Complete user guide covering all features, components, usage, and troubleshooting |
| **Workflow Guide** | `docs/workflow/quality-lifecycle-workflow.md` | Operational workflows showing how feedback flows through the system |
| **Vision Document** | `docs/vision/quality-lifecycle-system.md` | Original vision and architecture decisions |

### Component Documentation

Each of the 6 child SDs has detailed documentation embedded in the User Guide:

1. **SD-QUALITY-DB-001**: Database Foundation
   - Unified `feedback` table (issues + enhancements)
   - `releases` table for versioned releases
   - `feedback_sd_map` junction table
   - RLS policies and indexes

2. **SD-QUALITY-CLI-001**: /inbox CLI Command
   - `/inbox` command with all subcommands
   - Filters and aliases
   - Interactive forms via AskUserQuestion

3. **SD-QUALITY-TRIAGE-001**: Triage & Prioritization
   - Priority calculation (P0-P3, high/med/low)
   - Burst grouping for error storms
   - Snooze/ignore logic
   - Noise control

4. **SD-QUALITY-UI-001**: /quality Web UI Section
   - 4 views: inbox, backlog, releases, patterns
   - Feedback widget (FAB)
   - API endpoints
   - Fatigue Meter

5. **SD-QUALITY-INT-001**: System Integrations
   - Automatic error capture
   - /uat integration
   - Risk Router
   - /learn connection

6. **SD-QUALITY-FIXES-001**: Triangulation Fixes
   - RLS policies
   - Source type constraints
   - Value/effort matrix
   - CLI completeness

---

## Quick Start

### For Developers (CLI)

```bash
# View feedback inbox
/inbox

# Report an issue
/inbox new

# Report an enhancement
/inbox new --type=enhancement

# Filter to issues only
/inbox --issues

# Filter to enhancements only
/inbox --enhance
```

### For Business Users (Web UI)

1. Navigate to `/quality` section in EHG application
2. Click feedback button (bottom-right FAB) to submit feedback
3. Use inbox view to see all feedback
4. Use backlog view to plan enhancements
5. Use releases view to track versioned releases

---

## Key Features

### Unified Feedback Management

**Single Table, Two Types**:
- `type: 'issue'` → Bugs, errors, defects
- `type: 'enhancement'` → Feature requests, improvements

**Why Unified?** All three triangulation reviewers (Claude, OpenAI, Gemini) unanimously agreed: A solo entrepreneur needs ONE inbox, not separate systems for bugs and feature requests.

### Multi-Venture Architecture

The system supports EHG and all ventures from a single data model:

```javascript
// feedback.source_application
'ehg'         // EHG application
'venture_a'   // Venture A
'venture_b'   // Venture B
// ... etc
```

### Intelligent Triage

**For Issues**: Severity-based priority (P0-P3)
```
P0 = Critical severity + current venture
P1 = High severity OR current venture
P2 = Medium severity, other ventures
P3 = Low severity, auto-captured
```

**For Enhancements**: Value/Effort Matrix
```
High value + Small effort = P1 (quick win)
Medium value + Medium effort = P2
Low value + Large effort = P3
```

### Automatic Error Capture

Runtime errors are automatically logged with deduplication:
- Hash: error message + stack trace
- If same hash within 5 minutes → increment `occurrence_count`
- Prevents error storms from flooding the inbox

### Release Planning

Bundle enhancements into versioned releases:
1. Create release (e.g., v2.1.0)
2. Add enhancements to release
3. Bundle into SDs
4. Track progress
5. Ship when 100% complete

---

## Architecture

### Data Model

```
feedback (unified table)
├── type: 'issue' | 'enhancement'
├── source_application: 'ehg' | 'venture_a' | ...
├── source_type: 'manual_feedback' | 'auto_capture' | 'uat_failure' | ...
├── priority: P0-P3 (issues), high/med/low (enhancements)
└── status: new, triaged, in_progress, resolved, ...

releases (versioned releases)
├── version: 'v2.1.0'
├── name: 'Q1 2026 Feature Pack'
├── target_date: 2026-03-31
└── status: planned, active, shipped

feedback_sd_map (junction table)
├── feedback_id → feedback.id
└── sd_id → strategic_directives_v2.id
```

### Component Architecture

```
┌─────────────────────────────────────────────┐
│          INTERFACE LAYER                     │
├─────────────────────────────────────────────┤
│  CLI (/inbox)          Web UI (/quality)    │
└────────────┬──────────────────┬─────────────┘
             │                  │
┌────────────┴──────────────────┴─────────────┐
│         BUSINESS LOGIC LAYER                 │
├─────────────────────────────────────────────┤
│  Priority Calculator                        │
│  Burst Detector                             │
│  Error Capture                              │
└────────────┬────────────────────────────────┘
             │
┌────────────┴────────────────────────────────┐
│            DATA LAYER                        │
├─────────────────────────────────────────────┤
│  feedback table (Supabase)                  │
└─────────────────────────────────────────────┘
```

---

## Integration Points

### With LEO Protocol

| Integration | Purpose |
|-------------|---------|
| `/uat` failures | Create feedback with `source_type: 'uat_failure'` |
| `/quick-fix` | Resolve small issues (<50 LOC) |
| `/learn` | Extract patterns from resolved feedback |
| Risk Router | Route feedback to `/quick-fix` or SD creation |

### With Governance

| Integration | Purpose |
|-------------|---------|
| Directive Lab | "Promote to SD" from backlog |
| Source Selection | Link enhancements to SDs |
| PRD Manager | View linked enhancements |

### With Ventures

| Integration | Purpose |
|-------------|---------|
| Feedback Widget | Submit feedback from any venture |
| Error Capture | Auto-log runtime errors |
| API Integration | Write to central `feedback` table |

---

## Validation

This system was validated through **FOUR rounds** of multi-AI triangulation:

### Round 1: Vision Review
- **Reviewers**: OpenAI GPT-4o, AntiGravity (Gemini)
- **Result**: Added Triage stage, noise control strategy
- **Scores**: Vision Clarity 8.5/10, Scalability 8.5/10

### Round 2: Enhancement Integration
- **Reviewers**: Claude Opus 4.5, OpenAI GPT-4o, AntiGravity (Gemini)
- **Result**: UNANIMOUS agreement on unified approach
- **Scores**: Conceptual Clarity 8.3/10, Solo Fit 9.3/10

### Round 3: UI Integration
- **Reviewers**: Claude Opus 4.5, OpenAI GPT-4o, AntiGravity (Gemini)
- **Result**: COMPLETE CONSENSUS on comprehensive implementation
- **Scores**: Integration Complexity: Medium, Solo Fit 9/10

### Round 4: SD Hierarchy Planning
- **Reviewers**: Claude Opus 4.5, OpenAI GPT-4o, AntiGravity (Gemini)
- **Result**: STRONG CONSENSUS on single orchestrator with 5-6 children
- **Scores**: Solo Entrepreneur Fit 9/10

**Overall Consensus**:
- Vision Clarity: 8.5/10
- Conceptual Completeness: 8.3/10
- Solo Entrepreneur Fit: 9.3/10

---

## Strategic Directives

### Orchestrator

| SD ID | Title | Status | Progress |
|-------|-------|--------|----------|
| SD-QUALITY-LIFECYCLE-001 | Quality Lifecycle System - Unified Feedback Management | Completed | 100% |

### Children

| SD ID | Title | Type | Status | Progress |
|-------|-------|------|--------|----------|
| SD-QUALITY-DB-001 | Database Foundation | database | Completed | 100% |
| SD-QUALITY-CLI-001 | /inbox CLI Command | feature | Completed | 100% |
| SD-QUALITY-TRIAGE-001 | Triage & Prioritization | infrastructure | Completed | 100% |
| SD-QUALITY-UI-001 | /quality Web UI Section | feature | Completed | 100% |
| SD-QUALITY-INT-001 | System Integrations | infrastructure | Completed | 100% |
| SD-QUALITY-FIXES-001 | Triangulation Fixes | infrastructure | Completed | 100% |

**Total Duration**: 3-4 weeks
**Execution Model**: Database first, then parallel feature/infrastructure work

---

## Triangulation Research

Full triangulation analysis documents:

### Round 1 (Vision)
- `docs/research/triangulation-quality-lifecycle-openai-response.md`
- `docs/research/triangulation-quality-lifecycle-gemini-response.md`
- `docs/research/triangulation-quality-lifecycle-synthesis.md`

### Round 2 (Enhancements)
- `scripts/temp/quality-lifecycle-enhancements-triangulation-prompt.md`
- `docs/research/triangulation-quality-lifecycle-enhancements-synthesis.md`

### Round 3 (UI Integration)
- `scripts/temp/quality-lifecycle-ui-integration-triangulation-prompt.md`
- `docs/research/triangulation-quality-lifecycle-ui-integration-synthesis.md`

### Round 4 (SD Hierarchy)
- `scripts/temp/quality-lifecycle-sd-hierarchy-triangulation-prompt.md`
- `docs/research/triangulation-quality-lifecycle-sd-hierarchy-synthesis.md`

### Recently Committed Research
- `docs/research/triangulation-quality-lifecycle-claude-analysis.md`
- `docs/research/triangulation-quality-lifecycle-gap-analysis-synthesis.md`
- `docs/research/triangulation-quality-lifecycle-gemini-analysis.md`
- `docs/research/triangulation-quality-lifecycle-openai-analysis.md`

---

## Key Design Decisions

### Unified vs Separate Tables
**Decision**: Unified `feedback` table with `type` discriminator
**Rationale**: All three reviewers unanimously agreed that a solo entrepreneur needs ONE inbox. Splitting guarantees one system will be neglected.

### Stage 2 Name: "Capture" vs "Detection"
**Decision**: Renamed from "Detection" to "Capture"
**Rationale**: "Detection" implies finding something wrong (passive/negative). "Capture" is neutral - covers both passive error logging AND active user ideas.

### Primary Command: /inbox
**Decision**: `/inbox` as primary, `/feedback` and `/issues` as aliases
**Rationale**: "Inbox" represents "the list of unprocessed things" - like an email inbox. Mental model of a unified queue where both issues and enhancements arrive.

### Junction Table vs Simple Field
**Decision**: `feedback_sd_map` junction table (many-to-many)
**Rationale**: One SD often addresses multiple enhancements (e.g., "UI Polish Phase 1" addresses 15 feedback items). Simple `sd_id` field on feedback would only support one-to-many.

### UI Sequence: CLI First, UI Last
**Decision**: SD-QUALITY-UI-001 sequenced last (after CLI, Triage, Integration)
**Rationale**: Gemini insight - "CLI verifies data model works before investing in React components"

---

## Future Work

Not included in this orchestrator (separate future SDs):

### SD-QUALITY-AI-001 (Future)
- AI duplicate detection ("Similar to #402")
- Pattern matching across ventures
- Severity/value recommendations
- Auto-suggest type conversion

### SD-QUALITY-VENTURE-001 (Future)
- Package feedback widget for venture reuse
- Venture integration guide
- Error capture middleware template
- Add to Venture Creation Workflow (25-stage)

---

## Getting Help

### Documentation
- **User Guide**: `docs/04_features/quality-lifecycle-system.md`
- **Workflow Guide**: `docs/workflow/quality-lifecycle-workflow.md`
- **Vision Document**: `docs/vision/quality-lifecycle-system.md`

### Commands
```bash
/inbox --help          # CLI help
/help quality          # General quality system help
```

### Troubleshooting
See "Troubleshooting" section in User Guide for common issues and solutions.

---

## Changelog

### Version 1.0.0 (2026-01-18)
- Initial release
- All 6 child SDs completed
- Full triangulation validation (4 rounds)
- Documentation complete

---

**Documentation README generated**: 2026-01-18
**Based on**: SD-QUALITY-LIFECYCLE-001 (orchestrator + 6 children)
**Validated by**: Claude Opus 4.5, OpenAI GPT-4o, AntiGravity (Gemini)
**Files Created**: 59KB user guide, 26KB workflow guide, 7KB README
