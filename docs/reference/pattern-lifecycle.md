---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Issue Pattern Lifecycle Management



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Pattern Flow](#pattern-flow)
- [Thresholds for Auto-SD Creation](#thresholds-for-auto-sd-creation)
- [Database Tables](#database-tables)
  - [`issue_patterns`](#issue_patterns)
  - [`pattern_trigger_mapping`](#pattern_trigger_mapping)
  - [`pattern_subagent_mapping`](#pattern_subagent_mapping)
- [NPM Commands](#npm-commands)
  - [Pattern Management](#pattern-management)
  - [Pattern Maintenance](#pattern-maintenance)
  - [Pattern Ingestion](#pattern-ingestion)
- [Automation](#automation)
  - [Triggered by Retrospectives](#triggered-by-retrospectives)
  - [Weekly Maintenance](#weekly-maintenance)
- [Pattern Sources](#pattern-sources)
- [Pattern Categories](#pattern-categories)
- [Auto-Created SDs](#auto-created-sds)
  - [SD Content Includes:](#sd-content-includes)
- [Resolving Patterns](#resolving-patterns)
- [Pattern Lifecycle States](#pattern-lifecycle-states)
- [Memory-Pattern Closure (SD-LEO-INFRA-MEMORY-PATTERN-LIFECYCLE-001)](#memory-pattern-closure-sd-leo-infra-memory-pattern-lifecycle-001)
  - [MEMORY.md Tagging Convention](#memorymd-tagging-convention)
- [Gate Return Schema Must Use passed/maxScore [PAT-AUTO-0042]](#gate-return-schema-must-use-passedmaxscore-pat-auto-0042)
  - [How Auto-Pruning Works](#how-auto-pruning-works)
  - [PATTERN_RESOLVED Event](#pattern_resolved-event)
  - [MEMORY.md Rules](#memorymd-rules)
- [Best Practices](#best-practices)

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.1.0
- **Author**: DOCMON
- **Last Updated**: 2026-02-19
- **Tags**: database, testing, e2e, migration, memory, learn

## Overview

The LEO Protocol includes an intelligent pattern recognition system that tracks recurring issues, learns from retrospectives, and proactively creates Strategic Directives when patterns indicate systemic problems.

## Pattern Flow

```
Retrospective Created
        ↓
Patterns Extracted (auto-extract-patterns-from-retro.js)
        ↓
issue_patterns table updated
        ↓
Pattern Alert Check (pattern-alert-sd-creator.js)
        ↓
If thresholds exceeded → CRITICAL SD auto-created
```

## Thresholds for Auto-SD Creation

| Condition | Threshold | Result |
|-----------|-----------|--------|
| Critical severity pattern | 5+ occurrences | Auto-create CRITICAL SD |
| High severity pattern | 7+ occurrences | Auto-create CRITICAL SD |
| Increasing trend pattern | 4+ occurrences | Auto-create CRITICAL SD |

## Database Tables

### `issue_patterns`
Primary table storing recognized patterns.

| Column | Description |
|--------|-------------|
| `pattern_id` | Unique identifier (e.g., PAT-001, PAT-DB-001) |
| `category` | database, testing, security, deployment, etc. |
| `severity` | critical, high, medium, low |
| `occurrence_count` | Number of times pattern has been seen |
| `trend` | new, stable, increasing, decreasing, obsolete |
| `proven_solutions` | JSONB array of solutions that worked |
| `prevention_checklist` | JSONB array of preventive measures |
| `related_sub_agents` | Array of sub-agents that should see this pattern |
| `status` | active, resolved, obsolete |

### `pattern_trigger_mapping`
Links patterns to sub-agent triggers for proactive guidance.

### `pattern_subagent_mapping`
Associates patterns with specific sub-agents.

## NPM Commands

### Pattern Management
```bash
# View patterns and check for alerts (dry run)
npm run pattern:alert:dry

# Run pattern alerts and create SDs if needed
npm run pattern:alert

# Mark a pattern as resolved
npm run pattern:resolve PAT-XXX "Resolution notes"

# Detect stale patterns (dry run)
npm run pattern:stale:dry

# Apply staleness updates
npm run pattern:stale
```

### Pattern Maintenance
```bash
# Run full maintenance (staleness, backfill, trigger sync)
npm run pattern:maintenance

# Dry run maintenance
npm run pattern:maintenance:dry

# Backfill related_sub_agents for patterns
npm run pattern:backfill

# Sync patterns to sub-agent triggers
npm run pattern:sync
```

### Pattern Ingestion
```bash
# Ingest lessons from markdown files (dry run)
npm run pattern:ingest:dry

# Live ingestion
npm run pattern:ingest

# Extract patterns from a specific retrospective
npm run pattern:extract <retrospective_id>
```

## Automation

### Triggered by Retrospectives
Pattern alerts run automatically when:
- `generate-comprehensive-retrospective.js` completes
- `generate-retrospective.js` publishes successfully

### Weekly Maintenance
GitHub Action: `.github/workflows/pattern-maintenance-weekly.yml`
- **Schedule**: Every Sunday at 6 AM UTC
- **Actions**:
  1. Run pattern maintenance
  2. Check for stale patterns
  3. Regenerate CLAUDE.md files
  4. Create GitHub issues if stale patterns detected

## Pattern Sources

**NEW (SD-LEO-ENH-QUICK-FIX-PATTERN-001)**: Patterns can now originate from multiple sources, tracked in the `source` field.

| Source | Description | Threshold | Created By |
|--------|-------------|-----------|------------|
| `retrospective` | Extracted from SD/QF retrospectives | Varies | Retro analysis |
| `auto_hook` | Non-SD work captured by learning hooks | 1+ | Auto-learning hook |
| `quick_fix_cluster` | Recurring quick-fixes grouped by title similarity | 3+ | Feedback clusterer |
| `manual` | Manually created by users | N/A | User |

**Quick-Fix Cluster Source**:
- Tracks recurring small bugs (<50 LOC)
- Groups by normalized title (case-insensitive, trimmed)
- Lower threshold (3+) appropriate for quick-fix scope
- Source metadata includes `source_feedback_ids` with original QF IDs
- Enables pattern promotion from tactical fixes to strategic knowledge

**Integration**: `lib/learning/feedback-clusterer.js` (lines 109-207)

## Pattern Categories

| Category | Description | Related Sub-Agents |
|----------|-------------|-------------------|
| database | Schema, migrations, RLS issues | DATABASE, SECURITY |
| testing | Test failures, E2E issues | TESTING, UAT |
| security | Auth, permissions, vulnerabilities | SECURITY, DATABASE |
| deployment | CI/CD, pipeline failures | GITHUB, DEPENDENCY |
| build | Compilation, bundling errors | GITHUB, DEPENDENCY |
| performance | Speed, latency issues | PERFORMANCE |
| protocol | LEO workflow problems | RETRO, DOCMON, VALIDATION |
| code_structure | Architecture, refactoring | VALIDATION, DESIGN |

## Auto-Created SDs

When a pattern exceeds thresholds, an SD is created with:
- **Status**: `draft` (requires review before approval)
- **Priority**: `critical` (ensures immediate attention)
- **SD Key Format**: `SD-PAT-FIX-{CATEGORY}-{NUM}`
- **Metadata**: Contains pattern_id for traceability

### SD Content Includes:
- Pattern ID and statistics
- Issue summary
- Proven solutions to date
- Prevention checklist
- Acceptance criteria for resolution
- Suggested team assignment

## Resolving Patterns

When the root cause is fixed:

```bash
npm run pattern:resolve PAT-XXX "Fixed by implementing XYZ"
```

This:
1. Sets pattern status to `resolved`
2. Records resolution notes and date
3. Preserves pattern history for future reference

## Pattern Lifecycle States

```
new → stable → increasing → [AUTO-SD CREATED]
                    ↓
              decreasing → obsolete → resolved → [MEMORY PRUNED]
```

- **new**: First occurrence
- **stable**: Consistent occurrence rate
- **increasing**: Getting worse (triggers alerts at 4+)
- **decreasing**: Not seen recently (90+ days)
- **obsolete**: Not seen for extended period (180+ days)
- **resolved**: Root cause fixed; MEMORY.md entry auto-pruned (see below)

## Memory-Pattern Closure (SD-LEO-INFRA-MEMORY-PATTERN-LIFECYCLE-001)

When a pattern transitions to `resolved` via `resolveLearningItems()` at LEAD-FINAL-APPROVAL, the system automatically removes the corresponding entry from `MEMORY.md` so session-start context stays accurate.

### MEMORY.md Tagging Convention

When documenting a tracked pattern in MEMORY.md, add an inline `[PAT-AUTO-XXXX]` tag to the `##` heading:

```markdown
## Gate Return Schema Must Use passed/maxScore [PAT-AUTO-0042]
- gate-result-schema.js requires {passed, score, maxScore} NOT {valid, score}
```

### How Auto-Pruning Works

```
LEAD-FINAL-APPROVAL
  → resolveLearningItems()                   (checks metadata.source === 'learn_command')
      → issue_patterns.status = 'resolved'   (DB update)
      → pruneResolvedMemory(patternIds)       (removes [PAT-AUTO-XXXX] sections from MEMORY.md)
      → publishVisionEvent(PATTERN_RESOLVED)  (event bus: 'leo.pattern_resolved')
```

**Key properties of `pruneResolvedMemory()`:**
- Only removes sections whose `##` heading contains a matching `[PAT-AUTO-XXXX]` tag
- Untagged sections are never auto-removed
- Fail-safe: wrapped in `try/catch`, never blocks SD completion
- File: `scripts/modules/handoff/executors/lead-final-approval/helpers.js`

### PATTERN_RESOLVED Event

Subscribers can react to pattern resolution without modifying `resolveLearningItems()`:

```javascript
import { subscribeVisionEvent, VISION_EVENTS } from 'lib/eva/event-bus/vision-events.js';

subscribeVisionEvent(VISION_EVENTS.PATTERN_RESOLVED, async ({ sdKey, resolvedPatternIds, resolvedCount }) => {
  // e.g., update metrics, notify dashboard, etc.
});
```

Event name: `'leo.pattern_resolved'`

### MEMORY.md Rules

| Content type | Tag required? | Auto-pruned? |
|---|---|---|
| Tracked issue pattern | YES — `[PAT-AUTO-XXXX]` | YES — on pattern resolution |
| Session hints (prefs, timeouts) | NO | NEVER |
| Completed work history | N/A — store in DB instead | N/A |

## Best Practices

1. **Review auto-created SDs promptly** - They indicate systemic issues
2. **Update proven_solutions** when fixes work - Helps future occurrences
3. **Use prevention_checklist** during PLAN phase - Avoid known issues
4. **Tag MEMORY.md entries** with `[PAT-AUTO-XXXX]` when documenting tracked patterns
5. **Resolve patterns** when root cause is fixed — MEMORY.md self-heals automatically
6. **Run weekly maintenance** - Ensures patterns stay current
