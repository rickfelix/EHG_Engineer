---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Learning History System - Integration Guide



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [System Components](#system-components)
  - [1. Core Infrastructure](#1-core-infrastructure)
  - [2. CLI Tools](#2-cli-tools)
  - [3. Agent Persona Integration](#3-agent-persona-integration)
- [Agent Workflows](#agent-workflows)
  - [EXEC Agent - Implementation Phase](#exec-agent---implementation-phase)
  - [PLAN Agent - Planning & Verification Phase](#plan-agent---planning-verification-phase)
  - [LEAD Agent - Strategic Planning & Approval](#lead-agent---strategic-planning-approval)
- [Automatic Retrospective Integration](#automatic-retrospective-integration)
  - [How It Works](#how-it-works)
  - [Manual Trigger](#manual-trigger)
  - [What Gets Extracted](#what-gets-extracted)
- [Database Schema](#database-schema)
  - [issue_patterns Table](#issue_patterns-table)
  - [Proven Solutions Structure](#proven-solutions-structure)
- [Search Algorithm](#search-algorithm)
- [Current Patterns (Seeded)](#current-patterns-seeded)
- [Metrics & Reporting](#metrics-reporting)
  - [Usage Statistics](#usage-statistics)
  - [Success Metrics](#success-metrics)
- [Best Practices](#best-practices)
  - [For EXEC Agent](#for-exec-agent)
  - [For PLAN Agent](#for-plan-agent)
  - [For LEAD Agent](#for-lead-agent)
  - [For All Agents](#for-all-agents)
- [Troubleshooting](#troubleshooting)
  - [Search Returns No Results](#search-returns-no-results)
  - [Pattern Not Auto-Extracted from Retro](#pattern-not-auto-extracted-from-retro)
  - [Success Rate Seems Wrong](#success-rate-seems-wrong)
- [Future Enhancements](#future-enhancements)
- [Quick Reference Card](#quick-reference-card)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, migration, schema

**Version**: 1.0
**Last Updated**: 2025-10-02
**Status**: Active

## Overview

The Learning History System provides cross-session knowledge retention through automated pattern detection, searchable issue database, and integration with all three LEO Protocol agents (LEAD, PLAN, EXEC).

## System Components

### 1. Core Infrastructure

| Component | File | Purpose |
|-----------|------|---------|
| **Pattern Detection Engine** | `lib/learning/pattern-detection-engine.js` | Analyzes completed SDs for recurring issues |
| **Issue Knowledge Base** | `lib/learning/issue-knowledge-base.js` | Persistent, searchable index of all known issues |
| **Database Schema** | `database/migrations/create-issue-patterns-table.sql` | PostgreSQL table with full-text search |

### 2. CLI Tools

| Tool | Purpose | Example Usage |
|------|---------|---------------|
| **search-prior-issues.js** | Search for similar historical issues | `node scripts/search-prior-issues.js "database timeout"` |
| **record-pattern-success.js** | Record when a solution works/fails | `node scripts/record-pattern-success.js --pattern PAT-001 --sd SD-2025-001 --time 15` |
| **create-issue-pattern.js** | Manually create new pattern | `node scripts/create-issue-pattern.js --from-issue "RLS blocking access"` |
| **auto-extract-patterns-from-retro.js** | Extract patterns from retrospectives | Auto-runs after retro generation |

### 3. Agent Persona Integration

All three agents now have **issue_resolution_protocol** sections in their persona JSON files with specific workflows.

## Agent Workflows

### EXEC Agent - Implementation Phase

**Before Escalating Any Issue**:

```bash
# 1. Search for similar issues
node scripts/search-prior-issues.js "database connection timeout"

# 2. Review results - look for >80% success rate solutions
# Output shows:
#   PAT-003: RLS policy preventing access (100% success, 20min avg)
#   Solution: Add auth.uid() check to RLS policy USING clause

# 3. Apply the proven solution
# (Implement the solution exactly as documented)

# 4. Record the outcome
node scripts/record-pattern-success.js \
  --pattern PAT-003 \
  --sd SD-2025-015 \
  --time 18  # actual minutes it took

# If solution failed:
node scripts/record-pattern-success.js \
  --pattern PAT-003 \
  --sd SD-2025-015 \
  --failed
```

**Pattern Creation Threshold**: 3 occurrences

```bash
# After encountering same issue 3 times
node scripts/create-issue-pattern.js --from-issue "Vite build cache causing stale components"
```

**Integration Points**:
- Added to handoff "Key Decisions" section when patterns consulted
- Searched when reviewing "Known Issues & Risks" from incoming handoffs
- Reference format: `Referenced PAT-XXX: <summary> (Success rate: XX%)`

### PLAN Agent - Planning & Verification Phase

**When Creating PRD**:

```bash
# Search relevant categories to incorporate prevention measures
node scripts/search-prior-issues.js "authentication" --category security
node scripts/search-prior-issues.js "test coverage" --category testing
node scripts/search-prior-issues.js "deployment" --category deployment
```

Then add prevention checklist items to PRD acceptance criteria.

**When Verifying Implementation**:

```bash
# If EXEC reports an error during implementation
node scripts/search-prior-issues.js "import path error after refactor"

# If found in history 2+ times, escalate to create pattern
# PLAN creates pattern if not yet recorded
```

**Supervisor Mode Integration**:
- Before LEAD approval, search for category-specific issues
- Verify EXEC addressed known failure modes from patterns
- Confirm prevention measures are implemented

### LEAD Agent - Strategic Planning & Approval

**Pre-Approval Complexity Check**:

```bash
# Before approving any SD, search for over-engineering patterns
node scripts/search-prior-issues.js "over-engineering authentication"
node scripts/search-prior-issues.js "premature abstraction dashboard"

# Review prevention checklists:
node scripts/search-prior-issues.js --category over_engineering --list
```

**Red Flags from History**:
- Pattern shows "over-engineering" occurred 2+ times in this category
- Historical resolution time >5x original estimate
- Past SDs in category were split due to scope bloat

**Final Approval Integration**:

```bash
# Before marking SD complete
node scripts/search-prior-issues.js "<SD category>"

# Verify learnings extracted
node scripts/auto-run-subagents.js  # Includes Continuous Improvement Coach
```

## Automatic Retrospective Integration

### How It Works

1. **Retrospective Generated**:
   ```bash
   node scripts/generate-comprehensive-retrospective.js <SD_UUID>
   ```

2. **Pattern Extraction Auto-Runs**:
   - Analyzes "What Needs Improvement" items
   - Searches for similar existing patterns (>50% similarity = update, <50% = create)
   - Categorizes automatically (database, testing, build, etc.)
   - Determines severity from keywords

3. **Results Stored**:
   - New patterns created in `issue_patterns` table
   - Existing patterns updated with new occurrences
   - Prevention checklists enhanced from success patterns

### Manual Trigger

If auto-extraction fails:

```bash
node scripts/auto-extract-patterns-from-retro.js <RETROSPECTIVE_UUID>
```

### What Gets Extracted

**From "What Needs Improvement"**:
```javascript
// Example improvement item:
"Database migration failed due to foreign key type mismatch (UUID vs VARCHAR)"

// Automatic extraction:
{
  category: "database",
  severity: "medium",
  issue_summary: "Database migration failed due to foreign key type mismatch",
  proven_solutions: [{
    solution: "Verify column types before creating foreign keys",
    times_applied: 1,
    success_rate: 100,
    avg_resolution_time_minutes: 25
  }],
  prevention_checklist: [
    "Run DESCRIBE TABLE before adding constraints",
    "Check information_schema.columns for data types"
  ]
}
```

**From "Success Patterns"**:
- Added to prevention checklists
- Cross-referenced with existing patterns
- Example: "3-attempt retry strategy worked" → Added to connection pattern prevention

## Database Schema

### issue_patterns Table

```sql
CREATE TABLE issue_patterns (
  id UUID PRIMARY KEY,
  pattern_id VARCHAR(20) UNIQUE,  -- PAT-001, PAT-002
  category VARCHAR(100),           -- database, testing, etc.
  severity VARCHAR(20),            -- critical, high, medium, low
  issue_summary TEXT,              -- Searchable description
  occurrence_count INTEGER,        -- Times this issue occurred
  proven_solutions JSONB,          -- Array of solutions with success rates
  prevention_checklist JSONB,      -- How to avoid this issue
  status VARCHAR(20),              -- active, obsolete
  trend VARCHAR(20),               -- increasing, stable, decreasing
  first_seen_sd_id VARCHAR,
  last_seen_sd_id VARCHAR
);

-- Full-text search index
CREATE INDEX idx_issue_patterns_summary_trgm
  ON issue_patterns USING gin(issue_summary gin_trgm_ops);
```

### Proven Solutions Structure

```json
{
  "solution": "Add auth.uid() check to RLS policy USING clause",
  "times_applied": 5,
  "times_successful": 5,
  "success_rate": 100,
  "avg_resolution_time_minutes": 20,
  "first_used_sd_id": "uuid-here",
  "found_via_search": true
}
```

## Search Algorithm

Uses **Jaccard Similarity** for text matching:

```javascript
calculateSimilarity(query, pattern) {
  const words1 = new Set(query.split(/\s+/));
  const words2 = new Set(pattern.split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}
```

**Ranking Score**:
- Similarity: 40%
- Recency: 20%
- Success Rate: 30%
- Specificity (inverse occurrence count): 10%

**Minimum Threshold**: 15% similarity (calibrated for Jaccard algorithm)

## Current Patterns (Seeded)

| ID | Category | Issue | Success Rate | Avg Time |
|----|----------|-------|--------------|----------|
| PAT-001 | database | Schema mismatch TypeScript/Supabase | 100% | 15min |
| PAT-002 | testing | Test path errors after refactor | 100% | 10min |
| PAT-003 | security | RLS policy blocking access | 100% | 20min |
| PAT-004 | build | Server restart needed for changes | 100% | 5min |
| PAT-005 | code_structure | Component import errors | 100% | 12min |
| PAT-006 | build | Build output directory missing | 100% | 15min |
| PAT-007 | protocol | Sub-agent not triggering | 100% | 25min |
| PAT-008 | deployment | CI/CD pipeline failures | 100% | 30min |

## Metrics & Reporting

### Usage Statistics

```bash
# View all patterns
node scripts/search-prior-issues.js --list

# View statistics
node scripts/search-prior-issues.js --stats

# Sample output:
# Total Patterns: 8
# Active: 8, Obsolete: 0
# Total Occurrences: 32
# Avg Success Rate: 100%
# By Category:
#   - database: 3
#   - testing: 2
#   - security: 1
#   - build: 2
```

### Success Metrics

**Target Goals**:
- 60%+ of issues resolved via historical search (before human escalation)
- 85%+ success rate for top 10 patterns
- <15min average resolution time for known patterns
- 3+ patterns per SD category (comprehensive coverage)

**Monthly Report** (Example):
```
Issues Encountered: 47
Resolved via History: 28 (59.6%) ↑ +15% vs previous period
New Patterns Detected: 3
Patterns Resolved: 2 (moved to obsolete)
Avg Resolution Time: 14min ↓ -6min vs previous period

Top Contributing SDs:
  1. SD-UAT-020: 8 patterns updated, 92% historical resolution
  2. SD-UAT-009: 5 patterns created, 100% documentation quality
```

## Best Practices

### For EXEC Agent

1. **Always search first** - Never escalate without checking history
2. **Be specific** - "database timeout" better than "error"
3. **Record outcomes** - Success or failure, always update the pattern
4. **Create patterns at 3rd occurrence** - Don't wait longer
5. **Include in handoffs** - Reference patterns in "Key Decisions"

### For PLAN Agent

1. **Search during PRD creation** - Incorporate prevention measures
2. **Check category patterns** - Each SD category has common pitfalls
3. **Update PRD if pattern found** - Add prevention to acceptance criteria
4. **Pattern recognition** - 2+ occurrences = escalate to create pattern
5. **Verify in supervisor mode** - Ensure EXEC addressed known issues

### For LEAD Agent

1. **Pre-approval complexity check** - Search for over-engineering patterns
2. **Review prevention checklists** - Ensure PLAN didn't repeat mistakes
3. **Strategic pattern recognition** - Look for trends across SDs
4. **Final approval validation** - Confirm learnings were extracted
5. **Celebrate good failures** - Document what didn't work (prevents repeats)

### For All Agents

1. **Use descriptive searches** - Include context keywords
2. **Review top 3 results** - Don't just use first match
3. **Prefer high success rates** - >80% success = proven solution
4. **Update patterns** - Record actual resolution times
5. **Cross-reference categories** - Issues often span multiple areas

## Troubleshooting

### Search Returns No Results

**Cause**: Query too specific or minimum similarity threshold not met
**Solution**:
- Broaden search terms ("database error" instead of "PostgreSQL 14.2 connection timeout on port 5432")
- Use category flag: `--category database`
- List all patterns in category: `--list`

### Pattern Not Auto-Extracted from Retro

**Cause**: Issue description <20 characters or generic phrase
**Solution**:
- Manual creation: `node scripts/create-issue-pattern.js`
- Ensure retrospective has detailed "What Needs Improvement" items

### Success Rate Seems Wrong

**Cause**: Not recording failures, only successes
**Solution**:
- Always run `record-pattern-success.js` with `--failed` flag when solution doesn't work
- Honest recording improves future decision-making

## Future Enhancements

**Planned**:
- Dashboard widget for visual pattern browsing
- Pattern Analyzer sub-agent for automatic SD analysis
- Weekly analytics reports via email
- Integration with GitHub PR comments (suggest patterns)
- ML-based similarity scoring (beyond Jaccard)

**Under Consideration**:
- Real-time pattern suggestions in Claude Code interface
- Pattern clustering (group related issues)
- Trend forecasting (predict increasing issues)
- Cross-project pattern sharing

---

## Quick Reference Card

```bash
# SEARCH FOR ISSUES
node scripts/search-prior-issues.js "your issue description"
node scripts/search-prior-issues.js --category database --list
node scripts/search-prior-issues.js --stats

# RECORD OUTCOMES
node scripts/record-pattern-success.js --pattern PAT-001 --sd SD-2025-001 --time 15
node scripts/record-pattern-success.js --pattern PAT-001 --sd SD-2025-001 --failed

# CREATE PATTERNS
node scripts/create-issue-pattern.js --from-issue "issue description"
node scripts/create-issue-pattern.js  # Interactive mode

# EXTRACT FROM RETRO
node scripts/auto-extract-patterns-from-retro.js <RETRO_UUID>

# VIEW PATTERN DETAILS
node scripts/search-prior-issues.js --details PAT-001
```

---

**Documentation Maintained By**: Learning History System
**Questions?**: Check CLAUDE.md sections 193-448 and 450-556
**Version History**: See `lib/learning/CHANGELOG.md`
