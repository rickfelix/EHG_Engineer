---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# LEO Assist Command Reference Guide


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [⚠️ CRITICAL: Issue Resolution Protocol](#-critical-issue-resolution-protocol)
- [Quick Start](#quick-start)
- [When to Use /leo assist](#when-to-use-leo-assist)
- [Command Flow](#command-flow)
- [Phase 1: Autonomous Issue Processing](#phase-1-autonomous-issue-processing)
  - [Prioritization](#prioritization)
  - [Classification by Scope](#classification-by-scope)
  - [Intelligent Retry Loop](#intelligent-retry-loop)
  - [Safety Gates](#safety-gates)
- [Phase 2: Interactive Enhancement Scheduling](#phase-2-interactive-enhancement-scheduling)
  - [Scheduling Options](#scheduling-options)
- [Summary Report](#summary-report)
- [Dry-Run Mode](#dry-run-mode)
- [Context-Aware Prioritization](#context-aware-prioritization)
- [Known Limitations](#known-limitations)
  - [Feedback Resolution Tracking (v1.0)](#feedback-resolution-tracking-v10)
  - [Junction Table Not Used](#junction-table-not-used)
- [Related Commands](#related-commands)
- [Technical Details](#technical-details)
  - [Engine Components](#engine-components)
  - [Database Tables](#database-tables)
  - [Key Methods](#key-methods)
- [Troubleshooting](#troubleshooting)
  - ["No items to process"](#no-items-to-process)
  - ["Context load failed"](#context-load-failed)
  - ["Quick-fix exceeded LOC threshold"](#quick-fix-exceeded-loc-threshold)
- [Version History](#version-history)

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Claude Code (LEO Protocol)
- **Last Updated**: 2026-01-31
- **Tags**: leo, assist, feedback, inbox, autonomous, triage

## Overview

The `/leo assist` command is an intelligent autonomous inbox processor that triages and resolves feedback items without constant human intervention. It combines automated issue fixing with interactive enhancement scheduling.

**Key Value Proposition**: Process your entire feedback inbox in one session - issues get fixed automatically, enhancements get scheduled with your input.

## ⚠️ CRITICAL: Issue Resolution Protocol

**When you encounter ANY issue, error, or unexpected behavior during /leo assist processing:**

1. **DO NOT work around it** - Workarounds hide problems and create technical debt
2. **DO NOT ignore it** - Every issue is a signal that something needs attention
3. **INVOKE the RCA Sub-Agent** - Use `subagent_type="rca-agent"` via the Task tool

**Example invocation:**
```
Task tool with subagent_type="rca-agent":
"Analyze why [describe the issue] is occurring.
Perform 5-whys analysis and identify the root cause."
```

**Why this matters:**
- Root cause fixes prevent recurrence
- Issues captured in `issue_patterns` table benefit future sessions
- Systematic analysis produces better solutions than quick fixes

**The only acceptable response to an issue is understanding WHY it happened.**

## Quick Start

```bash
# In Claude Code, simply type:
/leo assist

# Preview what would happen without making changes:
/leo assist --dry-run
```

## When to Use /leo assist

| Scenario | Command | Why |
|----------|---------|-----|
| Clear the inbox efficiently | `/leo assist` | Autonomous processing of all items |
| Preview without changes | `/leo assist --dry-run` | See what would happen first |
| Just view the inbox | `/leo inbox` | Quick list, no processing |
| Single specific issue | `/quick-fix` | Manual control over one item |
| Work on next SD | `/leo next` | Skip inbox, continue SD queue |

## Command Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      /leo assist WORKFLOW                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  INITIALIZATION                                                     │
│  ├─ Load recent SD context (what you've been working on)           │
│  ├─ Query feedback inbox for actionable items                       │
│  ├─ Separate issues from enhancements                               │
│  └─ Display session overview                                        │
│                                                                     │
│  ════════════════════════════════════════════════════════════════  │
│  PHASE 1: AUTONOMOUS ISSUE PROCESSING (No user input needed)        │
│  ════════════════════════════════════════════════════════════════  │
│                                                                     │
│  For each issue (prioritized):                                      │
│  ├─ Classify by estimated scope (LOC)                               │
│  ├─ ≤50 LOC → Quick-fix with intelligent retry                     │
│  ├─ 50-100 LOC → Create SD and execute immediately                 │
│  └─ >100 LOC → Create SD and queue for later                       │
│                                                                     │
│  ════════════════════════════════════════════════════════════════  │
│  PHASE 2: INTERACTIVE ENHANCEMENT SCHEDULING (User input)           │
│  ════════════════════════════════════════════════════════════════  │
│                                                                     │
│  For each enhancement:                                              │
│  ├─ Present title, description, AI recommendation                   │
│  └─ Ask: Now / This week / Next week / Backlog / Won't do          │
│                                                                     │
│  ════════════════════════════════════════════════════════════════  │
│  SUMMARY REPORT                                                     │
│  ════════════════════════════════════════════════════════════════  │
│                                                                     │
│  ├─ Issues: auto-merged, SDs created, needs attention               │
│  ├─ Enhancements: scheduled breakdown                               │
│  └─ Next steps: queued SDs for implementation                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Phase 1: Autonomous Issue Processing

### Prioritization

Issues are processed in this priority order:

| Priority | Description | Example |
|----------|-------------|---------|
| 1. P0 (Critical) | System-breaking issues | Login completely broken |
| 2. Related to recent work | Maintains momentum | Bug in feature you just built |
| 3. P1 (High) | Important but not critical | Missing validation |
| 4. P2/P3 (Normal/Low) | Standard issues | UI polish, minor bugs |

### Classification by Scope

| Estimated LOC | Classification | Action |
|---------------|----------------|--------|
| ≤50 lines | Quick-fix | Implement directly with safety gates |
| 50-100 lines | Small SD | Create SD and execute immediately |
| >100 lines | Large SD | Create SD and add to queue |

### Intelligent Retry Loop

For quick-fixes (≤50 LOC), the system uses self-healing retries:

```
Attempt 1: Direct fix
    ├─ Tests PASS → Auto-merge ✓
    └─ Tests FAIL → Try Attempt 2

Attempt 2: RCA Sub-Agent
    → Diagnose failure with 5-whys analysis
    → Apply RCA-informed fix
    ├─ Tests PASS → Auto-merge ✓
    └─ Tests FAIL → Try Attempt 3

Attempt 3: Specialist Sub-Agent
    → Route based on error type:
      • Schema/migration → DATABASE agent
      • Test assertion → TESTING agent
      • Auth/RLS → SECURITY agent
    ├─ Tests PASS → Auto-merge ✓
    └─ Tests FAIL → Mark "needs attention"
```

### Safety Gates

All autonomous fixes must pass these gates:

| Gate | Purpose |
|------|---------|
| Tests must pass | No broken functionality |
| Lint must pass | Code quality maintained |
| No test deletions | Prevents "fix by deleting tests" |
| LOC ejection at 50 | Aborts if scope creeps beyond estimate |
| Auto-revert on failure | Leaves repo clean if all attempts fail |

## Phase 2: Interactive Enhancement Scheduling

For each enhancement, you'll see:

```
────────────────────────────────────────────────────────────────
📦 Enhancement: Add dark mode toggle

Description:
Users want a dark mode option in the settings panel.

💡 AI Recommendation:
Related to "Settings page refactor" which you just completed.
Good time to implement while context is fresh.

Estimated: ~45 LOC
────────────────────────────────────────────────────────────────
```

### Scheduling Options

| Choice | What Happens |
|--------|--------------|
| **Now** | Creates SD, adds to immediate queue |
| **This week** | Sets `snoozed_until` to Friday, status='backlog' |
| **Next week** | Sets `snoozed_until` to next Monday, status='backlog' |
| **Backlog** | Sets status='backlog' (no date) |
| **Won't do** | Sets status='wont_fix', closes item |

## Summary Report

After processing, you'll see a complete summary:

```
════════════════════════════════════════════════════════════
  /leo assist - Session Summary
════════════════════════════════════════════════════════════

  Total Items: 15
  Duration: 45 minutes

┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: ISSUES (Autonomous)                    11 items  │
└─────────────────────────────────────────────────────────────┘

  ✅ AUTO-MERGED (8)
  ────────────────────────────────────────────────────────────
  FB-0001  Missing breadcrumb navigation (12 LOC, 1 attempt)
  FB-0002  Header menu missing Profile (8 LOC, 1 attempt)
  FB-0003  UUID validation error (45 LOC, 2 attempts - RCA)
  ...

  📋 SD CREATED & QUEUED (2)
  ────────────────────────────────────────────────────────────
  FB-0006  → SD-FIX-REFACTOR-001 (queued, ~200 LOC)
  FB-0007  → SD-FIX-COMPLEX-001 (queued, ~150 LOC)

  ⚠️  NEEDS ATTENTION (1)
  ────────────────────────────────────────────────────────────
  FB-0008  Auth token refresh - exhausted 3 attempts
           Recommendation: May need architectural decision

┌─────────────────────────────────────────────────────────────┐
│  PHASE 2: ENHANCEMENTS (Interactive)              4 items  │
└─────────────────────────────────────────────────────────────┘

  🚀 IMPLEMENT NOW (1)
  📅 SCHEDULED (2)
  📦 BACKLOG (1)

════════════════════════════════════════════════════════════
  📊 Inbox Status: 0 remaining (was 15)
  🎯 Next: 3 SDs queued for implementation
════════════════════════════════════════════════════════════
```

## Dry-Run Mode

Use `--dry-run` to preview without making changes:

```bash
/leo assist --dry-run
```

**What dry-run shows:**
- Prioritized list of items
- Classification for each (quick-fix vs SD)
- Planned actions
- Estimated session duration

**What dry-run does NOT do:**
- No database changes
- No code implementations
- No SDs created
- No branch/commit/PR operations

## Context-Aware Prioritization

The assist engine analyzes your recent work to prioritize intelligently:

```
Recent SD Work:
  • SD-FIX-AUTH-001 (currently working on)
  • SD-ENH-SETTINGS-002 (completed yesterday)

Feedback FB-0042 "Login remembers wrong user" mentions:
  • "auth" (matches SD-FIX-AUTH-001)
  • "login" (related to auth work)

→ FB-0042 gets priority boost (related to active work)
```

This means issues related to what you're currently working on get processed first, maintaining your development momentum.

## Known Limitations

### Feedback Resolution Tracking (v1.0)

**Current behavior**: When `/leo assist` completes a quick-fix or creates an SD for a feedback item, the feedback status is updated but the `resolution_sd_id` field is not always populated with a link back to the work that resolved it.

**Impact**: You can see work was done, but may need to manually trace which SD or quick-fix resolved a specific feedback item.

**Planned improvement**: Future version will automatically link:
- `feedback.resolution_sd_id` → SD key or QF ID
- `feedback.resolution_notes` → "Resolved via /leo assist"
- `feedback.resolved_at` → Timestamp

### Junction Table Not Used

The `feedback_sd_map` junction table exists for many-to-many feedback-to-SD relationships but is not yet integrated with `/leo assist`.

## Related Commands

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/leo inbox` | View feedback list | Quick inbox check |
| `/leo next` | Show SD queue | Skip inbox, continue SDs |
| `/leo init` | Initialize session | Start of work session |
| `/quick-fix` | Manual quick-fix | Single specific issue |
| `/ship` | Commit and PR | After manual work |

## Technical Details

### Engine Components

| Component | Location | Purpose |
|-----------|----------|---------|
| AssistEngine | `lib/quality/assist-engine.js` | Core processing logic |
| ContextAnalyzer | `lib/quality/context-analyzer.js` | SD relationship detection |
| Skill Definition | `.claude/skills/assist.md` | Claude execution instructions |

### Database Tables

| Table | Role |
|-------|------|
| `feedback` | Source of inbox items |
| `strategic_directives_v2` | SD creation target |
| `quick_fixes` | Quick-fix tracking |

### Key Methods

```javascript
// AssistEngine API
engine.initialize()              // Load context
engine.loadInboxItems()          // Get feedback items
engine.prioritizeIssues(issues)  // Sort by priority
engine.processIssue(issue)       // Get processing instruction
engine.recordIssueResult(...)    // Track outcome
engine.buildEnhancementPresentation(enh)  // Format for display
engine.recordEnhancementDecision(...)     // Track scheduling
engine.generateSummary()         // Final report
```

## Troubleshooting

### "No items to process"

**Cause**: Inbox is empty or all items are in terminal states (resolved, wont_fix, shipped).

**Solution**:
```bash
# Check actual inbox state
/leo inbox
```

### "Context load failed"

**Cause**: Database connection issue or missing environment variables.

**Solution**:
```bash
# Verify database connectivity
node -e "require('dotenv').config(); console.log(process.env.SUPABASE_URL ? 'OK' : 'MISSING')"
```

### "Quick-fix exceeded LOC threshold"

**Cause**: Implementation grew beyond 50 LOC estimate.

**What happens**: Assist auto-reverts changes and escalates to SD creation.

**No action needed**: This is expected behavior - the safety gate worked correctly.

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-31 | Initial release with two-phase processing |

---

*Part of the LEO Protocol command ecosystem. See also: [LEO Protocol Overview](../leo/)*
