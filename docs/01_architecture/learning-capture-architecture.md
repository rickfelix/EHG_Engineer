---
category: architecture
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [architecture, auto-generated]
---
# Automated Learning Capture Architecture


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Problem Statement](#problem-statement)
  - [The Blind Spot](#the-blind-spot)
  - [Evidence from Real Sessions](#evidence-from-real-sessions)
  - [Root Cause](#root-cause)
- [Architecture Overview](#architecture-overview)
  - [Core Principle](#core-principle)
  - [Architecture Layers](#architecture-layers)
- [Components](#components)
  - [1. PostToolUse Hook (`scripts/hooks/auto-learning-capture.cjs`)](#1-posttooluse-hook-scriptshooksauto-learning-capturecjs)
  - [2. Learning Capture Engine (`scripts/auto-learning-capture.js`)](#2-learning-capture-engine-scriptsauto-learning-capturejs)
- [Detection Strategy](#detection-strategy)
  - [Database-First Detection (Survives Branch Deletion)](#database-first-detection-survives-branch-deletion)
  - [Detection Sequence](#detection-sequence)
- [Learning Extraction](#learning-extraction)
  - [Extraction Pipeline](#extraction-pipeline)
  - [1. PR Metadata Extraction](#1-pr-metadata-extraction)
  - [2. Work Type Classification](#2-work-type-classification)
  - [3. Learning Signal Detection](#3-learning-signal-detection)
  - [4. Corrective Action Detection](#4-corrective-action-detection)
- [Database Integration](#database-integration)
  - [Schema Usage](#schema-usage)
  - [Integration with /learn Command](#integration-with-learn-command)
- [Patterns (with Devil's Advocate)](#patterns-with-devils-advocate)
- [Workflow](#workflow)
  - [End-to-End Flow](#end-to-end-flow)
  - [Timing and Performance](#timing-and-performance)
  - [Error Handling](#error-handling)
- [Success Criteria](#success-criteria)
  - [Functional Requirements](#functional-requirements)
  - [Quality Metrics](#quality-metrics)
  - [User Experience](#user-experience)
- [Memory-Pattern Lifecycle Closure](#memory-pattern-lifecycle-closure)
  - [The Problem (Before)](#the-problem-before)
  - [The Solution](#the-solution)
- [Gate Return Schema Must Use passed/maxScore [PAT-AUTO-0042]](#gate-return-schema-must-use-passedmaxscore-pat-auto-0042)
  - [Full Lifecycle Diagram](#full-lifecycle-diagram)
  - [Fail-Safe Design](#fail-safe-design)
  - [Implementation Files](#implementation-files)
  - [MEMORY.md Rules (Post-Implementation)](#memorymd-rules-post-implementation)
- [Related Documentation](#related-documentation)
  - [Architecture](#architecture)
  - [Reference](#reference)
  - [Protocols](#protocols)
  - [Implementation](#implementation)
- [Quick-Fix Pattern Promotion Integration](#quick-fix-pattern-promotion-integration)
  - [Architecture Extension](#architecture-extension)
  - [Quick-Fix Clustering](#quick-fix-clustering)
- [Version History](#version-history)

## Metadata
- **Category**: Architecture
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Claude Opus 4.5
- **Last Updated**: 2026-02-01
- **Tags**: learning, retrospectives, hooks, automation, continuous-improvement

## Overview

The Automated Learning Capture architecture solves a critical blind spot in the LEO Protocol: **sessions that don't go through the full SD workflow have no mechanism to capture learnings**.

Previously, only Strategic Directives (SD) and Quick Fixes (QF) that completed the full LEO workflow would generate retrospectives and capture patterns. Valuable insights from documentation fixes, ad-hoc improvements, and polish sessions were lost to the system.

This architecture automatically captures learnings from **all merged work**, regardless of whether it follows the SD/QF workflow.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Architecture Overview](#architecture-overview)
3. [Components](#components)
4. [Detection Strategy](#detection-strategy)
5. [Learning Extraction](#learning-extraction)
6. [Database Integration](#database-integration)
7. [Workflow](#workflow)
8. [Success Criteria](#success-criteria)
9. [Related Documentation](#related-documentation)

---

## Problem Statement

### The Blind Spot

```
Session Type                 Retrospective Created?  Learnings Captured?
────────────────────────────────────────────────────────────────────────
Full SD (LEAD→PLAN→EXEC)     ✅ Yes (automatic)      ✅ Yes
Handoff events               ✅ Yes (automatic)      ✅ Yes
Quick Fix (QF-*)             ✅ Yes (automatic)      ✅ Yes
Documentation fix            ❌ No mechanism         ❌ Lost
Ad-hoc improvement           ❌ No mechanism         ❌ Lost
Polish/refactor session      ❌ No mechanism         ❌ Lost
```

### Evidence from Real Sessions

**Example**: Claude fixed DATABASE agent documentation (correcting `execute-database-sql.js` vs `run-sql-migration.js`):

1. Claude recognized: "I should capture this learning"
2. Claude ran `/learn` but it only surfaces EXISTING patterns - doesn't create new ones
3. Claude rationalized: "the documentation update is sufficient" and moved on
4. **Result**: Learning lost to the system

### Root Cause

The system assumed **all valuable work goes through Strategic Directives**. But valuable learnings emerge from:
- Debugging sessions that reveal documentation gaps
- Fix sessions that discover better approaches
- Discovery sessions that find architectural insights

---

## Architecture Overview

### Core Principle

**The system should automatically detect and capture learnings without requiring Claude to remember a manual step.**

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  PostToolUse Hook Layer (auto-learning-capture.cjs)             │
│  ─────────────────────────────────────────────────────────────  │
│  • Monitors: gh pr merge commands (Bash tool)                   │
│  • Triggers: When merge is successful                           │
│  • Decision: SD/QF work? (skip) vs Non-SD work? (capture)       │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Detection Layer (Database-First Queries)                       │
│  ─────────────────────────────────────────────────────────────  │
│  • v_active_sessions: Active SD claim?                          │
│  • sd_claims: Recently released SD?                             │
│  • quick_fixes: Active QF?                                      │
│  • is_working_on flag: SD marked as working?                    │
│  • Commit grep: SD-*/QF-* in messages?                          │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Learning Capture Engine (auto-learning-capture.js)             │
│  ─────────────────────────────────────────────────────────────  │
│  • Extract: PR metadata (files, commits, title, body)           │
│  • Classify: Work type from file patterns                       │
│  • Detect: Learning-worthy paths                                │
│  • Extract: Learnings from commit messages                      │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Database Layer (retrospectives + issue_patterns)               │
│  ─────────────────────────────────────────────────────────────  │
│  • Create: retrospective (generated_by: 'AUTO_HOOK')            │
│  • Create: issue_pattern (source: 'auto_hook')                  │
│  • Available: Future /learn queries surface patterns            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. PostToolUse Hook (`scripts/hooks/auto-learning-capture.cjs`)

**Purpose**: Detect successful non-SD PR merges and trigger learning capture.

**Responsibilities**:
- Monitor `gh pr merge` Bash commands via PostToolUse hook
- Parse command output to detect merge success
- Extract PR number from command or output
- Query database to determine if work is SD/QF-related
- Spawn learning capture engine for non-SD work
- Run as non-blocking (detached process)

**Key Design Decisions**:
- **Hook type**: PostToolUse (Bash matcher) - runs after `gh pr merge` completes
- **Timeout**: 20 seconds (allows time for database queries)
- **Error handling**: Non-blocking - failures don't break ship workflow
- **Logging**: Structured JSON logs with timestamps and event types

**Integration Point**: Registered in `.claude/settings.json`:
```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "node C:/Users/rickf/Projects/_EHG/EHG_Engineer/scripts/hooks/auto-learning-capture.cjs",
      "timeout": 20
    }
  ]
}
```

### 2. Learning Capture Engine (`scripts/auto-learning-capture.js`)

**Purpose**: Extract learnings from PR metadata and create database entries.

**Responsibilities**:
- Get PR details via `gh` CLI (files changed, commits, title, body)
- Classify work type from file patterns (protocol_fix, documentation_correction, etc.)
- Identify learning-worthy file paths (docs/reference/, CLAUDE.md, etc.)
- Extract learnings from commit messages using signal keywords
- Create retrospective with `generated_by: 'AUTO_HOOK'`
- Create issue_pattern if corrective action detected

**Key Algorithms**:

#### Work Type Classification
```javascript
const WORK_TYPE_CLASSIFIERS = {
  protocol_fix: [/CLAUDE.*\.md$/i, /\.claude\//],
  documentation_correction: [/docs\//, /README/i, /\.md$/],
  hook_improvement: [/scripts\/hooks\//],
  database_change: [/migrations\/.*\.sql$/i],
  configuration: [/\.json$/, /\.yaml$/, /\.yml$/],
  test_fix: [/\.test\./, /\.spec\./, /tests\//],
  ui_polish: [/components\//, /pages\//, /\.tsx$/],
  api_fix: [/api\//, /routes\//, /controllers\//]
};
```

#### Learning Signal Detection
```javascript
const LEARNING_SIGNALS = [
  { pattern: /\bfix(?:ed)?:/i, type: 'correction' },
  { pattern: /\bshould use\b/i, type: 'best_practice' },
  { pattern: /\binstead of\b/i, type: 'correction' },
  { pattern: /\broot cause\b/i, type: 'rca' },
  { pattern: /\bresilien(?:t|ce)\b/i, type: 'improvement' },
  // ... more patterns
];
```

#### Learning-Worthy Paths
```javascript
const LEARNING_WORTHY_PATHS = {
  'docs/reference/': 'reference_docs',
  'CLAUDE': 'protocol',
  '.claude/agents/': 'agent_config',
  '.claude/skills/': 'skill_config',
  'lib/keyword-intent-scorer.js': 'subagent_triggers',
  'scripts/modules/learning/': 'learning_system',
  'scripts/hooks/': 'hook_system',
  'database/migrations/': 'database_schema'
};
```

---

## Detection Strategy

### Database-First Detection (Survives Branch Deletion)

**Critical Design Decision**: Detection MUST use database queries, NOT branch names, because branches are deleted during merge.

**Reliability Ranking**:

| Method | Survives Branch Deletion | Reliability | Query Source |
|--------|--------------------------|-------------|--------------|
| `claude_sessions.sd_id` | ✅ Yes | 99% | `v_active_sessions` view |
| `sd_claims` table | ✅ Yes | 100% | `sd_claims` table |
| `quick_fixes` table | ✅ Yes | 100% | `quick_fixes` table |
| Commit message grep | ✅ Yes | 85% | `gh pr view` + regex |
| PR title/body grep | ✅ Yes | 90% | `gh pr view` + regex |
| Branch name | ❌ No (deleted) | 0% | N/A |

### Detection Sequence

```javascript
async function checkSDWorkStatus() {
  // 1. Check v_active_sessions for active SD claim
  const activeSession = await query(`
    SELECT sd_id FROM v_active_sessions
    WHERE computed_status IN ('active', 'idle')
    AND sd_id IS NOT NULL
    LIMIT 1
  `);
  if (activeSession) return { isSDWork: true, source: 'active_session' };

  // 2. Check sd_claims for recently released SD (within 10 minutes)
  const recentRelease = await query(`
    SELECT sd_id FROM sd_claims
    WHERE release_reason = 'completed'
    AND released_at > NOW() - INTERVAL '10 minutes'
    LIMIT 1
  `);
  if (recentRelease) return { isSDWork: true, source: 'recent_release' };

  // 3. Check quick_fixes for active QF
  const activeQF = await query(`
    SELECT id FROM quick_fixes
    WHERE status IN ('open', 'in_progress')
    LIMIT 1
  `);
  if (activeQF) return { isSDWork: true, source: 'active_qf' };

  // 4. Check is_working_on flag
  const workingOn = await query(`
    SELECT sd_key FROM strategic_directives_v2
    WHERE is_working_on = true
    LIMIT 1
  `);
  if (workingOn) return { isSDWork: true, source: 'is_working_on' };

  // 5. Grep commit messages for SD-*/QF-* patterns
  const commitSD = await grepCommitForSD(prNumber);
  if (commitSD) return { isSDWork: true, source: 'commit_grep' };

  return { isSDWork: false, source: null };
}
```

---

## Learning Extraction

### Extraction Pipeline

```
PR Metadata → Classification → Learning Detection → Database Creation
```

### 1. PR Metadata Extraction

Uses `gh` CLI to get:
- **Files changed**: List of modified/added/deleted files
- **Commits**: Full commit history with messages
- **Title**: PR title
- **Body**: PR description

```javascript
const pr = await getPRDetails(prNumber);
const files = pr.files || await getPRFiles(prNumber);
const commits = pr.commits || [];
```

### 2. Work Type Classification

Classifies work based on file patterns to determine learning category:

```javascript
function classifyWorkType(files) {
  const filePaths = files.map(f => f.path || f);

  for (const [workType, patterns] of Object.entries(WORK_TYPE_CLASSIFIERS)) {
    if (filePaths.some(path => patterns.some(pattern => pattern.test(path)))) {
      return workType;
    }
  }

  return 'general';
}
```

### 3. Learning Signal Detection

Extracts learnings from commit messages using keyword patterns:

```javascript
function extractLearnings(commits, prTitle, prBody) {
  const learnings = [];
  const allText = `${prTitle}\n${prBody}\n${commits.map(c => c.message).join('\n')}`;

  for (const signal of LEARNING_SIGNALS) {
    if (signal.pattern.test(allText)) {
      // Extract sentence containing the signal
      const sentences = allText.split(/[.!?\n]+/);
      const relevantSentences = sentences.filter(s => signal.pattern.test(s));

      relevantSentences.forEach(sentence => {
        if (sentence.length > 10 && sentence.length < 500) {
          learnings.push({
            text: sentence.trim(),
            type: signal.type,
            source: 'commit_message'
          });
        }
      });
    }
  }

  return learnings;
}
```

### 4. Corrective Action Detection

Determines if work was corrective (requires issue_pattern creation):

```javascript
function hasCorrectiveAction(learnings) {
  const correctiveTypes = ['correction', 'docs_correction', 'gap', 'rca'];
  return learnings.some(l => correctiveTypes.includes(l.type));
}
```

---

## Database Integration

### Schema Usage

#### retrospectives Table

```sql
-- Auto-captured retrospective
INSERT INTO retrospectives (
  title,
  description,
  retro_type,
  retrospective_type,
  conducted_date,
  what_went_well,
  what_needs_improvement,
  key_learnings,
  action_items,
  status,
  quality_score,
  generated_by,              -- 'AUTO_HOOK'
  trigger_event,             -- 'NON_SD_MERGE'
  target_application,
  learning_category,
  affected_components,
  metadata                   -- { pr_number, pr_url, work_type, auto_captured: true }
) VALUES (...);
```

**Key Fields**:
- `generated_by`: `'AUTO_HOOK'` (distinguishes from manual/SD retrospectives)
- `trigger_event`: `'NON_SD_MERGE'` (trigger type)
- `metadata.auto_captured`: `true` (flag for automated capture)
- `metadata.pr_number`: PR number for traceability
- `metadata.work_type`: Classified work type

#### issue_patterns Table

```sql
-- Auto-captured pattern (only for corrective actions)
INSERT INTO issue_patterns (
  pattern_id,              -- PAT-AUTO-0001, PAT-AUTO-0002, ...
  category,
  severity,
  issue_summary,
  occurrence_count,
  first_seen_sd_id,        -- NULL (not from SD)
  last_seen_sd_id,         -- NULL
  proven_solutions,        -- [{ solution: prTitle, from_pr: prNumber }]
  trend,
  status,
  source,                  -- 'auto_hook'
  metadata                 -- { pr_number, pr_url, work_type, auto_captured: true }
) VALUES (...);
```

**Key Fields**:
- `pattern_id`: Auto-generated sequential ID (`PAT-AUTO-NNNN`)
- `source`: `'auto_hook'` (distinguishes from manual/SD patterns)
- `first_seen_sd_id`/`last_seen_sd_id`: `NULL` (not from SD)
- `proven_solutions[].from_pr`: PR number for solution source

### Integration with /learn Command

Auto-captured patterns appear in `/learn` output alongside SD-generated patterns:

```bash
# /learn process phase shows:
## Patterns (with Devil's Advocate)

**[PAT-AUTO-0001]** Use execute-database-sql.js instead of run-sql-migration.js
  - Source: auto_hook | Occurrences: 1
  - **DA:** Only 1 occurrence - may be premature to make this change
```

---

## Workflow

### End-to-End Flow

```
1. Developer runs: gh pr merge 123 --merge --delete-branch
   │
   ├─→ PostToolUse hook triggers (auto-learning-capture.cjs)
   │   │
   │   ├─→ Detect merge success from command output
   │   │
   │   ├─→ Extract PR number (123)
   │   │
   │   ├─→ Query database: Is this SD/QF work?
   │   │   │
   │   │   ├─→ YES (SD/QF detected) → SKIP (existing flow handles)
   │   │   │
   │   │   └─→ NO (non-SD work) → CONTINUE
   │   │
   │   └─→ Spawn capture engine (detached process)
   │
   └─→ Learning Capture Engine runs (auto-learning-capture.js)
       │
       ├─→ Get PR metadata via gh CLI
       │
       ├─→ Classify work type from files changed
       │
       ├─→ Extract learnings from commit messages
       │
       ├─→ Create retrospective (generated_by: 'AUTO_HOOK')
       │
       ├─→ If corrective action → Create issue_pattern (source: 'auto_hook')
       │
       └─→ Output summary to console

2. Future session runs: /learn
   │
   └─→ Patterns from auto-capture appear in suggestions
```

### Timing and Performance

**Hook execution**: 10-15 seconds total
- Database queries: 2-3 seconds
- Commit message grep: 1-2 seconds
- Spawn engine: <1 second (non-blocking)

**Engine execution**: 15-30 seconds (runs in background)
- Get PR metadata: 5-10 seconds
- Classification: <1 second
- Learning extraction: 2-5 seconds
- Database inserts: 2-5 seconds

**Total user-perceived latency**: 10-15 seconds (hook only; engine runs async)

### Error Handling

**Hook failures**:
- Database unavailable → Skip auto-capture (log warning)
- PR metadata fetch fails → Skip auto-capture (log warning)
- Timeout (20s) → Gracefully exit

**Engine failures**:
- Retrospective insert fails → Log error, continue
- Pattern insert fails → Log error, continue
- Never block ship workflow

---

## Success Criteria

### Functional Requirements

- [x] Hook detects `gh pr merge` commands
- [x] Hook correctly identifies SD/QF work (skip capture)
- [x] Hook correctly identifies non-SD work (trigger capture)
- [x] Engine extracts PR metadata via `gh` CLI
- [x] Engine classifies work type from file patterns
- [x] Engine creates retrospective with `generated_by: 'AUTO_HOOK'`
- [x] Engine creates issue_pattern for corrective actions
- [x] Patterns appear in `/learn` output

### Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Detection accuracy | >95% | % of SD/QF work correctly skipped |
| False positive rate | <5% | % of SD/QF work incorrectly captured |
| Learning extraction rate | >70% | % of non-SD merges with learnings extracted |
| Retrospective quality | >60 score | Average quality_score of auto-generated retros |
| User-perceived latency | <20 seconds | Time from merge to hook completion |

### User Experience

**Before auto-capture**:
```
1. Fix DATABASE agent docs
2. /ship - PR merged
3. /learn - No new patterns (nothing to surface)
4. Learning lost ❌
```

**After auto-capture**:
```
1. Fix DATABASE agent docs
2. /ship - PR merged
   ↳ Hook: Non-SD merge detected
   ↳ Engine: Retrospective created, pattern captured
   ↳ Output: "🧠 Auto-Learning: 1 pattern captured"
3. /learn - Pattern appears automatically
4. Pattern available for future sessions ✅
```

---

## Memory-Pattern Lifecycle Closure

**SD-LEO-INFRA-MEMORY-PATTERN-LIFECYCLE-001** closes the final gap in the learning loop: when a pattern is resolved, `MEMORY.md` automatically self-heals by removing the stale warning entry.

### The Problem (Before)

```
issue_patterns.status → 'resolved'  ✓  (DB closes correctly)
MEMORY.md entry still warns about it ✗  (never pruned)
```

Memory accumulated stale warnings, wasting the 200-line session prompt budget.

### The Solution

**Tag Convention**: MEMORY.md entries that represent tracked patterns include an inline `[PAT-AUTO-XXXX]` tag in the `##` heading:

```markdown
## Gate Return Schema Must Use passed/maxScore [PAT-AUTO-0042]
- gate-result-schema.js requires {passed, score, maxScore} NOT {valid, score}
```

**Auto-Pruning Hook**: `pruneResolvedMemory()` in `helpers.js` fires inside `resolveLearningItems()` immediately after a successful `issue_patterns` UPDATE. It scans MEMORY.md for tagged headings matching the resolved pattern IDs and removes those sections.

**Event Bus**: A `PATTERN_RESOLVED` event is published on the existing event bus (`VISION_EVENTS.PATTERN_RESOLVED = 'leo.pattern_resolved'`) for future subscribers.

### Full Lifecycle Diagram

```
Pattern auto-detected (merged PR corrective action)
        ↓
issue_patterns row created (PAT-AUTO-XXXX, status='active')
        ↓
MEMORY.md entry written with [PAT-AUTO-XXXX] tag
        ↓
/learn surfaces pattern (composite score, decay weighting)
        ↓
User approves → SD created → assigned_sd_id set → status='assigned'
        ↓
SD executes full LEO LEAD→PLAN→EXEC workflow
        ↓
LEAD-FINAL-APPROVAL
  → resolveLearningItems()
      → issue_patterns.status = 'resolved'          ← DB closure (existing)
      → pruneResolvedMemory(resolvedPatternIds)       ← NEW: removes [PAT-AUTO-XXXX] sections
      → publishVisionEvent(PATTERN_RESOLVED, {...})   ← NEW: event bus notification
        ↓
MEMORY.md self-healed. No stale warnings.
```

### Fail-Safe Design

`pruneResolvedMemory()` is wrapped in `try/catch` and never throws. If MEMORY.md is missing, unreadable, or the path resolution fails, it logs a warning and the SD completes normally. Same pattern as the retro auto-population hook.

### Implementation Files

| File | Change |
|------|--------|
| `scripts/modules/handoff/executors/lead-final-approval/helpers.js` | `pruneResolvedMemory()` + hook in `resolveLearningItems()` |
| `lib/eva/event-bus/vision-events.js` | `PATTERN_RESOLVED: 'leo.pattern_resolved'` added to `VISION_EVENTS` |
| `~/.claude/projects/.../memory/MEMORY.md` | Restructured: tagging convention comment, completed-work history removed |

### MEMORY.md Rules (Post-Implementation)

- **Completed work** → NOT in MEMORY.md. Query `strategic_directives_v2 WHERE status='completed'` instead.
- **Pattern-level insights** → Tag with `[PAT-AUTO-XXXX]` when documented. Will auto-prune on resolution.
- **Session hints** (tool quirks, timeouts, preferences) → Kept without tags. Never auto-pruned.
- **Line budget**: Keep under 200 lines (system prompt hard limit).

---

## Related Documentation

### Architecture
- [Progressive Learning Format](../reference/progressive-learning-format.md) - Tiered learning strategy
- [System Overview](./aegis-system-overview.md) - Overall system architecture

### Reference
- [Retrospective Patterns](../reference/retrospective-patterns-skill-content.md) - Retrospective format
- [Database Agent Patterns](../reference/database-agent-patterns.md) - Database integration patterns

### Protocols
- [LEO Protocol v4.3.3](../03_protocols_and_standards/leo-v4.3-subagent-enforcement.md) - Current protocol version
- [Documentation Standards](../03_protocols_and_standards/documentation-standards.md) - Doc organization

### Implementation
- Hook: `scripts/hooks/auto-learning-capture.cjs`
- Engine: `scripts/auto-learning-capture.js`
- Feedback Clusterer: `lib/learning/feedback-clusterer.js` (includes quick-fix clustering)
- Ship command: `.claude/commands/ship.md` (Step 6.5)
- Hook registration: `.claude/settings.json`

---

## Quick-Fix Pattern Promotion Integration

**Enhancement (SD-LEO-ENH-QUICK-FIX-PATTERN-001)**: The feedback clusterer now integrates quick-fix data to promote recurring small issues into reusable patterns.

### Architecture Extension

```
Quick Fix Created (QF-*)
        ↓
quick_fixes table
        ↓
Feedback Clusterer (feedback-clusterer.js)
        ↓
Group by normalized title (3+ occurrences)
        ↓
Create issue_pattern (source: 'quick_fix_cluster')
        ↓
Available in /learn for future sessions
```

### Quick-Fix Clustering

**Purpose**: Detect when the same small bug appears repeatedly and elevate it to a pattern.

**Key Algorithm**:
```javascript
// lib/learning/feedback-clusterer.js lines 109-168
async function findPromotableQuickFixClusters() {
  // 1. Query quick_fixes table for recent fixes
  const quickFixes = await supabase
    .from('quick_fixes')
    .select('*')
    .in('status', ['open', 'completed'])
    .gte('created_at', windowStart);

  // 2. Group by normalized title (case-insensitive, trimmed)
  const clusters = new Map();
  for (const qf of quickFixes) {
    const normalized = qf.title.toLowerCase().trim();
    if (!clusters.has(normalized)) {
      clusters.set(normalized, []);
    }
    clusters.get(normalized).push(qf);
  }

  // 3. Promote clusters with 3+ occurrences
  const promotable = [];
  for (const [title, items] of clusters.entries()) {
    if (items.length >= THRESHOLDS.QUICK_FIX_MIN_OCCURRENCES) {
      promotable.push({
        source: 'quick_fix_cluster',
        title,
        items,
        count: items.length
      });
    }
  }

  return promotable;
}
```

**Integration Points**:
- **Source marker**: `source: 'quick_fix_cluster'` in `issue_patterns` table
- **Threshold**: 3+ occurrences (lower than other sources due to smaller LOC)
- **Source tracking**: `source_feedback_ids` contains original QF IDs

**Use Case Example**:
```
Day 1: QF-20260201-001 "Fix button onClick undefined"
Day 3: QF-20260203-004 "Fix button onclick undefined"
Day 5: QF-20260205-008 "Fix button onClick undefined"
        ↓
Clusterer detects: 3 occurrences of normalized title
        ↓
Creates: PAT-QF-001 "Recurring onClick handler issue"
        ↓
Future sessions: /learn surfaces pattern proactively
```

**Benefits**:
- Small recurring bugs become institutional knowledge
- Reduces duplicate quick-fixes
- Enables proactive prevention in new code
- Lower threshold (3+) appropriate for quick-fix scope

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2026-02-01 | Added quick-fix clustering integration (SD-LEO-ENH-QUICK-FIX-PATTERN-001) |
| 1.0.0 | 2026-02-01 | Initial architecture documentation |

---

*This architecture documentation was created to explain the automated learning capture system added in PR #784.*
*Part of SD-LEO-SELF-IMPROVE-001D (Phase 1.5: Automated Learning Capture)*
