---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# LEO Learning System: How Sub-Agents Query Past Lessons



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [The Search Process (Step-by-Step)](#the-search-process-step-by-step)
  - [Example: Database Sub-Agent Dealing with RLS Issue](#example-database-sub-agent-dealing-with-rls-issue)
- [How the Search Algorithm Works](#how-the-search-algorithm-works)
  - [Location: `lib/learning/issue-knowledge-base.js`](#location-liblearningissue-knowledge-basejs)
  - [Method: **Jaccard Similarity** (Word Set Matching)](#method-jaccard-similarity-word-set-matching)
  - [What This Means:](#what-this-means)
- [What It Searches](#what-it-searches)
  - [1. **issue_patterns Table** (Primary Knowledge Base)](#1-issue_patterns-table-primary-knowledge-base)
  - [2. **retrospectives Table** (Secondary Context)](#2-retrospectives-table-secondary-context)
- [Scoring Algorithm](#scoring-algorithm)
  - [Weighted Ranking (Line 69-74):](#weighted-ranking-line-69-74)
- [Example: RLS Issue Lookup](#example-rls-issue-lookup)
  - [What Happens When DATABASE Sub-Agent Searches:](#what-happens-when-database-sub-agent-searches)
  - [Step 1: Query Database](#step-1-query-database)
  - [Step 2: Calculate Similarity for Each Pattern](#step-2-calculate-similarity-for-each-pattern)
  - [Step 3: Rank and Return Top Results](#step-3-rank-and-return-top-results)
- [Keyword Matching Intelligence](#keyword-matching-intelligence)
  - [Does It Handle Variations?](#does-it-handle-variations)
  - [Why No Stemming/Synonyms?](#why-no-stemmingsynonyms)
- [When Is It Called?](#when-is-it-called)
  - [1. **Manually via phase-preflight.js**](#1-manually-via-phase-preflightjs)
  - [2. **Manually via search-prior-issues.js**](#2-manually-via-search-prior-issuesjs)
  - [3. **Not Automatically Called** ⚠️](#3-not-automatically-called-)
- [How Knowledge Gets Populated](#how-knowledge-gets-populated)
  - [1. **Manual Seeding** (Initial)](#1-manual-seeding-initial)
  - [2. **Recording Occurrences** (Learning)](#2-recording-occurrences-learning)
  - [3. **Creating New Patterns**](#3-creating-new-patterns)
  - [4. **Extracting from Retrospectives**](#4-extracting-from-retrospectives)
- [Limitations](#limitations)
  - [1. **No Semantic Understanding** ❌](#1-no-semantic-understanding-)
  - [2. **No Fuzzy Matching** ❌](#2-no-fuzzy-matching-)
  - [3. **No Synonym Expansion** ❌](#3-no-synonym-expansion-)
  - [4. **Not Proactive** ⚠️](#4-not-proactive-)
- [Potential Improvements (Phase 2+)](#potential-improvements-phase-2)
  - [Option A: Add Synonym Dictionary](#option-a-add-synonym-dictionary)
  - [Option B: Add Stemming](#option-b-add-stemming)
  - [Option C: Full Semantic Search (Expensive)](#option-c-full-semantic-search-expensive)
- [Summary: The Current System](#summary-the-current-system)
- [Example Walkthrough: RLS Issue](#example-walkthrough-rls-issue)
- [Bottom Line](#bottom-line)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, migration

## Overview

When a sub-agent (like DATABASE) is called to solve an issue (like RLS), it queries a **lessons learned database** using **keyword-based similarity matching**, NOT semantic search.

---

## The Search Process (Step-by-Step)

### Example: Database Sub-Agent Dealing with RLS Issue

```bash
# 1. User encounters RLS policy blocking INSERT
# 2. DATABASE sub-agent is invoked
# 3. Before executing, sub-agent queries lessons learned:

node scripts/phase-preflight.js --phase EXEC --sd-id SD-XXX-001

# 4. System searches for: "RLS policy INSERT blocked"
```

---

## How the Search Algorithm Works

### Location: `lib/learning/issue-knowledge-base.js`

### Method: **Jaccard Similarity** (Word Set Matching)

```javascript
// Line 363-371 in issue-knowledge-base.js
calculateSimilarity(str1, str2) {
  const words1 = new Set(str1.split(/\s+/));  // Split into word sets
  const words2 = new Set(str2.split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;  // Jaccard coefficient
}
```

### What This Means:

**Query**: "RLS policy blocks INSERT"
- Words: `["rls", "policy", "blocks", "insert"]`

**Stored Pattern**: "RLS policy preventing anonymous INSERT operations"
- Words: `["rls", "policy", "preventing", "anonymous", "insert", "operations"]`

**Matching**:
- Intersection: `["rls", "policy", "insert"]` = 3 words
- Union: `["rls", "policy", "blocks", "insert", "preventing", "anonymous", "operations"]` = 7 words
- **Similarity: 3/7 = 42.8%**

---

## What It Searches

### 1. **issue_patterns Table** (Primary Knowledge Base)

Structure:
```sql
CREATE TABLE issue_patterns (
  pattern_id TEXT PRIMARY KEY,        -- PAT-001, PAT-002, etc.
  category TEXT,                      -- database, testing, security, etc.
  issue_summary TEXT,                 -- "RLS policy blocks INSERT"
  occurrence_count INTEGER,           -- How many times this happened
  proven_solutions JSONB,             -- Array of solutions with success rates
  prevention_checklist TEXT[],        -- "Use SERVICE_ROLE_KEY"
  severity TEXT,                      -- critical, high, medium, low
  status TEXT,                        -- active, obsolete
  trend TEXT                          -- increasing, decreasing, stable
);
```

### 2. **retrospectives Table** (Secondary Context)

Structure:
```sql
CREATE TABLE retrospectives (
  id UUID PRIMARY KEY,
  sd_id TEXT,
  title TEXT,
  learning_category TEXT,
  key_learnings TEXT[],
  success_patterns TEXT[],
  failure_patterns TEXT[],
  quality_score INTEGER,
  conducted_date TIMESTAMP
);
```

---

## Scoring Algorithm

### Weighted Ranking (Line 69-74):

```javascript
const score = (
  similarity * 0.4 +           // 40%: Word match similarity
  recency * 0.2 +              // 20%: How recent was this issue?
  successRate * 0.3 +          // 30%: How well did solutions work?
  (1 / occurrence_count) * 0.1 // 10%: Prefer specific patterns
);
```

**Why this weighting?**
- **Similarity (40%)**: Most important - is this actually the same problem?
- **Success rate (30%)**: Solutions that worked are valuable
- **Recency (20%)**: Recent issues are more relevant (newer stack)
- **Specificity (10%)**: Rare patterns are often more targeted

---

## Example: RLS Issue Lookup

### What Happens When DATABASE Sub-Agent Searches:

**Input**: "RLS policy blocks INSERT to sd_phase_handoffs"

### Step 1: Query Database
```javascript
const { data: patterns } = await supabase
  .from('issue_patterns')
  .select('*')
  .eq('category', 'database')
  .eq('status', 'active');
```

### Step 2: Calculate Similarity for Each Pattern

**Pattern PAT-004**:
```json
{
  "pattern_id": "PAT-004",
  "issue_summary": "RLS policy preventing anonymous INSERT operations",
  "category": "database",
  "occurrence_count": 12,
  "proven_solutions": [
    {
      "solution": "Use SERVICE_ROLE_KEY instead of ANON_KEY",
      "success_rate": 95,
      "times_applied": 10,
      "times_successful": 9,
      "avg_resolution_time_minutes": 8
    },
    {
      "solution": "Use Supabase CLI with service role access",
      "success_rate": 100,
      "times_applied": 2,
      "times_successful": 2,
      "avg_resolution_time_minutes": 5
    }
  ],
  "prevention_checklist": [
    "Check RLS policies before using ANON_KEY for mutations",
    "Use Supabase CLI for admin operations",
    "Document which operations require SERVICE_ROLE_KEY"
  ]
}
```

**Similarity Calculation**:
- Query words: `["rls", "policy", "blocks", "insert", "sd_phase_handoffs"]`
- Pattern words: `["rls", "policy", "preventing", "anonymous", "insert", "operations"]`
- **Intersection**: `["rls", "policy", "insert"]` = 3
- **Union**: 10 unique words
- **Similarity**: 3/10 = **30%** ✅ (above 15% threshold)

**Recency Score**: Last seen 5 days ago → exp(-5/30) = **0.85**

**Success Rate**: (9+2)/(10+2) = **91.6%**

**Overall Score**: 0.30×0.4 + 0.85×0.2 + 0.916×0.3 + 0.083×0.1 = **0.57** (High!)

### Step 3: Rank and Return Top Results

```
🎯 Found 3 similar issue(s):

1. ✅ PAT-004 [30% match, 92% success]
   Issue: RLS policy preventing anonymous INSERT operations
   Category: database | Severity: medium
   Recommendation: HIGH SUCCESS - Apply preemptively
   Solution: Use SERVICE_ROLE_KEY instead of ANON_KEY
   Avg Time: 8 min
   Prevention: Check RLS policies before using ANON_KEY for mutations

2. ⚠️  PAT-017 [22% match, 67% success]
   Issue: Supabase RLS policy blocking table access
   Category: database | Severity: high
   Recommendation: MODERATE - Be aware, prepare contingency
   ...
```

---

## Keyword Matching Intelligence

### Does It Handle Variations?

**Currently: Limited** ❌

The system uses **exact word matching**, so:

**Matches**:
- "RLS policy" = "policy RLS" ✅
- "INSERT blocked" = "blocked INSERT" ✅

**Does NOT Match**:
- "RLS" ≠ "row level security" ❌
- "INSERT" ≠ "inserting" ❌
- "authentication" ≠ "auth" ❌

### Why No Stemming/Synonyms?

1. **Simplicity**: Jaccard similarity is fast (O(n+m))
2. **Deterministic**: Same query always returns same results
3. **Good enough**: Technical terms are usually consistent

---

## When Is It Called?

### 1. **Manually via phase-preflight.js**
```bash
# Before starting EXEC phase
node scripts/phase-preflight.js --phase EXEC --sd-id SD-XXX-001

# Before planning
node scripts/phase-preflight.js --phase PLAN --sd-id SD-XXX-001
```

### 2. **Manually via search-prior-issues.js**
```bash
# Interactive search
node scripts/search-prior-issues.js "RLS policy blocks INSERT"

# Get specific pattern
node scripts/search-prior-issues.js --details PAT-004
```

### 3. **Not Automatically Called** ⚠️

Currently, sub-agents **DO NOT automatically query lessons** during execution.

**Why?** The system is designed for **human-in-loop**:
1. Human runs `phase-preflight.js` before starting
2. Reviews top patterns
3. Notes them in handoff
4. Applies solutions preemptively

---

## How Knowledge Gets Populated

### 1. **Manual Seeding** (Initial)
```bash
node scripts/seed-issue-patterns.js
```

Populates common patterns like:
- Database schema mismatches
- Test path errors
- RLS policy issues

### 2. **Recording Occurrences** (Learning)
```javascript
await kb.recordOccurrence({
  pattern_id: 'PAT-004',
  sd_id: 'SD-XXX-001',
  solution_applied: 'Used SERVICE_ROLE_KEY',
  resolution_time_minutes: 10,
  was_successful: true,
  found_via_search: true  // Did preflight help?
});
```

This updates:
- `occurrence_count` (now 13)
- `success_rate` (recalculated)
- `avg_resolution_time_minutes` (updated average)
- `last_seen_sd_id`

### 3. **Creating New Patterns**
```javascript
await kb.createPattern({
  issue_summary: 'GitHub Actions failing on Playwright install',
  category: 'ci_cd',
  severity: 'high',
  sd_id: 'SD-XXX-001',
  solution: 'Add npx playwright install-deps to workflow',
  resolution_time_minutes: 45
});
```

### 4. **Extracting from Retrospectives**
```bash
node scripts/auto-extract-patterns-from-retro.js SD-XXX-001
```

Mines retrospectives for:
- `failure_patterns` → Issue summaries
- `what_went_well` → Prevention checklists
- `lessons_learned` → Solutions

---

## Limitations

### 1. **No Semantic Understanding** ❌
- Won't match "RLS" to "row-level security"
- Won't match "INSERT" to "create record"
- Won't understand context ("rate limit" in GitHub vs API)

### 2. **No Fuzzy Matching** ❌
- "authentication" ≠ "authenticating"
- "database" ≠ "databases"

### 3. **No Synonym Expansion** ❌
- "auth" ≠ "authentication"
- "DB" ≠ "database"

### 4. **Not Proactive** ⚠️
- Sub-agents don't automatically query (yet)
- Requires manual preflight step

---

## Potential Improvements (Phase 2+)

### Option A: Add Synonym Dictionary
```javascript
const synonyms = {
  'rls': ['row level security', 'row-level', 'policy'],
  'auth': ['authentication', 'login', 'signin'],
  'db': ['database', 'supabase', 'postgres']
};
```

### Option B: Add Stemming
```javascript
import natural from 'natural';
const stemmer = natural.PorterStemmer;

// "inserting" → "insert"
// "blocked" → "block"
```

### Option C: Full Semantic Search (Expensive)
```javascript
// Use embeddings (OpenAI, sentence-transformers)
const embedding1 = await openai.embeddings.create(query);
const embedding2 = await openai.embeddings.create(pattern);
const similarity = cosineSimilarity(embedding1, embedding2);
```

**Why not now?**
- Adds API dependency (cost, latency)
- Requires vector database (pgvector)
- Keyword matching works well for technical terms

---

## Summary: The Current System

| Aspect | How It Works |
|--------|--------------|
| **Search Method** | Jaccard similarity (word set intersection/union) |
| **Query Type** | Keyword-based, exact word matching |
| **Data Source** | `issue_patterns` table + `retrospectives` table |
| **Invocation** | Manual (phase-preflight.js, search-prior-issues.js) |
| **Matching Intelligence** | None (no stemming, synonyms, or semantics) |
| **Ranking** | Weighted: 40% similarity + 30% success rate + 20% recency + 10% specificity |
| **Learning** | Manual recording via `recordOccurrence()` |
| **Threshold** | 15% minimum similarity (strict) |

---

## Example Walkthrough: RLS Issue

```
1. User: "Why can't I INSERT into sd_phase_handoffs?"

2. AI/Human runs:
   node scripts/search-prior-issues.js "INSERT blocked sd_phase_handoffs"

3. System:
   - Queries issue_patterns (category: database)
   - Calculates similarity for each pattern
   - Finds PAT-004: "RLS policy preventing anonymous INSERT" (30% match)

4. Returns:
   ✅ PAT-004 [92% success]
   Solution: Use SERVICE_ROLE_KEY instead of ANON_KEY
   Prevention: Check RLS policies before mutations
   Avg Time: 8 minutes

5. AI applies solution:
   const supabase = createClient(URL, SERVICE_ROLE_KEY);

6. Success! Record occurrence:
   await kb.recordOccurrence({
     pattern_id: 'PAT-004',
     solution_applied: 'Used SERVICE_ROLE_KEY',
     was_successful: true,
     resolution_time_minutes: 5
   });

7. Pattern updated:
   - occurrence_count: 12 → 13
   - success_rate: 92% → 92.3%
   - avg_resolution_time: 8 → 7.8 min
```

---

## Bottom Line

**The system is smart about scoring but dumb about matching.**

- ✅ **Good at**: Finding patterns when keywords match
- ✅ **Good at**: Ranking results by relevance + success
- ✅ **Good at**: Tracking what works over time
- ❌ **Bad at**: Understanding synonyms ("auth" vs "authentication")
- ❌ **Bad at**: Fuzzy matching ("inserting" vs "insert")
- ❌ **Bad at**: Semantic understanding (context-dependent terms)

**Why it still works**:
- Technical terms are consistent ("RLS", "INSERT", "migration")
- Humans write patterns with keywords developers use
- 15% threshold is forgiving enough for partial matches
- Success rates guide you to proven solutions

**Next evolution**: Add synonym expansion + stemming for 20% better recall without semantic search complexity.
