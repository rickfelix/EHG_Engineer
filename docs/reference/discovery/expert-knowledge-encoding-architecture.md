---
category: reference
status: draft
version: 1.0.0
author: Rick Felix
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Expert Knowledge Encoding Architecture


## Table of Contents

- [The Core Insight](#the-core-insight)
- [Architecture: The Expert Knowledge Layer](#architecture-the-expert-knowledge-layer)
  - [Conceptual Model](#conceptual-model)
- [Component 1: Pattern Libraries](#component-1-pattern-libraries)
  - [What Makes a Pattern?](#what-makes-a-pattern)
  - [Pattern Library Schema](#pattern-library-schema)
- [Component 2: Expert Toolboxes](#component-2-expert-toolboxes)
  - [The Toolbox Concept](#the-toolbox-concept)
  - [Toolbox Schema](#toolbox-schema)
- [Component 3: War Stories](#component-3-war-stories)
  - [Why War Stories Matter](#why-war-stories-matter)
  - [War Story Schema](#war-story-schema)
- [Component 4: Heuristic Engine](#component-4-heuristic-engine)
  - [What Are Heuristics?](#what-are-heuristics)
  - [Heuristic Schema](#heuristic-schema)
- [Applying Expert Knowledge to LEO Sub-Agents](#applying-expert-knowledge-to-leo-sub-agents)
  - [Enhanced Sub-Agent Architecture](#enhanced-sub-agent-architecture)
  - [Example: DATABASE Sub-Agent with Expert Knowledge](#example-database-sub-agent-with-expert-knowledge)
- [New Opportunity Areas Identified](#new-opportunity-areas-identified)
  - [1. LEAD Agent: Strategic Advisor Swarm](#1-lead-agent-strategic-advisor-swarm)
  - [2. PLAN Agent: Architecture Advisor Swarm](#2-plan-agent-architecture-advisor-swarm)
  - [3. EXEC Agent: Implementation Advisor Swarm](#3-exec-agent-implementation-advisor-swarm)
  - [4. User Story Generation: Persona Swarm](#4-user-story-generation-persona-swarm)
  - [5. Code Review: Multi-Lens Review Swarm](#5-code-review-multi-lens-review-swarm)
  - [6. Handoff Validation: Compliance Swarm](#6-handoff-validation-compliance-swarm)
  - [7. Documentation: Technical Writing Swarm](#7-documentation-technical-writing-swarm)
- [Implementation: Knowledge Acquisition Pipeline](#implementation-knowledge-acquisition-pipeline)
  - [Source 1: Retrospective Mining](#source-1-retrospective-mining)
  - [Source 2: Issue Pattern Mining](#source-2-issue-pattern-mining)
  - [Source 3: External Knowledge Import](#source-3-external-knowledge-import)
  - [Source 4: LLM-Assisted Extraction](#source-4-llm-assisted-extraction)
- [Expert Advisor Prompt Template](#expert-advisor-prompt-template)
- [Your Expertise Profile](#your-expertise-profile)
- [Your Active Toolbox: GREENFIELD DESIGN](#your-active-toolbox-greenfield-design)
  - [Tools Available:](#tools-available)
  - [Relevant Patterns:](#relevant-patterns)
  - [Heuristics to Apply:](#heuristics-to-apply)
  - [War Stories to Remember:](#war-stories-to-remember)
  - [Gotchas for This Context:](#gotchas-for-this-context)
- [Your Task](#your-task)
- [Output Format](#output-format)
- [Cost-Benefit Analysis](#cost-benefit-analysis)
  - [Investment](#investment)
  - [Return](#return)
  - [ROI](#roi)
- [Implementation Roadmap](#implementation-roadmap)
  - [Phase 1: Foundation (Weeks 1-2)](#phase-1-foundation-weeks-1-2)
  - [Phase 2: Integration (Weeks 3-4)](#phase-2-integration-weeks-3-4)
  - [Phase 3: Expansion (Weeks 5-6)](#phase-3-expansion-weeks-5-6)
  - [Phase 4: Swarm Integration (Week 7+)](#phase-4-swarm-integration-week-7)
- [Summary: The Vision](#summary-the-vision)
- [Data Flywheel Architecture](#data-flywheel-architecture)
  - [The Core Loop](#the-core-loop)
  - [Data Capture Points](#data-capture-points)
  - [Flywheel Metrics Dashboard](#flywheel-metrics-dashboard)
  - [Automatic Pattern Refinement](#automatic-pattern-refinement)
  - [Human-in-the-Loop Feedback Capture](#human-in-the-loop-feedback-capture)
- [Iterative Improvement Process](#iterative-improvement-process)
  - [The Improvement Cycle](#the-improvement-cycle)
  - [Pattern Lifecycle Management](#pattern-lifecycle-management)
  - [Heuristic Confidence Adjustment](#heuristic-confidence-adjustment)
  - [War Story Auto-Generation](#war-story-auto-generation)
  - [Continuous Improvement Metrics](#continuous-improvement-metrics)
- [Dynamic Agent & Team Templates](#dynamic-agent-team-templates)
  - [The Meta-Agent Problem](#the-meta-agent-problem)
  - [Agent Template Schema](#agent-template-schema)
  - [Template Types](#template-types)
  - [Dynamic Agent Generation](#dynamic-agent-generation)
  - [Team Composition Templates](#team-composition-templates)
  - [Example: Generating a New "Compliance" Agent Team](#example-generating-a-new-compliance-agent-team)
  - [Self-Bootstrapping for New Domains](#self-bootstrapping-for-new-domains)
- [Related Documents](#related-documents)
- [Changelog](#changelog)

**Created**: 2026-02-02
**Status**: Conceptual Design (High Priority for LEO Evolution)
**Insight Origin**: User observation that expertise isn't just experience - it's tips, tricks, toolboxes, and situational awareness

## The Core Insight

A 25-year database expert isn't valuable because they've "seen a lot." They're valuable because they've **compressed that experience into:**

1. **Pattern Libraries** - "When I see X, I do Y"
2. **Heuristics** - Rules of thumb that work 80%+ of the time
3. **Anti-Patterns** - Hard-won knowledge of what NOT to do
4. **Toolboxes** - Scenario-specific solution sets
5. **War Stories** - Real incidents that shaped intuition
6. **Mental Models** - Frameworks for reasoning about problems
7. **Smell Detection** - "Something's off here" intuition

**Current LEO agents lack this.** They have general capability but no encoded expertise.

---

## Architecture: The Expert Knowledge Layer

### Conceptual Model

```
                    ┌─────────────────────────────────┐
                    │     EXPERT KNOWLEDGE LAYER      │
                    │  (Encoded Tacit Knowledge)      │
                    └─────────────────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ PATTERN LIBRARY │    │    TOOLBOXES    │    │   WAR STORIES   │
│                 │    │                 │    │                 │
│ • Problem signs │    │ • Scenario sets │    │ • Real incidents│
│ • Solution temp │    │ • Tool chains   │    │ • Root causes   │
│ • Anti-patterns │    │ • Decision tree │    │ • Resolutions   │
│ • Gotchas       │    │ • Heuristics    │    │ • Lessons       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                         │                         │
         └─────────────────────────┼─────────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────┐
                    │         SUB-AGENT SWARM         │
                    │   (Applies knowledge to task)   │
                    └─────────────────────────────────┘
```

---

## Component 1: Pattern Libraries

### What Makes a Pattern?

A pattern isn't just "how to do X." A 25-year expert's pattern includes:

```yaml
pattern:
  id: PAT-DB-NORM-001
  name: "When to Denormalize for Read Performance"
  domain: database

  # When to recognize this pattern applies
  problem_signature:
    - "Query joins 4+ tables"
    - "Read:Write ratio > 100:1"
    - "P95 latency exceeds SLA"
    - "Same join pattern in 5+ queries"

  # The solution approach
  solution_template:
    approach: "Create materialized view or denormalized table"
    steps:
      - "Identify the stable join pattern"
      - "Create materialized view with refresh strategy"
      - "Add index on common filter columns"
      - "Redirect queries to materialized view"
      - "Monitor refresh lag vs query freshness needs"

  # What NOT to do
  anti_patterns:
    - "Don't denormalize if write frequency is high"
    - "Don't denormalize without refresh strategy"
    - "Don't duplicate without considering storage costs"

  # Edge cases the expert knows
  gotchas:
    - "Materialized views can't be refreshed concurrently in some DBs"
    - "Refresh lag can cause stale data in financial contexts"
    - "Consider partial indexes instead for simple cases"

  # When this pattern DOESN'T apply
  exclusions:
    - "OLTP systems with high write frequency"
    - "Data that changes faster than refresh interval"
    - "When query planner can use covering index"

  # Heuristics (rules of thumb)
  heuristics:
    - "If refresh can be async and lag < 5 min is OK, materialized view"
    - "If real-time needed, consider caching layer instead"
    - "Storage cost < 10% of compute savings = worth it"
```

### Pattern Library Schema

```sql
CREATE TABLE expert_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id TEXT UNIQUE NOT NULL,  -- PAT-DB-NORM-001
  domain TEXT NOT NULL,              -- database, testing, security, design
  subdomain TEXT,                    -- normalization, indexing, rls
  name TEXT NOT NULL,
  description TEXT,

  -- Pattern recognition
  problem_signature JSONB NOT NULL,  -- Array of signals that this applies
  confidence_threshold INTEGER DEFAULT 3,  -- Min signals to trigger

  -- Solution guidance
  solution_template JSONB NOT NULL,
  anti_patterns JSONB DEFAULT '[]',
  gotchas JSONB DEFAULT '[]',
  exclusions JSONB DEFAULT '[]',
  heuristics JSONB DEFAULT '[]',

  -- Metadata
  expertise_level TEXT DEFAULT 'senior',  -- junior, senior, principal
  source TEXT,                            -- Who contributed this pattern
  times_applied INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for pattern matching
CREATE INDEX idx_expert_patterns_domain ON expert_patterns(domain, subdomain);
CREATE INDEX idx_expert_patterns_signature ON expert_patterns USING GIN (problem_signature);
```

---

## Component 2: Expert Toolboxes

### The Toolbox Concept

A 25-year expert doesn't just know patterns - they have **scenario-specific toolboxes**:

```
DATABASE EXPERT'S TOOLBOXES
│
├── 🧰 GREENFIELD DESIGN TOOLBOX
│   │   "Starting a new schema from scratch"
│   │
│   ├── Tool: Entity-Relationship Diagramming
│   ├── Tool: Normalization Checklist (1NF → 3NF → BCNF)
│   ├── Tool: Naming Convention Template
│   ├── Tool: Data Type Selection Guide
│   ├── Tool: Constraint Design Patterns
│   └── Heuristic: "Start normalized, denormalize with evidence"
│
├── 🧰 MIGRATION TOOLBOX
│   │   "Evolving an existing schema safely"
│   │
│   ├── Tool: Zero-Downtime Migration Patterns
│   ├── Tool: Rollback Strategy Template
│   ├── Tool: Data Backfill Scripts
│   ├── Tool: Constraint Addition Sequence
│   └── Heuristic: "Always add nullable first, then backfill, then add constraint"
│
├── 🧰 PERFORMANCE TOOLBOX
│   │   "Diagnosing and fixing slow queries"
│   │
│   ├── Tool: EXPLAIN ANALYZE Interpretation Guide
│   ├── Tool: Index Selection Decision Tree
│   ├── Tool: Query Rewrite Patterns
│   ├── Tool: Connection Pool Sizing Calculator
│   └── Heuristic: "Check sequential scans first, then lock contention"
│
├── 🧰 INCIDENT RESPONSE TOOLBOX
│   │   "Database is on fire"
│   │
│   ├── Tool: Emergency Query Killer
│   ├── Tool: Lock Investigation Queries
│   ├── Tool: Connection Surge Diagnosis
│   ├── Tool: Replication Lag Triage
│   └── Heuristic: "First rule: stop the bleeding, then investigate"
│
└── 🧰 SECURITY TOOLBOX
    │   "Locking down data access"
    │
    ├── Tool: RLS Policy Templates
    ├── Tool: Role Permission Matrix
    ├── Tool: Audit Logging Patterns
    ├── Tool: Encryption-at-Rest Checklist
    └── Heuristic: "Default deny, explicit grant, audit everything"
```

### Toolbox Schema

```sql
CREATE TABLE expert_toolboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  toolbox_id TEXT UNIQUE NOT NULL,
  domain TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  -- When to use this toolbox
  scenario_triggers JSONB NOT NULL,  -- Situations that activate this toolbox

  -- Tools in the toolbox
  tools JSONB NOT NULL,  -- Array of tool definitions

  -- Quick heuristics for this scenario
  heuristics JSONB DEFAULT '[]',

  -- Decision tree for tool selection
  decision_tree JSONB,

  -- Prerequisites
  requires_context JSONB DEFAULT '[]',  -- What info needed to use toolbox

  expertise_level TEXT DEFAULT 'senior',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE toolbox_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  toolbox_id UUID REFERENCES expert_toolboxes(id),
  tool_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  -- How to apply this tool
  application_guide JSONB NOT NULL,

  -- Templates/scripts if applicable
  templates JSONB DEFAULT '[]',

  -- When NOT to use
  contraindications JSONB DEFAULT '[]',

  -- Order in toolbox
  sequence_order INTEGER DEFAULT 0,

  UNIQUE(toolbox_id, tool_id)
);
```

---

## Component 3: War Stories

### Why War Stories Matter

War stories aren't just anecdotes - they're **compressed experience**:

- "I've seen this exact situation before"
- "The last time this happened, we discovered..."
- "Don't do X because in 2019 we..."

```yaml
war_story:
  id: WAR-DB-2024-001
  title: "The N+1 Query That Took Down Production"
  domain: database

  # The situation
  context:
    system: "User dashboard with activity feed"
    scale: "50K concurrent users"
    symptoms:
      - "Database CPU at 100%"
      - "API response times > 30s"
      - "Connection pool exhausted"

  # What happened
  incident:
    trigger: "New feature deployment with activity feed"
    root_cause: "N+1 query loading user avatars for each activity"
    query_pattern: "SELECT * FROM users WHERE id = ? (x 1000 per page)"
    impact: "2 hour outage, $50K revenue loss"

  # How it was found
  investigation:
    first_clue: "pg_stat_statements showed 10M queries/minute to users table"
    key_insight: "All queries were identical structure, different IDs"
    time_to_identify: "45 minutes"

  # The fix
  resolution:
    immediate: "Killed runaway queries, added circuit breaker"
    permanent: "Batch query with WHERE id IN (...), added DataLoader"
    prevention: "Added N+1 detection to CI pipeline"

  # What to look for next time
  warning_signs:
    - "Query count growing linearly with result set size"
    - "Same query pattern repeated in logs"
    - "ORM without eager loading on relationships"

  # The lesson
  lessons:
    - "Always check query patterns in development with realistic data"
    - "ORMs hide N+1 patterns - use query logging"
    - "Add batch size limits to prevent runaway queries"
```

### War Story Schema

```sql
CREATE TABLE expert_war_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id TEXT UNIQUE NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,

  -- The situation
  context JSONB NOT NULL,
  symptoms JSONB NOT NULL,

  -- What happened
  incident JSONB NOT NULL,
  root_cause TEXT NOT NULL,
  impact TEXT,

  -- Investigation path
  investigation JSONB,

  -- Resolution
  resolution JSONB NOT NULL,

  -- Lessons
  warning_signs JSONB DEFAULT '[]',
  lessons JSONB DEFAULT '[]',

  -- Metadata
  severity TEXT DEFAULT 'high',
  date_occurred DATE,
  source TEXT,  -- Anonymized source

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable similarity search on symptoms
CREATE INDEX idx_war_stories_symptoms ON expert_war_stories USING GIN (symptoms);
CREATE INDEX idx_war_stories_domain ON expert_war_stories(domain);
```

---

## Component 4: Heuristic Engine

### What Are Heuristics?

Heuristics are **compressed decision-making** - rules that work 80%+ of the time:

```yaml
# Database Heuristics
heuristics:
  - id: HEU-DB-001
    domain: database
    rule: "If joining more than 3 tables in a common query, consider denormalizing"
    confidence: 85%
    exceptions:
      - "When write frequency is high"
      - "When data changes faster than acceptable staleness"
    source: "25 years of schema optimization"

  - id: HEU-DB-002
    domain: database
    rule: "Always index foreign keys by default"
    confidence: 95%
    exceptions:
      - "When table is append-only and never queried by FK"
    source: "Standard PostgreSQL best practice"

  - id: HEU-DB-003
    domain: database
    rule: "Add columns as nullable first, backfill, then add NOT NULL"
    confidence: 99%
    exceptions:
      - "When table is empty"
    source: "Zero-downtime migration pattern"

# Testing Heuristics
  - id: HEU-TEST-001
    domain: testing
    rule: "If a bug was found in production, write a regression test BEFORE fixing"
    confidence: 100%
    exceptions: []
    source: "TDD wisdom"

  - id: HEU-TEST-002
    domain: testing
    rule: "Mock external services, don't mock your own code"
    confidence: 90%
    exceptions:
      - "When testing error handling of your own components"
    source: "Testing best practices"

# Design Heuristics
  - id: HEU-DESIGN-001
    domain: design
    rule: "If a component needs more than 5 props, it's doing too much"
    confidence: 80%
    exceptions:
      - "Form components with many fields"
      - "Data visualization components"
    source: "React component design"

  - id: HEU-DESIGN-002
    domain: design
    rule: "If you can't explain the UI state in one sentence, simplify"
    confidence: 85%
    exceptions: []
    source: "UX design principles"
```

### Heuristic Schema

```sql
CREATE TABLE expert_heuristics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  heuristic_id TEXT UNIQUE NOT NULL,
  domain TEXT NOT NULL,
  subdomain TEXT,

  rule TEXT NOT NULL,
  confidence_pct INTEGER CHECK (confidence_pct BETWEEN 0 AND 100),

  exceptions JSONB DEFAULT '[]',
  rationale TEXT,
  source TEXT,

  -- When to apply
  trigger_context JSONB,

  -- Metrics
  times_applied INTEGER DEFAULT 0,
  times_overridden INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Applying Expert Knowledge to LEO Sub-Agents

### Enhanced Sub-Agent Architecture

```
                    ┌──────────────────────────────┐
                    │    EXPERT KNOWLEDGE LAYER    │
                    │  (Patterns, Toolboxes, etc.) │
                    └──────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │     KNOWLEDGE ROUTER      │
                    │  (Matches context → tools) │
                    └─────────────┬─────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  DATABASE SWARM │    │  TESTING SWARM  │    │   DESIGN SWARM  │
│                 │    │                 │    │                 │
│ Schema Architect│    │ Test Strategist │    │ UX Architect    │
│ + GREENFIELD    │    │ + UNIT TEST     │    │ + ACCESSIBILITY │
│   TOOLBOX       │    │   TOOLBOX       │    │   TOOLBOX       │
│ + Normalization │    │ + Coverage      │    │ + Component     │
│   PATTERNS      │    │   PATTERNS      │    │   PATTERNS      │
│ + N+1 WAR       │    │ + Flaky Test    │    │ + Responsive    │
│   STORIES       │    │   WAR STORIES   │    │   WAR STORIES   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Example: DATABASE Sub-Agent with Expert Knowledge

**Before (Generic)**:
```
DATABASE Agent receives: "Design schema for user activity tracking"
DATABASE Agent: *uses general knowledge to design schema*
```

**After (Expert-Enhanced)**:
```
DATABASE Agent receives: "Design schema for user activity tracking"

1. KNOWLEDGE ROUTER:
   - Detects: "new schema design" → activates GREENFIELD TOOLBOX
   - Detects: "activity tracking" → high read volume likely
   - Matches: PAT-DB-TIMESERIES-001 (time-series data pattern)

2. SCHEMA ARCHITECT (Lead) receives:
   - Active Toolbox: GREENFIELD DESIGN
   - Relevant Patterns: Time-series, Partitioning, Archival
   - Relevant War Stories: "Activity table that grew to 10B rows"
   - Heuristics: "Partition by time for time-series > 10M rows"

3. SWARM ADVISORS work with context:
   - Data Modeling Specialist: Uses time-series pattern
   - Performance Advisor: Recommends partitioning strategy
   - Storage Advisor: Calculates growth, suggests archival

4. OUTPUT includes:
   - Schema design
   - Partitioning recommendation (from pattern)
   - Archival strategy (from war story)
   - "Watch out for..." (from heuristics)
```

---

## New Opportunity Areas Identified

### 1. LEAD Agent: Strategic Advisor Swarm

**Current**: Single agent making strategic decisions
**Enhanced**: Lead with business/strategy advisors

```
LEAD AGENT SWARM
│
├── Strategy Advisor
│   └── Toolbox: Business case analysis, ROI frameworks
│   └── Patterns: When to greenfield vs iterate
│
├── Prioritization Advisor
│   └── Toolbox: ICE scoring, RICE framework, MoSCoW
│   └── Patterns: Priority inversion detection
│
├── Scope Advisor
│   └── Toolbox: Scope creep detection, MVP definition
│   └── War Stories: "The feature that never shipped"
│
└── Risk Advisor
    └── Toolbox: Risk matrices, mitigation strategies
    └── Patterns: When to ask for more info vs decide
```

### 2. PLAN Agent: Architecture Advisor Swarm

**Current**: Single agent creating PRDs
**Enhanced**: Plan with architecture specialists

```
PLAN AGENT SWARM
│
├── Decomposition Advisor
│   └── Toolbox: Task breakdown patterns
│   └── Heuristics: "If LOC > 400, decompose further"
│
├── Dependency Advisor
│   └── Toolbox: Dependency mapping, critical path
│   └── Patterns: Parallelization opportunities
│
├── Technical Writing Advisor
│   └── Toolbox: PRD templates, acceptance criteria
│   └── Patterns: Unambiguous requirement writing
│
└── Estimation Advisor
    └── Toolbox: Story pointing, complexity assessment
    └── War Stories: "The 2-point story that took 2 weeks"
```

### 3. EXEC Agent: Implementation Advisor Swarm

**Current**: Single agent implementing
**Enhanced**: EXEC with coding specialists

```
EXEC AGENT SWARM
│
├── Code Quality Advisor
│   └── Toolbox: SOLID principles, code smells
│   └── Patterns: Refactoring decision tree
│
├── Error Handling Advisor
│   └── Toolbox: Error classification, recovery patterns
│   └── War Stories: "Silent failures in production"
│
├── Performance Advisor
│   └── Toolbox: Complexity analysis, caching patterns
│   └── Heuristics: "Premature optimization rules"
│
└── Security Advisor
    └── Toolbox: Input validation, injection prevention
    └── Patterns: OWASP Top 10 prevention
```

### 4. User Story Generation: Persona Swarm

**Current**: Stories generated from PRD
**Enhanced**: Persona specialists craft stories

```
STORY GENERATION SWARM
│
├── End User Persona
│   └── Focus: Daily workflow, friction points
│   └── Toolbox: User journey mapping
│
├── Power User Persona
│   └── Focus: Efficiency, shortcuts, edge cases
│   └── Toolbox: Feature depth analysis
│
├── Admin Persona
│   └── Focus: Configuration, monitoring, control
│   └── Toolbox: Admin capability checklist
│
├── New User Persona
│   └── Focus: Onboarding, discoverability
│   └── Toolbox: First-time experience patterns
│
└── Accessibility Persona
    └── Focus: Screen readers, keyboard nav, cognitive load
    └── Toolbox: WCAG compliance checklist
```

### 5. Code Review: Multi-Lens Review Swarm

**Current**: Single review pass
**Enhanced**: Specialized reviewers

```
CODE REVIEW SWARM
│
├── Correctness Reviewer
│   └── Focus: Logic errors, edge cases, off-by-ones
│   └── Patterns: Common bug patterns by language
│
├── Security Reviewer
│   └── Focus: Vulnerabilities, injection, auth bypasses
│   └── Toolbox: Security code review checklist
│
├── Performance Reviewer
│   └── Focus: Complexity, memory, query patterns
│   └── Patterns: N+1, unbounded loops, memory leaks
│
├── Maintainability Reviewer
│   └── Focus: Readability, naming, structure
│   └── Heuristics: "If you need a comment, rename instead"
│
└── Test Coverage Reviewer
    └── Focus: Missing tests, test quality
    └── Patterns: What to test vs not test
```

### 6. Handoff Validation: Compliance Swarm

**Current**: Gate validators run sequentially
**Enhanced**: Specialist validators

```
HANDOFF VALIDATION SWARM
│
├── Completeness Validator
│   └── Focus: Required fields, missing context
│   └── Toolbox: Checklist by handoff type
│
├── Quality Validator
│   └── Focus: Content quality, clarity, actionability
│   └── Patterns: Ambiguity detection
│
├── Dependency Validator
│   └── Focus: Prerequisite completion, blockers
│   └── Toolbox: Dependency resolution
│
└── Regression Validator
    └── Focus: What might break, affected areas
    └── War Stories: Previous handoff failures
```

### 7. Documentation: Technical Writing Swarm

**Current**: DOCMON checks docs exist
**Enhanced**: Writing specialists

```
DOCUMENTATION SWARM
│
├── API Doc Writer
│   └── Toolbox: OpenAPI patterns, example generation
│   └── Patterns: Good vs bad API docs
│
├── Architecture Doc Writer
│   └── Toolbox: C4 diagrams, decision records
│   └── Patterns: Living documentation
│
├── User Guide Writer
│   └── Toolbox: Task-oriented writing, screenshots
│   └── Heuristics: "Write for the 3am reader"
│
└── Runbook Writer
    └── Toolbox: Ops playbooks, incident response
    └── War Stories: "The runbook that saved us"
```

---

## Implementation: Knowledge Acquisition Pipeline

How do we BUILD this expert knowledge layer?

### Source 1: Retrospective Mining

```sql
-- Extract patterns from successful retrospectives
SELECT
  r.domain,
  r.lessons_learned,
  r.action_items,
  COUNT(*) as occurrences
FROM retrospectives r
WHERE r.outcome = 'successful'
GROUP BY r.domain, r.lessons_learned, r.action_items
HAVING COUNT(*) >= 3  -- Pattern appears 3+ times
```

### Source 2: Issue Pattern Mining

```sql
-- Extract patterns from recurring issues
SELECT
  ip.category,
  ip.root_cause_pattern,
  ip.resolution_pattern,
  ip.prevention_pattern,
  ip.occurrence_count
FROM issue_patterns ip
WHERE ip.occurrence_count >= 2
ORDER BY ip.occurrence_count DESC
```

### Source 3: External Knowledge Import

- PostgreSQL best practices documentation
- OWASP security guidelines
- React/Next.js patterns from docs
- Industry incident post-mortems (anonymized)

### Source 4: LLM-Assisted Extraction

```python
# Prompt for extracting heuristics from documentation
prompt = """
Analyze this documentation and extract:
1. Rules of thumb (heuristics) with confidence levels
2. Anti-patterns (what NOT to do)
3. Decision criteria (when to use approach A vs B)
4. Edge cases and gotchas

Format as structured YAML with:
- rule: The heuristic statement
- confidence: Percentage (how often this is true)
- exceptions: When this doesn't apply
- source: Where this came from
"""
```

---

## Expert Advisor Prompt Template

Here's how an expert-enhanced advisor would be prompted:

```markdown
You are the **Schema Design Specialist** in the DATABASE sub-agent swarm.

## Your Expertise Profile
You have 25 years of database design experience. You've designed schemas for:
- High-traffic OLTP systems (10K+ TPS)
- Analytics data warehouses (PB-scale)
- Multi-tenant SaaS platforms

## Your Active Toolbox: GREENFIELD DESIGN
You're using this toolbox because: New schema design detected

### Tools Available:
1. **Normalization Checklist** - 1NF → 3NF → BCNF progression
2. **Data Type Selection Guide** - Optimal types for each use case
3. **Naming Convention Template** - snake_case, singular tables
4. **Constraint Design Patterns** - FK, CHECK, UNIQUE patterns

### Relevant Patterns:
- PAT-DB-TIMESERIES-001: Time-series data needs partitioning
- PAT-DB-AUDIT-001: Audit tables need created_at, updated_at, created_by
- PAT-DB-SOFT-DELETE-001: Soft delete patterns for recoverable data

### Heuristics to Apply:
- "Start normalized, denormalize with evidence" (95% confidence)
- "Every table needs a UUID primary key" (90% confidence)
- "Add indexes after observing query patterns, not before" (85% confidence)

### War Stories to Remember:
- WAR-DB-2024-001: N+1 query incident - check for eager loading needs
- WAR-DB-2023-005: 10B row table - consider partitioning for growth

### Gotchas for This Context:
- Supabase adds RLS - design with row-level security in mind
- UUID v7 is better than v4 for time-ordered data

## Your Task
Design the schema for: {task_description}

## Output Format
Provide:
1. Schema design with reasoning
2. Which patterns you applied and why
3. Which heuristics guided your decisions
4. Potential gotchas for this specific design
5. Growth considerations (1 year, 5 year projections)
```

---

## Cost-Benefit Analysis

### Investment

| Component | Effort | Ongoing Cost |
|-----------|--------|--------------|
| Pattern Library (initial 50) | 2 weeks | Maintenance |
| Toolbox System (10 toolboxes) | 1 week | Updates |
| War Story Collection (20 stories) | 1 week | Additions |
| Heuristic Engine (100 rules) | 1 week | Refinement |
| Knowledge Router | 2 weeks | Tuning |
| **Total** | **7 weeks** | Low |

### Return

| Benefit | Impact |
|---------|--------|
| Fewer design mistakes | -50% rework |
| Faster decisions | -30% decision time |
| Consistent quality | +40% first-pass approval |
| Knowledge retention | Institutional memory |
| Onboarding acceleration | New agents inherit expertise |

### ROI

```
Investment: 7 weeks of engineering
Return: 50% reduction in rework, 40% quality improvement
Payback period: ~3 months
Long-term ROI: 5x+ (knowledge compounds)
```

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Create expert_patterns table
- [ ] Create expert_toolboxes table
- [ ] Create expert_war_stories table
- [ ] Create expert_heuristics table
- [ ] Seed with 10 patterns per domain (DATABASE, TESTING, DESIGN)

### Phase 2: Integration (Weeks 3-4)
- [ ] Build Knowledge Router service
- [ ] Integrate with DATABASE sub-agent first
- [ ] Create expert-enhanced prompts
- [ ] Test on real SDs

### Phase 3: Expansion (Weeks 5-6)
- [ ] Add TESTING sub-agent expert knowledge
- [ ] Add DESIGN sub-agent expert knowledge
- [ ] Add RCA sub-agent expert knowledge
- [ ] Mine retrospectives for patterns

### Phase 4: Swarm Integration (Week 7+)
- [ ] Combine with hierarchical swarm architecture
- [ ] Each swarm advisor gets relevant expert knowledge
- [ ] Knowledge becomes shared context for swarm

---

## Summary: The Vision

**Today**: Sub-agents are generalists with broad capability but no institutional memory

**Tomorrow**: Sub-agents are **expert systems** with:
- 📚 **Pattern Libraries** - "I've seen this 100 times"
- 🧰 **Toolboxes** - Right tools for each scenario
- 📖 **War Stories** - Learned from real incidents
- 💡 **Heuristics** - 80/20 rules that work
- 🎯 **Situational Awareness** - Know which tool to reach for

**Combined with Swarms**: Each swarm advisor carries relevant expertise, creating agents that reason like 25-year veterans in their domain.

---

## Data Flywheel Architecture

### The Core Loop

Expert knowledge is only valuable if it **improves over time**. We need a data flywheel that:

1. **Captures** - Records outcomes from every agent action
2. **Measures** - Tracks what worked vs. what didn't
3. **Learns** - Extracts new patterns from outcomes
4. **Refines** - Updates existing knowledge with new evidence
5. **Distributes** - Propagates learnings to all agents

```
                    ┌─────────────────┐
                    │   AGENT ACTION  │
                    │ (Uses patterns, │
                    │  toolboxes, etc)│
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  OUTCOME CAPTURE│
                    │ • Success/Fail  │
                    │ • Time taken    │
                    │ • Human feedback│
                    │ • Rework needed │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ PATTERN SCORING │ │HEURISTIC TUNING │ │ WAR STORY GEN   │
│                 │ │                 │ │                 │
│ • Confirm/deny  │ │ • Adjust conf%  │ │ • New incidents │
│ • Add gotchas   │ │ • Add exceptions│ │ • Root causes   │
│ • Refine signals│ │ • Retire rules  │ │ • Lessons       │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ KNOWLEDGE UPDATE│
                    │ (Versioned,     │
                    │  auditable)     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ DISTRIBUTE TO   │
                    │ ALL AGENTS      │
                    └─────────────────┘
                             │
                             └──────────► (Back to AGENT ACTION)
```

### Data Capture Points

Every agent interaction should capture:

```sql
CREATE TABLE agent_action_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What happened
  agent_type TEXT NOT NULL,           -- database, testing, design, etc.
  action_type TEXT NOT NULL,          -- schema_design, test_generation, etc.
  context_id UUID,                    -- SD, proposal, or task this relates to

  -- What knowledge was used
  patterns_applied JSONB DEFAULT '[]',     -- Pattern IDs used
  toolbox_used TEXT,                       -- Which toolbox was active
  heuristics_applied JSONB DEFAULT '[]',   -- Heuristic IDs applied
  war_stories_referenced JSONB DEFAULT '[]', -- War story IDs consulted

  -- The outcome
  outcome_status TEXT NOT NULL,       -- success, partial, failure, rework_needed
  outcome_details JSONB,              -- Specifics of what happened

  -- Measurements
  time_to_complete_ms INTEGER,
  tokens_used INTEGER,
  human_intervention_required BOOLEAN DEFAULT false,
  rework_cycles INTEGER DEFAULT 0,

  -- Human feedback (captured later)
  human_rating INTEGER,               -- 1-5 quality score
  human_feedback TEXT,                -- Free-form feedback
  feedback_captured_at TIMESTAMPTZ,

  -- Learning signals
  new_gotcha_discovered TEXT,         -- Did we find a new edge case?
  pattern_confirmed BOOLEAN,          -- Did the pattern work as expected?
  heuristic_exception_found TEXT,     -- Did a heuristic fail? Why?

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analysis
CREATE INDEX idx_aao_agent_type ON agent_action_outcomes(agent_type, action_type);
CREATE INDEX idx_aao_patterns ON agent_action_outcomes USING GIN (patterns_applied);
CREATE INDEX idx_aao_outcome ON agent_action_outcomes(outcome_status);
```

### Flywheel Metrics Dashboard

Track the health of the flywheel:

```sql
CREATE VIEW v_flywheel_metrics AS
SELECT
  agent_type,
  action_type,

  -- Volume
  COUNT(*) as total_actions,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as actions_last_7d,

  -- Success rates
  ROUND(100.0 * COUNT(*) FILTER (WHERE outcome_status = 'success') / COUNT(*), 2) as success_rate_pct,

  -- Pattern effectiveness
  AVG(jsonb_array_length(patterns_applied)) as avg_patterns_used,
  ROUND(100.0 * COUNT(*) FILTER (WHERE pattern_confirmed = true) /
        NULLIF(COUNT(*) FILTER (WHERE pattern_confirmed IS NOT NULL), 0), 2) as pattern_confirmation_rate,

  -- Human feedback
  AVG(human_rating) as avg_human_rating,
  COUNT(*) FILTER (WHERE human_feedback IS NOT NULL) as feedback_count,

  -- Improvement signals
  COUNT(*) FILTER (WHERE new_gotcha_discovered IS NOT NULL) as gotchas_discovered,
  COUNT(*) FILTER (WHERE heuristic_exception_found IS NOT NULL) as heuristic_exceptions,

  -- Efficiency
  AVG(time_to_complete_ms) as avg_time_ms,
  AVG(rework_cycles) as avg_rework_cycles

FROM agent_action_outcomes
GROUP BY agent_type, action_type;
```

### Automatic Pattern Refinement

When enough data accumulates, automatically refine patterns:

```sql
-- Function to propose pattern updates based on outcomes
CREATE OR REPLACE FUNCTION propose_pattern_updates()
RETURNS TABLE (
  pattern_id TEXT,
  update_type TEXT,
  proposal JSONB,
  evidence_count INTEGER,
  confidence DECIMAL
) AS $$
BEGIN
  -- Propose new gotchas when same issue appears 3+ times
  RETURN QUERY
  SELECT
    p.pattern_id,
    'add_gotcha'::TEXT as update_type,
    jsonb_build_object('gotcha', aao.new_gotcha_discovered) as proposal,
    COUNT(*)::INTEGER as evidence_count,
    0.8::DECIMAL as confidence
  FROM agent_action_outcomes aao
  JOIN expert_patterns p ON p.pattern_id = ANY(
    SELECT jsonb_array_elements_text(aao.patterns_applied)
  )
  WHERE aao.new_gotcha_discovered IS NOT NULL
  GROUP BY p.pattern_id, aao.new_gotcha_discovered
  HAVING COUNT(*) >= 3;

  -- Propose heuristic confidence adjustments
  RETURN QUERY
  SELECT
    h.heuristic_id as pattern_id,
    'adjust_confidence'::TEXT as update_type,
    jsonb_build_object(
      'current_confidence', h.confidence_pct,
      'observed_success_rate', ROUND(100.0 *
        COUNT(*) FILTER (WHERE aao.outcome_status = 'success') / COUNT(*))
    ) as proposal,
    COUNT(*)::INTEGER as evidence_count,
    0.7::DECIMAL as confidence
  FROM agent_action_outcomes aao
  JOIN expert_heuristics h ON h.heuristic_id = ANY(
    SELECT jsonb_array_elements_text(aao.heuristics_applied)
  )
  GROUP BY h.heuristic_id, h.confidence_pct
  HAVING COUNT(*) >= 10
    AND ABS(h.confidence_pct - ROUND(100.0 *
        COUNT(*) FILTER (WHERE aao.outcome_status = 'success') / COUNT(*))) > 10;
END;
$$ LANGUAGE plpgsql;
```

### Human-in-the-Loop Feedback Capture

```yaml
# Feedback capture points in the workflow
feedback_capture:
  - trigger: "SD completion"
    questions:
      - "Did the agent's recommendations help? (1-5)"
      - "What would have made this better?"
      - "Any surprises or edge cases we missed?"

  - trigger: "Rework detected"
    questions:
      - "What required rework?"
      - "Could the agent have predicted this?"
      - "What pattern should we add?"

  - trigger: "Pattern override"
    questions:
      - "Why did you override the pattern recommendation?"
      - "Should this become an exception?"
      - "New heuristic to add?"
```

---

## Iterative Improvement Process

### The Improvement Cycle

Knowledge doesn't just accumulate - it must be **actively refined**:

```
Weekly Cycle:
┌─────────────────────────────────────────────────────────────┐
│  MONDAY: Review flywheel metrics from previous week        │
│  ├── Which patterns had low confirmation rates?            │
│  ├── Which heuristics had exceptions discovered?           │
│  └── What new war stories emerged?                         │
├─────────────────────────────────────────────────────────────┤
│  TUESDAY-THURSDAY: Automated refinement proposals          │
│  ├── Run propose_pattern_updates()                         │
│  ├── Generate candidate new patterns from clusters         │
│  └── Surface war stories from incident patterns            │
├─────────────────────────────────────────────────────────────┤
│  FRIDAY: Human review of proposals                         │
│  ├── Approve/reject pattern updates                        │
│  ├── Validate new heuristics                               │
│  └── Publish updated knowledge base                        │
└─────────────────────────────────────────────────────────────┘
```

### Pattern Lifecycle Management

```
PATTERN LIFECYCLE
─────────────────

   PROPOSED          CANDIDATE         VALIDATED          MATURE           RETIRED
       │                 │                 │                │                 │
       │   Review &      │   10+ uses,     │   50+ uses,    │   Low usage     │
       │   testing       │   >70% success  │   >85% success │   or superseded │
       │                 │                 │                │                 │
       ▼                 ▼                 ▼                ▼                 ▼
   ┌───────┐         ┌───────┐         ┌───────┐        ┌───────┐        ┌───────┐
   │Draft  │────────▶│Testing│────────▶│Active │───────▶│Trusted│───────▶│Archive│
   │       │         │       │         │       │        │       │        │       │
   └───────┘         └───────┘         └───────┘        └───────┘        └───────┘
       │                                    │
       │         Fails validation           │    New evidence
       └────────────────────────────────────┘    contradicts
```

### Heuristic Confidence Adjustment

```python
# Pseudocode for automatic confidence adjustment
def adjust_heuristic_confidence(heuristic_id):
    outcomes = get_outcomes_using_heuristic(heuristic_id, last_30_days)

    if len(outcomes) < 10:
        return  # Not enough data

    observed_success = outcomes.filter(success=True).count() / len(outcomes)
    current_confidence = heuristic.confidence_pct / 100

    # Bayesian-ish update: blend prior with observed
    new_confidence = (current_confidence * 0.3) + (observed_success * 0.7)

    # Propose update if significant change
    if abs(new_confidence - current_confidence) > 0.05:
        create_confidence_update_proposal(
            heuristic_id=heuristic_id,
            old_confidence=current_confidence,
            new_confidence=new_confidence,
            evidence_count=len(outcomes)
        )
```

### War Story Auto-Generation

When an incident pattern emerges, automatically draft a war story:

```sql
-- Trigger: Same root cause appears 3+ times
CREATE OR REPLACE FUNCTION auto_generate_war_story()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if this root cause pattern has occurred 3+ times
  IF (
    SELECT COUNT(*) FROM issue_patterns
    WHERE root_cause_pattern = NEW.root_cause_pattern
  ) >= 3 THEN

    -- Generate war story draft
    INSERT INTO expert_war_stories (
      story_id,
      domain,
      title,
      context,
      symptoms,
      incident,
      root_cause,
      resolution,
      warning_signs,
      lessons,
      status
    ) VALUES (
      'WAR-AUTO-' || gen_random_uuid()::text,
      NEW.domain,
      'Auto-generated: ' || NEW.root_cause_pattern,
      NEW.context,
      NEW.symptoms,
      NEW.incident_details,
      NEW.root_cause_pattern,
      NEW.resolution_pattern,
      NEW.warning_signs,
      NEW.lessons,
      'draft'  -- Requires human review
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Continuous Improvement Metrics

Track improvement over time:

```sql
CREATE VIEW v_knowledge_improvement_trend AS
SELECT
  date_trunc('week', created_at) as week,

  -- Pattern metrics
  COUNT(DISTINCT pattern_id) FILTER (WHERE status = 'active') as active_patterns,
  AVG(success_rate) as avg_pattern_success,

  -- Heuristic metrics
  COUNT(DISTINCT heuristic_id) as active_heuristics,
  AVG(confidence_pct) as avg_heuristic_confidence,

  -- War story growth
  COUNT(DISTINCT story_id) as total_war_stories,

  -- Overall improvement signal
  AVG(human_rating) as avg_human_satisfaction,
  AVG(rework_cycles) as avg_rework_cycles

FROM knowledge_metrics_weekly
GROUP BY date_trunc('week', created_at)
ORDER BY week DESC;
```

---

## Dynamic Agent & Team Templates

### The Meta-Agent Problem

As LEO evolves, we'll need **new agents we haven't thought of yet**. Instead of building each from scratch, we need:

1. **Agent Templates** - Blueprints for common agent types
2. **Composition Rules** - How to combine capabilities
3. **Auto-Generation** - Spin up new agents from templates + domain knowledge

### Agent Template Schema

```sql
CREATE TABLE agent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id TEXT UNIQUE NOT NULL,
  template_type TEXT NOT NULL,  -- 'sub_agent', 'swarm_advisor', 'board_member'

  -- Base configuration
  name_pattern TEXT NOT NULL,        -- e.g., "{domain} Specialist"
  description_template TEXT NOT NULL,

  -- Capability slots
  required_capabilities JSONB NOT NULL,  -- Must have these
  optional_capabilities JSONB DEFAULT '[]',  -- Nice to have

  -- Knowledge integration
  knowledge_domains JSONB NOT NULL,  -- Which pattern/toolbox domains to attach
  expertise_level TEXT DEFAULT 'senior',

  -- Prompt templates
  system_prompt_template TEXT NOT NULL,
  task_prompt_template TEXT NOT NULL,

  -- Swarm configuration (if part of swarm)
  can_be_lead BOOLEAN DEFAULT false,
  can_be_advisor BOOLEAN DEFAULT true,
  coordination_pattern TEXT,  -- 'fire_and_forget', 'progressive', 'competitive'

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Template instantiation records
CREATE TABLE agent_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id TEXT UNIQUE NOT NULL,
  template_id UUID REFERENCES agent_templates(id),

  -- Instance-specific config
  domain TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  -- Attached knowledge
  attached_patterns JSONB DEFAULT '[]',
  attached_toolboxes JSONB DEFAULT '[]',
  attached_heuristics JSONB DEFAULT '[]',

  -- Generated prompts
  system_prompt TEXT NOT NULL,
  task_prompt TEXT NOT NULL,

  -- Status
  status TEXT DEFAULT 'active',
  performance_score DECIMAL(5,2),

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Template Types

#### 1. Sub-Agent Template

```yaml
template:
  id: TMPL-SUBAGENT-SPECIALIST
  type: sub_agent
  name_pattern: "{domain} Specialist Sub-Agent"

  description_template: |
    You are the {domain} Specialist Sub-Agent for the LEO Protocol.
    Your expertise: {expertise_areas}
    Your focus: {primary_focus}

  required_capabilities:
    - domain_analysis
    - recommendation_generation
    - risk_assessment

  optional_capabilities:
    - code_generation
    - validation
    - documentation

  knowledge_domains:
    - patterns: "{domain}_patterns"
    - toolboxes: "{domain}_toolboxes"
    - heuristics: "{domain}_heuristics"

  system_prompt_template: |
    You are the {name} in the LEO Protocol.

    ## Your Expertise
    {expertise_description}

    ## Your Active Toolbox: {active_toolbox}
    {toolbox_contents}

    ## Relevant Patterns
    {relevant_patterns}

    ## Heuristics to Apply
    {relevant_heuristics}

    ## Your Constraints
    - Focus ONLY on {domain} aspects
    - Do not exceed your domain boundaries
    - Flag issues outside your expertise for other specialists
```

#### 2. Swarm Advisor Template

```yaml
template:
  id: TMPL-SWARM-ADVISOR
  type: swarm_advisor
  name_pattern: "{specialty} Advisor"

  description_template: |
    You are the {specialty} Advisor supporting the {lead_agent} Lead.
    Your specialty: {specialty_description}
    Your output feeds into: {lead_agent}'s synthesis

  required_capabilities:
    - focused_analysis
    - structured_output
    - confidence_scoring

  coordination_pattern: "fire_and_forget"

  system_prompt_template: |
    You are the **{name}** advisor to {lead_agent} in the LEO Protocol.

    ## Your Focus
    {specialty_description}

    ## Context Provided
    {context_description}

    ## Your Task
    {task_description}

    ## Output Format
    ```json
    {
      "findings": [...],
      "recommendations": [...],
      "confidence": 0-100,
      "flags_for_lead": [...]
    }
    ```

    ## Constraints
    - Focus ONLY on {specialty} aspects
    - Do not duplicate other advisors' work
    - Be thorough but concise
```

#### 3. Board Member Template

```yaml
template:
  id: TMPL-BOARD-MEMBER
  type: board_member
  name_pattern: "The {persona}"

  description_template: |
    You are The {persona} on the LEO Protocol Board of Directors.
    Your evaluation lens: {evaluation_focus}
    Your critique style: {critique_style}

  required_capabilities:
    - proposal_evaluation
    - risk_assessment
    - vote_generation

  can_be_lead: true

  swarm_advisors:
    - template: TMPL-SWARM-ADVISOR
      specialty: "{persona_specialty_1}"
    - template: TMPL-SWARM-ADVISOR
      specialty: "{persona_specialty_2}"
    - template: TMPL-SWARM-ADVISOR
      specialty: "{persona_specialty_3}"
```

### Dynamic Agent Generation

When a new domain emerges, generate agents automatically:

```python
def generate_agent_for_domain(domain: str, expertise_areas: list):
    """
    Dynamically generate a new sub-agent for an emerging domain.
    """

    # 1. Select appropriate template
    template = select_template(domain, expertise_areas)

    # 2. Gather relevant knowledge
    patterns = get_patterns_for_domain(domain)
    toolboxes = get_toolboxes_for_domain(domain)
    heuristics = get_heuristics_for_domain(domain)
    war_stories = get_war_stories_for_domain(domain)

    # 3. Generate prompts from template
    system_prompt = template.system_prompt_template.format(
        name=f"{domain.title()} Specialist",
        domain=domain,
        expertise_description=format_expertise(expertise_areas),
        active_toolbox=select_best_toolbox(toolboxes),
        toolbox_contents=format_toolbox(toolboxes[0]),
        relevant_patterns=format_patterns(patterns[:5]),
        relevant_heuristics=format_heuristics(heuristics[:10])
    )

    # 4. Create agent instance
    agent = AgentInstance(
        template_id=template.id,
        domain=domain,
        name=f"{domain.title()} Specialist",
        system_prompt=system_prompt,
        attached_patterns=[p.id for p in patterns],
        attached_toolboxes=[t.id for t in toolboxes],
        attached_heuristics=[h.id for h in heuristics]
    )

    # 5. Register in agent registry
    register_agent(agent)

    return agent
```

### Team Composition Templates

For creating entire swarm teams:

```yaml
team_template:
  id: TMPL-TEAM-DOMAIN-SWARM
  name_pattern: "{domain} Expert Swarm"

  composition:
    lead:
      template: TMPL-SUBAGENT-SPECIALIST
      role: "Lead {domain} Architect"
      capabilities: [domain_analysis, synthesis, decision_making]

    advisors:
      - template: TMPL-SWARM-ADVISOR
        role: "{domain} Quality Analyst"
        specialty: "quality, best practices, standards"

      - template: TMPL-SWARM-ADVISOR
        role: "{domain} Risk Analyst"
        specialty: "risks, edge cases, failure modes"

      - template: TMPL-SWARM-ADVISOR
        role: "{domain} Integration Specialist"
        specialty: "integration, dependencies, boundaries"

      - template: TMPL-SWARM-ADVISOR
        role: "{domain} Performance Analyst"
        specialty: "performance, efficiency, scalability"

  coordination:
    pattern: "fire_and_forget"
    merge_strategy: "lead_synthesis"
    timeout_ms: 30000
```

### Example: Generating a New "Compliance" Agent Team

```python
# User request: "We need agents for regulatory compliance work"

# 1. System detects new domain need
new_domain = "compliance"
expertise_areas = ["GDPR", "SOC2", "HIPAA", "data privacy", "audit trails"]

# 2. Generate lead agent
compliance_lead = generate_agent_for_domain(
    domain="compliance",
    expertise_areas=expertise_areas,
    template="TMPL-SUBAGENT-SPECIALIST"
)

# 3. Generate swarm team
compliance_team = generate_team_from_template(
    template="TMPL-TEAM-DOMAIN-SWARM",
    domain="compliance",
    advisors=[
        {"role": "Regulation Analyst", "specialty": "GDPR, CCPA, regulatory requirements"},
        {"role": "Audit Specialist", "specialty": "audit trails, evidence collection, reporting"},
        {"role": "Data Privacy Expert", "specialty": "PII handling, consent, data retention"},
        {"role": "Security Compliance Analyst", "specialty": "SOC2, security controls, penetration testing"}
    ]
)

# 4. Attach knowledge (may need to bootstrap)
if not has_patterns_for_domain("compliance"):
    # Bootstrap from external sources
    bootstrap_knowledge_from_docs(
        domain="compliance",
        sources=["GDPR guidelines", "SOC2 requirements", "HIPAA documentation"]
    )

# 5. Agent is now active and can receive tasks
```

### Self-Bootstrapping for New Domains

When patterns don't exist yet for a new domain:

```yaml
bootstrap_process:
  trigger: "New agent domain with <5 patterns"

  steps:
    - name: "External Knowledge Import"
      action: "Fetch authoritative documentation for domain"
      sources:
        - Official documentation
        - Industry best practices
        - Academic papers
        - Expert interviews

    - name: "Pattern Extraction"
      action: "Use LLM to extract initial patterns"
      prompt: |
        Analyze this {domain} documentation and extract:
        1. Common problem patterns and solutions
        2. Anti-patterns (what not to do)
        3. Heuristics (rules of thumb)
        4. Edge cases and gotchas

    - name: "Validation"
      action: "Human review of extracted patterns"
      approval_required: true

    - name: "Initial Seeding"
      action: "Insert validated patterns into knowledge base"
      status: "candidate"  # Needs real-world validation

    - name: "Activation"
      action: "Enable agent with bootstrapped knowledge"
      monitoring: "enhanced"  # Track outcomes closely for refinement
```

---

## Related Documents

- [Hierarchical Swarm Architecture](./hierarchical-swarm-architecture.md)
- [Swarm Mode Readiness Rubric](./swarm-mode-readiness-rubric.md)
- [Issue Patterns Table](../../database/schema/)
- Retrospectives System

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-02 | Initial expert knowledge encoding architecture design |
| 2026-02-02 | Added Data Flywheel architecture for continuous learning |
| 2026-02-02 | Added Iterative Improvement Process with lifecycle management |
| 2026-02-02 | Added Dynamic Agent & Team Templates for future extensibility |

