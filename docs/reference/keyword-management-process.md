---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Sub-Agent Keyword Management Process


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [The Three-Source Problem](#the-three-source-problem)
  - [Historical Context](#historical-context)
  - [The Three Sources (Before Consolidation)](#the-three-sources-before-consolidation)
  - [The Sync Problem](#the-sync-problem)
  - [Impact](#impact)
- [Single Source of Truth Architecture](#single-source-of-truth-architecture)
  - [Design Decision (2026-01-25)](#design-decision-2026-01-25)
  - [Architecture Diagram](#architecture-diagram)
  - [Key Components](#key-components)
- [Keyword Consolidation Process](#keyword-consolidation-process)
  - [Consolidation Script: `scripts/consolidate-keywords.js`](#consolidation-script-scriptsconsolidate-keywordsjs)
  - [How It Works](#how-it-works)
  - [Running Consolidation](#running-consolidation)
- [Keyword Maintenance Procedures](#keyword-maintenance-procedures)
  - [Normal Workflow: Adding/Updating Keywords](#normal-workflow-addingupdating-keywords)
  - [Keyword Design Guidelines](#keyword-design-guidelines)
  - [Keyword Scoring Examples](#keyword-scoring-examples)
- [CLAUDE.md Regeneration](#claudemd-regeneration)
  - [When to Regenerate](#when-to-regenerate)
  - [Regeneration Command](#regeneration-command)
  - [What Gets Regenerated](#what-gets-regenerated)
  - [Keyword Flow in Generation](#keyword-flow-in-generation)
  - [Verification After Regeneration](#verification-after-regeneration)
- [Troubleshooting](#troubleshooting)
  - [Problem: Keywords Not Appearing in CLAUDE.md](#problem-keywords-not-appearing-in-claudemd)
  - [Problem: CLAUDE.md and CLAUDE_CORE.md Show Different Keywords](#problem-claudemd-and-claude_coremd-show-different-keywords)
  - [Problem: Sub-Agent Not Being Triggered](#problem-sub-agent-not-being-triggered)
  - [Problem: Keyword Conflicts Between Agents](#problem-keyword-conflicts-between-agents)
- [Related Documentation](#related-documentation)
- [Version History](#version-history)
  - [v1.0.0 (2026-01-25)](#v100-2026-01-25)

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Claude Code (Opus 4.5)
- **Last Updated**: 2026-01-25
- **Tags**: keywords, sub-agents, maintenance, single-source-of-truth, consolidation

## Overview

This document describes the keyword management system for LEO Protocol sub-agents, including the single source of truth architecture, consolidation process, and maintenance procedures.

**Related Documentation**:
- [Keyword Scoring Implementation](../summaries/implementations/keyword-scoring-implementation.md) - Technical implementation of the scoring system
- [Root Cause Agent Guide](root-cause-agent.md) - Example sub-agent documentation

## Table of Contents

1. [The Three-Source Problem](#the-three-source-problem)
2. [Single Source of Truth Architecture](#single-source-of-truth-architecture)
3. [Keyword Consolidation Process](#keyword-consolidation-process)
4. [Keyword Maintenance Procedures](#keyword-maintenance-procedures)
5. [CLAUDE.md Regeneration](#claudemd-regeneration)
6. [Troubleshooting](#troubleshooting)

---

## The Three-Source Problem

### Historical Context

**Date**: 2026-01-25
**Discovery**: 24 of 26 sub-agents had inconsistent keywords across three different sources

### The Three Sources (Before Consolidation)

| Source | Purpose | Used By | Problem |
|--------|---------|---------|---------|
| **1. lib/keyword-intent-scorer.js** | Runtime scoring engine | CLAUDE.md router | Hardcoded in code |
| **2. leo_sub_agent_triggers table** | Database trigger records | CLAUDE_CORE.md generation | Database records |
| **3. leo_sub_agents.metadata.trigger_keywords** | Metadata field | (Not actively used) | Duplicate storage |

### The Sync Problem

With three separate sources, keywords could diverge over time:

```
lib/keyword-intent-scorer.js:
  RCA: { primary: ['root cause', '5 whys'] }

leo_sub_agent_triggers table:
  RCA trigger_phrase: 'root-cause' (missing '5 whys')

leo_sub_agents.metadata.trigger_keywords:
  RCA: { primary: ['causal analysis'] } (different entirely)
```

**Result**: CLAUDE.md and CLAUDE_CORE.md showed different keywords for the same agent.

### Impact

- **User confusion**: "Why would the keywords be any different between CLAUDE.md and CLAUDE_CORE.md?"
- **Missed triggers**: Keywords in one file but not the other caused missed sub-agent invocations
- **Maintenance burden**: Three places to update whenever keywords changed
- **Drift over time**: No automated synchronization meant sources diverged

---

## Single Source of Truth Architecture

### Design Decision (2026-01-25)

**Chosen Source**: `lib/keyword-intent-scorer.js`

**Rationale**:
1. **Zero runtime latency**: No database queries during scoring
2. **Code-first philosophy**: Keywords are stable configuration, not dynamic data
3. **No synchronization needed**: Single file eliminates drift
4. **Version controlled**: Keywords tracked in git, reviewable in PRs
5. **Simple maintenance**: Edit one file, regenerate CLAUDE files

### Architecture Diagram

```
lib/keyword-intent-scorer.js (SINGLE SOURCE OF TRUTH)
         │
         ├──► Runtime keyword scoring (<1ms latency)
         │
         ├──► CLAUDE.md generation (via keyword-extractor.js)
         │       │
         │       ├─► CLAUDE.md (router)
         │       └─► CLAUDE_CORE.md (full protocol)
         │
         └──► Database sync (OPTIONAL - for visibility only)
                  └─► leo_sub_agents.metadata.trigger_keywords
```

### Key Components

#### 1. Source File: `lib/keyword-intent-scorer.js`

**Purpose**: Canonical keyword storage and runtime scoring engine

**Structure**:
```javascript
const AGENT_KEYWORDS = {
  RCA: {
    primary: [
      'root cause', 'root-cause', '5 whys', 'five whys',
      'fishbone', 'ishikawa', 'fault tree', 'causal analysis',
      'why is this happening', 'what caused this'
    ],
    secondary: [
      'debug', 'debugging', 'investigate', 'investigation',
      'diagnose', 'diagnostic', 'trace', 'tracing'
    ],
    tertiary: [
      'not working', 'broken', 'failing', 'failed',
      'error', 'bug', 'issue', 'problem'
    ]
  },
  DATABASE: { /* ... */ },
  SECURITY: { /* ... */ },
  // ... 25 more agents
};
```

**Keyword Categories**:
- **Primary** (weight: 4): Unique or highly specific to agent
- **Secondary** (weight: 2): Strong signal but not exclusive
- **Tertiary** (weight: 1): Weak signal, common across agents

#### 2. Extractor: `scripts/modules/claude-md-generator/keyword-extractor.js`

**Purpose**: Read keywords from scorer file for CLAUDE.md generation

**Key Functions**:
```javascript
// Extract AGENT_KEYWORDS from scorer file
export function extractKeywordsFromScorer()

// Flatten keywords for display (show top N)
export function flattenKeywords(keywords, limit = 10)

// Get keyword statistics
export function getKeywordStats()
```

**Usage in generation**:
```javascript
import { extractKeywordsFromScorer } from './keyword-extractor.js';

const scorerKeywords = extractKeywordsFromScorer();
const agentKeywords = scorerKeywords['RCA'];
// { primary: [...], secondary: [...], tertiary: [...] }
```

#### 3. Formatter: `scripts/modules/claude-md-generator/section-formatters.js`

**Purpose**: Format keywords for CLAUDE.md display

**Architecture Note** (lines 1-8):
```javascript
/**
 * Section Formatters for CLAUDE.md Generator
 *
 * ARCHITECTURE (2026-01-25):
 * Keywords are sourced from lib/keyword-intent-scorer.js (single source of truth).
 * This ensures CLAUDE.md and CLAUDE_CORE.md have consistent trigger keywords.
 */
```

**Key Functions**:
- `generateSubAgentSection()` - Full sub-agent documentation with keywords
- `generateTriggerQuickReference()` - Quick reference table for router

---

## Keyword Consolidation Process

### Consolidation Script: `scripts/consolidate-keywords.js`

**Purpose**: One-time merge of keywords from all three sources into scorer file

**When to Use**:
- After discovering keyword inconsistencies across sources
- When migrating from database-first to code-first keywords
- For periodic re-sync if database triggers are manually edited

### How It Works

#### Step 1: Read Current Scorer Keywords

```javascript
const scorerContent = fs.readFileSync('lib/keyword-intent-scorer.js', 'utf-8');
const match = scorerContent.match(/const AGENT_KEYWORDS = \{[\s\S]*?\n\};/);
const currentKeywords = eval('(' + match[0].replace(...) + ')');
```

#### Step 2: Query Database Sources

```javascript
// Get leo_sub_agent_triggers table
const { data: triggers } = await supabase
  .from('leo_sub_agent_triggers')
  .select('sub_agent_id, trigger_phrase');

// Get leo_sub_agents.metadata.trigger_keywords
const { data: agents } = await supabase
  .from('leo_sub_agents')
  .select('id, code, metadata')
  .eq('active', true);
```

#### Step 3: Merge Keywords

For each agent:
1. Collect all existing keywords from scorer (primary + secondary + tertiary)
2. Collect all keywords from database triggers table
3. Collect all keywords from metadata field
4. **Deduplicate**: Add only keywords not already present
5. **Categorize**:
   - Event triggers (e.g., `EXEC_IMPLEMENTATION_COMPLETE`) → primary
   - Database triggers (general keywords) → secondary
   - Metadata keywords (respect their category)

**Example**:
```javascript
// Existing in scorer
RCA: { primary: ['root cause', '5 whys'], secondary: ['debug'], tertiary: [] }

// From database triggers table
triggers: ['root-cause', 'causal analysis', 'fishbone']

// From metadata
metadata.trigger_keywords: { primary: ['what caused this'], secondary: ['investigate'] }

// MERGED RESULT
RCA: {
  primary: ['root cause', '5 whys', 'what caused this'],        // kept + metadata
  secondary: ['debug', 'investigate', 'root-cause', 'causal analysis', 'fishbone'],  // kept + DB + metadata
  tertiary: []
}
```

#### Step 4: Generate Updated Scorer File

```javascript
// Format keywords with proper indentation and escaping
let keywordsStr = 'const AGENT_KEYWORDS = {\n';
for (const [code, kw] of Object.entries(mergedKeywords)) {
  keywordsStr += `  ${code}: {\n`;
  keywordsStr += `    primary: [\n      ${kw.primary.map(k => `'${k.replace(/'/g, "\\'")}'`).join(',\n      ')}\n    ],\n`;
  keywordsStr += `    secondary: [\n      ${kw.secondary.map(...).join(',\n      ')}\n    ],\n`;
  keywordsStr += `    tertiary: [\n      ${kw.tertiary.map(...).join(',\n      ')}\n    ]\n`;
  keywordsStr += `  },\n\n`;
}
keywordsStr += '};';

// Replace AGENT_KEYWORDS block in scorer file
const newContent = scorerContent.replace(/const AGENT_KEYWORDS = \{[\s\S]*?\n\};/, keywordsStr);
fs.writeFileSync('lib/keyword-intent-scorer.js', newContent);
```

#### Step 5: Report Results

```
=== KEYWORD CONSOLIDATION ===

1. Reading current scorer file...
   Found 26 agents in scorer file

2. Reading leo_sub_agent_triggers table...
3. Reading leo_sub_agents metadata...
   Found 26 agents in database

4. Merging keywords...

   [RCA] +15 keywords: root-cause, causal analysis, fishbone...
   [DATABASE] +23 keywords: create table, alter table, add column...
   [SECURITY] +18 keywords: sql injection, xss attack, csrf vulnerability...
   ...

   Total new keywords added: 296

5. Generating updated scorer file...
   Updated lib/keyword-intent-scorer.js

=== CONSOLIDATION COMPLETE ===
Agents processed: 26
New keywords added: 296
Source of truth: lib/keyword-intent-scorer.js

Next steps:
1. Run: node scripts/generate-claude-md-from-db.js
2. Verify CLAUDE.md and CLAUDE_CORE.md have consistent keywords
```

### Running Consolidation

```bash
# One-time consolidation (when needed)
node scripts/consolidate-keywords.js

# Output shows keywords added per agent
# Then regenerate CLAUDE files
node scripts/generate-claude-md-from-db.js
```

**When to Run**:
- After discovering keyword inconsistencies
- After manual edits to database triggers (rare)
- Never needed in normal workflow (keywords maintained in code)

---

## Keyword Maintenance Procedures

### Normal Workflow: Adding/Updating Keywords

**Step 1: Edit Scorer File**

File: `lib/keyword-intent-scorer.js`

```javascript
const AGENT_KEYWORDS = {
  RCA: {
    primary: [
      'root cause',
      '5 whys',
      'NEW_PRIMARY_KEYWORD_HERE'  // ← ADD HERE
    ],
    secondary: [
      'debug',
      'NEW_SECONDARY_KEYWORD_HERE'  // ← OR HERE
    ],
    tertiary: [
      'issue',
      'NEW_TERTIARY_KEYWORD_HERE'  // ← OR HERE
    ]
  },
  // ... other agents
};
```

**Step 2: Test Locally (Optional but Recommended)**

```bash
# Run built-in test suite
node lib/keyword-intent-scorer.js --test

# Test specific query
node lib/keyword-intent-scorer.js "your test query here"
```

**Step 3: Regenerate CLAUDE Files**

```bash
node scripts/generate-claude-md-from-db.js
```

**Output**:
```
Generating modular CLAUDE files from database...
   CLAUDE.md              14.9 KB
   CLAUDE_CORE.md        101.4 KB
   CLAUDE_LEAD.md         47.6 KB
   CLAUDE_PLAN.md         80.9 KB
   CLAUDE_EXEC.md         58.0 KB

✅ All files generated successfully
```

**Step 4: Verify Changes**

```bash
# Check that new keywords appear in CLAUDE.md
grep "NEW_KEYWORD" CLAUDE.md

# Check trigger quick reference table
grep -A 2 "RCA" CLAUDE.md
```

**Step 5: Commit**

```bash
git add lib/keyword-intent-scorer.js CLAUDE*.md
git commit -m "feat(keywords): add NEW_KEYWORD to RCA agent"
```

**Complete workflow**: 3 steps (edit, regenerate, commit)

### Keyword Design Guidelines

#### Primary Keywords (Weight: 4)

**Use for**: Unique or highly specific phrases

**Examples**:
- RCA: "root cause", "5 whys", "fishbone diagram"
- DATABASE: "database migration", "rls policy", "foreign key constraint"
- SECURITY: "sql injection", "xss attack", "csrf vulnerability"

**Rules**:
- Must be highly specific to this agent
- If keyword appears, it's a strong signal
- Avoid overlap with other agents' primary keywords

#### Secondary Keywords (Weight: 2)

**Use for**: Strong signals but not exclusive

**Examples**:
- RCA: "debug", "investigate", "diagnose"
- DATABASE: "database", "schema", "table", "migration"
- SECURITY: "authentication", "authorization", "encrypt"

**Rules**:
- Common in agent's domain
- May appear in other agents' secondary/tertiary lists
- Provides context when combined with other keywords

#### Tertiary Keywords (Weight: 1)

**Use for**: Weak signals, common across many agents

**Examples**:
- RCA: "broken", "failing", "error", "bug"
- DATABASE: "data", "store", "fetch", "save"
- SECURITY: "safe", "protect", "risk"

**Rules**:
- Very common terms
- Insufficient alone for routing
- Helps break ties when combined

### Keyword Scoring Examples

```
Query: "identify the root cause of this bug"

Matches:
- RCA:
  - "root cause" (primary) = 4pts
  - "bug" (tertiary) = 1pt
  - TOTAL: 5pts (HIGH confidence)

Recommendation: TRIGGER RCA agent
```

```
Query: "create a database migration for users table"

Matches:
- DATABASE:
  - "database migration" (primary) = 4pts
  - "database" (secondary) = 2pts (phrase already matched)
  - "table" (secondary) = 2pts
  - TOTAL: 6pts (HIGH confidence)

Recommendation: TRIGGER DATABASE agent
```

---

## CLAUDE.md Regeneration

### When to Regenerate

Regenerate CLAUDE files after:
1. ✅ Editing keywords in `lib/keyword-intent-scorer.js`
2. ✅ Adding/removing/modifying sub-agents in database
3. ✅ Updating protocol sections in `leo_protocol_sections` table
4. ✅ Changing handoff templates, validation rules, or schema constraints
5. ❌ **NOT NEEDED** for code changes (only protocol/keyword changes)

### Regeneration Command

```bash
node scripts/generate-claude-md-from-db.js
```

### What Gets Regenerated

| File | Source | Purpose |
|------|--------|---------|
| **CLAUDE.md** | Database + Scorer | Context router (15KB) |
| **CLAUDE_CORE.md** | Database + Scorer | Core protocol (101KB) |
| **CLAUDE_LEAD.md** | Database + Scorer | LEAD phase operations (48KB) |
| **CLAUDE_PLAN.md** | Database + Scorer | PLAN phase operations (81KB) |
| **CLAUDE_EXEC.md** | Database + Scorer | EXEC phase operations (58KB) |

### Keyword Flow in Generation

```
lib/keyword-intent-scorer.js
         ↓
extractKeywordsFromScorer() (keyword-extractor.js)
         ↓
generateSubAgentSection() (section-formatters.js)
         ↓
CLAUDE_CORE.md (full keyword list per agent)

         AND

generateTriggerQuickReference() (section-formatters.js)
         ↓
CLAUDE.md (quick reference table, top 10 keywords + count)
```

### Verification After Regeneration

```bash
# Check keyword counts in CLAUDE.md
grep "| \`RCA\` |" CLAUDE.md
# Expected: | `RCA` | root cause, 5 whys, ... (+32 more) |

# Check full keyword list in CLAUDE_CORE.md
grep -A 5 "RCA (.*root.*cause.*agent" CLAUDE_CORE.md
# Expected: Full list of primary/secondary/tertiary keywords

# Verify consistency
diff <(grep "| \`RCA\` |" CLAUDE.md) <(grep "| \`RCA\` |" CLAUDE_CORE.md)
# Should be identical (both sourced from scorer file)
```

---

## Troubleshooting

### Problem: Keywords Not Appearing in CLAUDE.md

**Symptoms**:
- Edited `lib/keyword-intent-scorer.js`
- Ran regeneration script
- Keywords still don't appear in CLAUDE.md

**Diagnosis**:
```bash
# Check if keywords are in scorer file
grep -A 10 "RCA:" lib/keyword-intent-scorer.js

# Check if extractor reads them
node -e "import('./scripts/modules/claude-md-generator/keyword-extractor.js').then(m => console.log(m.extractKeywordsFromScorer()['RCA']))"

# Check generation log for errors
node scripts/generate-claude-md-from-db.js 2>&1 | grep -i error
```

**Solutions**:
1. Verify JSON syntax in AGENT_KEYWORDS (no trailing commas)
2. Check that agent code matches exactly (case-sensitive)
3. Ensure regeneration completed without errors
4. Clear any caches: restart terminal, re-run generation

---

### Problem: CLAUDE.md and CLAUDE_CORE.md Show Different Keywords

**Symptoms**:
- CLAUDE.md shows: `RCA: root cause, 5 whys (+10 more)`
- CLAUDE_CORE.md shows: `RCA: causal analysis, fishbone (+8 more)`

**This should NEVER happen** after 2026-01-25 consolidation.

**Diagnosis**:
```bash
# Check if both files are sourcing from scorer
grep "Keywords are sourced from lib/keyword-intent-scorer.js" scripts/modules/claude-md-generator/section-formatters.js

# Verify last generation date
head -20 CLAUDE.md CLAUDE_CORE.md | grep "Last Generated"
```

**Solutions**:
1. Run `node scripts/consolidate-keywords.js` to re-sync all sources
2. Run `node scripts/generate-claude-md-from-db.js` to regenerate
3. If still inconsistent, check for manual edits to CLAUDE files (these should NEVER be made)

---

### Problem: Sub-Agent Not Being Triggered

**Symptoms**:
- User query contains expected keywords
- Sub-agent is not proactively invoked
- No error messages

**Diagnosis**:
```bash
# Test keyword scoring directly
node lib/keyword-intent-scorer.js "your query here"

# Check if keywords are in scorer
grep -A 20 "AGENT_CODE:" lib/keyword-intent-scorer.js

# Verify CLAUDE.md has keywords
grep "AGENT_CODE" CLAUDE.md
```

**Solutions**:
1. Add missing keywords to `lib/keyword-intent-scorer.js`
2. Check keyword categorization (primary vs secondary vs tertiary)
3. Test scoring threshold: may need more specific primary keywords
4. Regenerate CLAUDE files after edits

---

### Problem: Keyword Conflicts Between Agents

**Symptoms**:
- Multiple agents have same primary keyword
- Wrong agent is triggered

**Example**:
```javascript
DOCMON: { primary: ['document'] }
API: { primary: ['document api'] }

Query: "document this api endpoint"
Result: Both match, incorrect routing
```

**Diagnosis**:
```bash
# Find keyword overlaps
node lib/keyword-intent-scorer.js "problematic query" --verbose

# Check keyword uniqueness
grep -h "primary:" lib/keyword-intent-scorer.js | sort | uniq -d
```

**Solutions**:
1. Make primary keywords more specific (multi-word phrases)
2. Move overlapping keywords to secondary/tertiary
3. Use phrase matching ("document api" not "document")
4. Adjust weights/thresholds if needed

---

## Related Documentation

- **[Keyword Scoring Implementation](../summaries/implementations/keyword-scoring-implementation.md)** - Technical implementation details, architecture evolution
- **[Root Cause Agent Guide](root-cause-agent.md)** - Example sub-agent with keyword triggers
- **[LEO Protocol v4.3](../03_protocols_and_standards/LEO_v4.2_HYBRID_SUB_AGENTS.md)** - Sub-agent invocation patterns
- **[Database Agent Patterns](database-agent-patterns.md)** - Another example sub-agent

---

## Version History

### v1.0.0 (2026-01-25)
- **Initial documentation** of keyword management process
- Documented three-source problem and consolidation solution
- Single source of truth architecture (scorer file)
- Maintenance procedures and workflows
- Troubleshooting guide
- **Context**: Created after consolidating 296 keywords across 24 agents

---

**Last Updated**: 2026-01-25
**Maintained By**: LEO Protocol Engineering Team
**Status**: Approved
