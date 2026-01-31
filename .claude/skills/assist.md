---
description: Intelligent autonomous inbox processing with context-aware prioritization
---

# /leo assist - Autonomous Inbox Processing

**Command:** /leo assist [--dry-run]

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

## Overview

`/leo assist` processes the feedback inbox autonomously with intelligent prioritization and self-healing retry logic. It operates in two phases:

1. **Phase 1: Autonomous Issue Processing** - Processes all issues without user interaction
2. **Phase 2: Interactive Enhancement Scheduling** - Asks user to schedule each enhancement

## Instructions

### Pre-Flight Checks

Before starting, verify:
1. Check inbox has items to process
2. Load recent SD context for prioritization
3. Display mode (full run vs dry-run)

```javascript
// Check for --dry-run flag
const dryRun = "$ARGUMENTS".includes("--dry-run");
```

### Phase 1: Autonomous Issue Processing

**IMPORTANT**: This phase runs without user interaction. Continue through all issues automatically.

#### Step 1: Initialize and Load Context

```javascript
// Import the AssistEngine
const { AssistEngine } = require('../../lib/quality/assist-engine.js');

// Initialize with options
const engine = new AssistEngine({ dryRun });
await engine.initialize();

// Load inbox items
const { issues, enhancements, total } = await engine.loadInboxItems();

// Display context
console.log(`
────────────────────────────────────────────────────────────────
  /leo assist - Intelligent Inbox Processing
────────────────────────────────────────────────────────────────
  Context: ${engine.context.summary}
  Inbox: ${issues.length} issues, ${enhancements.length} enhancements
  Mode: ${dryRun ? 'DRY RUN (no changes)' : 'FULL EXECUTION'}
────────────────────────────────────────────────────────────────
`);
```

#### Step 2: Prioritize Issues

```javascript
// Priority order:
// 1. P0 (critical) - always first
// 2. Related to current SD work - momentum
// 3. P1 (high)
// 4. P2/P3 (normal/low)

const prioritizedIssues = engine.prioritizeIssues(issues);
```

#### Step 3: Process Each Issue with Intelligent Retry

For each issue, the engine classifies it and provides processing instructions:

**Classification Rules:**
- **≤50 LOC**: Quick-fix - implement directly with safety gates
- **50-100 LOC**: Create SD and execute immediately
- **>100 LOC**: Create SD and add to queue (too large for autonomous processing)

**Intelligent Retry Loop (for quick-fixes):**

```
┌─────────────────────────────────────────────────────────────┐
│  Attempt 1: Direct fix                                      │
│      ├─ Tests PASS → Auto-merge ✓                          │
│      └─ Tests FAIL ↓                                        │
│                                                             │
│  Attempt 2: RCA sub-agent                                   │
│      → Diagnose failure, identify root cause                │
│      → Apply RCA-informed fix                               │
│      ├─ Tests PASS → Auto-merge ✓                          │
│      └─ Tests FAIL ↓                                        │
│                                                             │
│  Attempt 3: Specialist sub-agent                            │
│      → Route based on error type:                           │
│        • Schema/migration → DATABASE agent                  │
│        • Test assertion wrong → TESTING agent               │
│        • Auth/RLS/permissions → SECURITY agent              │
│      ├─ Tests PASS → Auto-merge ✓                          │
│      └─ Tests FAIL → Mark "needs attention" ✗              │
└─────────────────────────────────────────────────────────────┘
```

**Safety Gates (automated, no human review):**
- Tests must pass (after retries)
- Lint must pass
- No test file deletions (prevent "fix loop")
- LOC ejection: abort if actual LOC > 50 mid-fix
- Auto-revert on final failure (leave repo clean)

**Process each issue:**

```javascript
for (const issue of prioritizedIssues) {
  console.log(`\n📋 Processing: ${issue.title}`);

  const result = await engine.processIssue(issue);

  if (dryRun) {
    console.log(`   [DRY RUN] ${result.instruction.message}`);
    continue;
  }

  // Execute based on instruction
  switch (result.instruction.action) {
    case 'implement_quick_fix':
      // Implement the fix using the instruction details
      // Run safety gates
      // Record result
      break;

    case 'create_and_execute_sd':
      // Create SD from feedback
      // Execute SD workflow
      // Record result
      break;

    case 'create_sd_only':
      // Create SD and add to queue
      // Record result (SD created, will be picked up later)
      break;
  }
}
```

### Phase 2: Interactive Enhancement Scheduling

**IMPORTANT**: This phase requires user input. Present each enhancement one-by-one.

```javascript
if (enhancements.length > 0) {
  console.log(`
────────────────────────────────────────────────────────────────
  PHASE 2: Enhancement Scheduling (${enhancements.length} items)
────────────────────────────────────────────────────────────────
  `);

  for (const enhancement of enhancements) {
    const presentation = engine.buildEnhancementPresentation(enhancement);

    // Use AskUserQuestion to get scheduling decision
    // Present:
    // - Title and description
    // - AI recommendation (based on context)
    // - Related SD if any
    // - Estimated LOC

    // Options: Now / This week / Next week / Backlog / Won't do
  }
}
```

**For each enhancement, use AskUserQuestion:**

```javascript
{
  "questions": [
    {
      "question": "📦 Enhancement: {title}\n\n{description}\n\n💡 AI Recommendation:\n{recommendation}\n\nWhen should we implement this?",
      "header": "Schedule",
      "multiSelect": false,
      "options": [
        {"label": "Now", "description": "Create SD and implement immediately"},
        {"label": "This week", "description": "Schedule for this week"},
        {"label": "Next week", "description": "Schedule for next week"},
        {"label": "Backlog", "description": "Add to backlog for future consideration"},
        {"label": "Won't do", "description": "Close as won't implement"}
      ]
    }
  ]
}
```

**Scheduling Actions:**
- **Now**: Create SD, add to immediate queue (will be next after assist completes)
- **This week**: Set `snoozed_until` to end of week, status='backlog'
- **Next week**: Set `snoozed_until` to next Monday, status='backlog'
- **Backlog**: Set status='backlog'
- **Won't do**: Set status='wont_fix', add resolution note

### Phase 3: Summary Report

After all processing is complete:

```javascript
const summary = engine.generateSummary();
console.log(summary);
```

**Summary Format:**
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
  ...

  📋 SD CREATED & QUEUED (2)
  ────────────────────────────────────────────────────────────
  FB-0006  → SD-FIX-LARGE-REFACTOR-001 (queued, ~200 LOC)
  ...

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

When `--dry-run` is specified:
- Shows prioritized list and planned actions
- No database changes
- No implementations
- No SDs created

```
/leo assist --dry-run
```

## Related Commands

- `/leo inbox` - View inbox list (non-interactive)
- `/leo next` - Show SD queue
- `/quick-fix` - Manual quick-fix workflow

## Context

**Engine Location**: `lib/quality/assist-engine.js`
**Context Analyzer**: `lib/quality/context-analyzer.js`

The AssistEngine class provides:
- `initialize()` - Load context
- `loadInboxItems()` - Get inbox items
- `prioritizeIssues(issues)` - Priority sort
- `processIssue(issue)` - Get processing instruction
- `recordIssueResult(issue, type, details)` - Track results
- `buildEnhancementPresentation(enhancement)` - Build presentation
- `recordEnhancementDecision(enhancement, decision)` - Track scheduling
- `generateSummary()` - Generate report
