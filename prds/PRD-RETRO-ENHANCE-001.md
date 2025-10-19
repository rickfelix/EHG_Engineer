# Product Requirements Document
# SD-RETRO-ENHANCE-001: Enhanced Retrospective System

**Version**: 1.0
**Status**: DRAFT
**Created**: 2025-10-16
**Strategic Directive**: SD-RETRO-ENHANCE-001
**Priority**: High
**Target Application**: EHG_engineer

---

## Executive Summary

Enhance the retrospective system with multi-application context, code traceability, semantic search, and 4-layer quality enforcement. This transforms retrospectives from static documents into an active, intelligent knowledge management system that scales across multiple applications (EHG, EHG_engineer, ventures).

**Key Features**:
- Multi-application context (target_application, learning_category, applies_to_all_apps)
- Code traceability (files, commits, PRs, components, tags)
- Semantic search with OpenAI embeddings (vector(1536))
- 4-layer enforcement (Database → Triggers → Application → CI/CD)
- Integration with SD-KNOWLEDGE-001 automated retrieval

**Expected Impact**:
- 3x more relevant retrospectives per query (vs keyword-only)
- 95% research confidence (up from 85%)
- 60% of ventures reuse process improvements
- 100% data quality enforcement

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Goals and Objectives](#goals-and-objectives)
3. [Current State Analysis](#current-state-analysis)
4. [Proposed Solution](#proposed-solution)
5. [Database Schema Changes](#database-schema-changes)
6. [4-Layer Enforcement Architecture](#4-layer-enforcement-architecture)
7. [Functional Requirements](#functional-requirements)
8. [Technical Requirements](#technical-requirements)
9. [User Stories](#user-stories)
10. [API Specifications](#api-specifications)
11. [Testing Strategy](#testing-strategy)
12. [Migration Strategy](#migration-strategy)
13. [Success Criteria](#success-criteria)
14. [Timeline and Phases](#timeline-and-phases)
15. [Dependencies](#dependencies)
16. [Risks and Mitigations](#risks-and-mitigations)
17. [Documentation Deliverables](#documentation-deliverables)

---

## Problem Statement

### Current Gaps

1. **No Multi-Application Context**
   - Cannot distinguish EHG vs EHG_engineer vs venture learnings
   - Process improvements get conflated with application-specific bugs
   - Cross-application learning is manual and error-prone

2. **No Semantic Search**
   - Keyword-only search limits discovery
   - Conceptually similar issues use different wording
   - Miss relevant retrospectives due to vocabulary mismatch

3. **No Code Traceability**
   - Cannot link retrospectives to specific files, commits, PRs
   - Difficult to track which components had issues
   - No systematic tagging for categorization

4. **Insufficient Enforcement**
   - Fields can be skipped without validation
   - No automated quality gates in CI/CD
   - Silent failures allow invalid data

### Impact

With 97+ retrospectives and growing:
- Knowledge reuse is suboptimal (manual search)
- Cross-application insights are missed
- Code quality patterns are not tracked
- Duplicate issues occur across apps

---

## Goals and Objectives

### Primary Goals

1. **Enable Multi-Application Intelligence**
   - Distinguish application-specific issues from universal patterns
   - Enable cross-application learning and knowledge transfer
   - Support unlimited future venture applications

2. **Enable Semantic Discovery**
   - Find conceptually similar issues regardless of wording
   - Combine semantic understanding with structured filters
   - Improve search relevance by 3x

3. **Establish Code Traceability**
   - Link retrospectives to source files, commits, PRs
   - Track affected components systematically
   - Enable pattern analysis at code level

4. **Enforce Quality Standards**
   - 4-layer defense (database → triggers → app → CI/CD)
   - 100% compliance with field requirements
   - Prevent invalid data at multiple levels

### Success Metrics

- 100% retrospectives have target_application (enforced)
- 100% retrospectives have learning_category (enforced)
- 90%+ semantic search relevance (user validated)
- 3x more relevant results per query
- 95% research confidence (SD-KNOWLEDGE-001 integration)
- 60% venture adoption of process improvements

---

## Current State Analysis

### Existing Schema (47 columns)

**Strengths**:
- ✅ `quality_score` with constraint (70-100)
- ✅ Validation trigger (`auto_validate_retrospective_quality`)
- ✅ GIN indexes on arrays (success_patterns, failure_patterns)
- ✅ Comprehensive JSONB fields (what_went_well, key_learnings, etc.)
- ✅ Status workflow (DRAFT → PUBLISHED → ARCHIVED)

**Gaps**:
- ❌ No application context (target_application, learning_category)
- ❌ No code traceability (files, commits, PRs, components, tags)
- ❌ No semantic search (content_embedding vector)
- ❌ No severity tracking (severity_level, time_to_resolve)
- ❌ No CI/CD enforcement

### Existing Infrastructure

**Prevention Infrastructure** (from SD-KNOWLEDGE-001):
- ✅ `schema-validator.js` - Pre-insert type validation
- ✅ `safe-insert.js` - Type-safe database operations
- ✅ Validation trigger with intelligent scoring
- ✅ Test suite (22/22 passing)

**Knowledge Retrieval** (SD-KNOWLEDGE-001):
- ✅ `automated-knowledge-retrieval.js` - Retrospective search
- ✅ Keyword matching on title, description
- ✅ 24-hour caching with TTL
- ⚠️ No semantic search (keyword-only)

---

## Proposed Solution

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    RETROSPECTIVE SYSTEM                      │
│                 (Enhanced with 4-Layer Enforcement)          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────┐
    │         LAYER 1: Database Constraints           │
    │  • NOT NULL on target_application               │
    │  • NOT NULL on learning_category                │
    │  • CHECK on target_application values           │
    │  • CHECK on severity_level enum                 │
    └─────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────┐
    │         LAYER 2: Database Triggers              │
    │  • Auto-populate applies_to_all_apps            │
    │  • Validate APPLICATION_ISSUE has components    │
    │  • Validate CRITICAL/HIGH has tags              │
    │  • Enforce content_embedding for PUBLISHED      │
    └─────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────┐
    │       LAYER 3: Application Validation           │
    │  • Pre-insert schema validation                 │
    │  • Enhanced validateRetrospective()             │
    │  • Type-safe inserts with safeInsert()          │
    │  • Post-insert verification                     │
    └─────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────┐
    │           LAYER 4: CI/CD Gates                  │
    │  • Retrospective field validation               │
    │  • Embedding generation verification            │
    │  • Schema consistency checks                    │
    │  • Block merge if validation fails              │
    └─────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────┐
    │          SEMANTIC SEARCH (pgvector)             │
    │  • match_retrospectives() RPC function          │
    │  • IVFFlat index for vector similarity          │
    │  • Cosine distance ranking                      │
    │  • Combine with structured filters              │
    └─────────────────────────────────────────────────┘
```

### Key Components

1. **Database Schema Enhancements**
   - 9 new columns (application context, code traceability, search, embeddings)
   - 3 new constraints (target_application, learning_category, severity_level)
   - 1 enhanced trigger (field-specific validation logic)
   - 4 new indexes (GIN for arrays, IVFFlat for vectors)
   - 1 new RPC function (match_retrospectives for semantic search)

2. **Application Updates**
   - Enhanced `generate-comprehensive-retrospective.js` validation
   - New `generate-retrospective-embeddings.js` script
   - Integration with `automated-knowledge-retrieval.js`
   - Backfill script for 97 existing retrospectives

3. **CI/CD Integration**
   - New GitHub Actions workflow: `.github/workflows/retrospective-quality-gates.yml`
   - 3 validation jobs (field validation, embedding verification, schema checks)
   - Automatic PR comments with results
   - Block merge on failures

4. **Documentation**
   - 10 comprehensive documentation files
   - Migration guide for existing retrospectives
   - API reference for semantic search
   - Testing guide for all enforcement layers

---

## Database Schema Changes

### New Columns (9 total)

#### Application Context (3 columns)

```sql
-- Application identifier (EHG_engineer, EHG, venture_*)
target_application TEXT NOT NULL
  CHECK (
    target_application = 'EHG_engineer' OR
    target_application = 'EHG' OR
    target_application LIKE 'venture_%'
  );

-- Learning type categorization
learning_category TEXT NOT NULL
  CHECK (learning_category IN (
    'PROCESS_IMPROVEMENT',      -- Universal patterns (apply across apps)
    'APPLICATION_ISSUE',        -- App-specific bugs/issues
    'INFRASTRUCTURE',           -- DevOps, CI/CD, deployment
    'ARCHITECTURE_DECISION',    -- System design choices
    'TEAM_COLLABORATION',       -- Communication, workflow
    'TOOL_ADOPTION',            -- New libraries, frameworks
    'PERFORMANCE_OPTIMIZATION', -- Speed, efficiency improvements
    'SECURITY_ENHANCEMENT',     -- Auth, encryption, vulnerabilities
    'USER_EXPERIENCE'           -- UI/UX improvements
  ));

-- Universal applicability flag
applies_to_all_apps BOOLEAN DEFAULT false;
```

#### Code Traceability (5 columns)

```sql
-- Related source files
related_files TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Related git commits (SHA hashes)
related_commits TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Related pull requests (URLs or numbers)
related_prs TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Affected code components (e.g., 'VentureCard', 'AuthService')
affected_components TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Categorization tags (e.g., 'bug', 'performance', 'accessibility')
tags TEXT[] DEFAULT ARRAY[]::TEXT[];
```

#### Search & Aggregation (2 columns)

```sql
-- Issue severity level
severity_level TEXT DEFAULT 'MEDIUM'
  CHECK (severity_level IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'));

-- Time spent resolving (in hours)
time_to_resolve NUMERIC(10, 2);
```

#### Semantic Search (1 column)

```sql
-- OpenAI embedding vector (text-embedding-3-small, 1536 dimensions)
content_embedding VECTOR(1536);
```

### New Constraints (5 total)

```sql
-- Constraint 1: target_application is required and valid
ALTER TABLE retrospectives
ADD CONSTRAINT retrospectives_target_application_check
CHECK (
  target_application = 'EHG_engineer' OR
  target_application = 'EHG' OR
  target_application LIKE 'venture_%'
);

ALTER TABLE retrospectives
ALTER COLUMN target_application SET NOT NULL;

-- Constraint 2: learning_category is required and valid
ALTER TABLE retrospectives
ADD CONSTRAINT retrospectives_learning_category_check
CHECK (learning_category IN (
  'PROCESS_IMPROVEMENT', 'APPLICATION_ISSUE', 'INFRASTRUCTURE',
  'ARCHITECTURE_DECISION', 'TEAM_COLLABORATION', 'TOOL_ADOPTION',
  'PERFORMANCE_OPTIMIZATION', 'SECURITY_ENHANCEMENT', 'USER_EXPERIENCE'
));

ALTER TABLE retrospectives
ALTER COLUMN learning_category SET NOT NULL;

-- Constraint 3: severity_level is valid
ALTER TABLE retrospectives
ADD CONSTRAINT retrospectives_severity_level_check
CHECK (severity_level IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'));

-- Constraint 4: PUBLISHED retrospectives must have embeddings
ALTER TABLE retrospectives
ADD CONSTRAINT retrospectives_published_embedding_check
CHECK (
  status != 'PUBLISHED' OR
  content_embedding IS NOT NULL
);

-- Constraint 5: time_to_resolve must be positive
ALTER TABLE retrospectives
ADD CONSTRAINT retrospectives_time_to_resolve_check
CHECK (time_to_resolve IS NULL OR time_to_resolve >= 0);
```

### Enhanced Trigger Logic

**Enhance existing `auto_validate_retrospective_quality()` trigger**:

```sql
CREATE OR REPLACE FUNCTION auto_validate_retrospective_quality()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Existing quality scoring logic...

  -- NEW: Auto-populate applies_to_all_apps
  IF NEW.learning_category IN (
    'PROCESS_IMPROVEMENT',
    'TEAM_COLLABORATION',
    'INFRASTRUCTURE'
  ) THEN
    NEW.applies_to_all_apps := true;
  ELSE
    NEW.applies_to_all_apps := false;
  END IF;

  -- NEW: Validate APPLICATION_ISSUE has affected_components
  IF NEW.learning_category = 'APPLICATION_ISSUE' THEN
    IF NEW.affected_components IS NULL OR
       array_length(NEW.affected_components, 1) = 0 THEN
      RAISE EXCEPTION
        'APPLICATION_ISSUE requires at least one affected_component';
    END IF;
  END IF;

  -- NEW: Validate CRITICAL/HIGH severity has tags
  IF NEW.severity_level IN ('CRITICAL', 'HIGH') THEN
    IF NEW.tags IS NULL OR array_length(NEW.tags, 1) = 0 THEN
      RAISE EXCEPTION
        'CRITICAL/HIGH severity requires at least one tag';
    END IF;
  END IF;

  -- NEW: Validate PUBLISHED status has embedding
  IF NEW.status = 'PUBLISHED' AND NEW.content_embedding IS NULL THEN
    RAISE EXCEPTION
      'PUBLISHED retrospectives must have content_embedding';
  END IF;

  RETURN NEW;
END;
$$;
```

### New Indexes (4 total)

```sql
-- Index 1: GIN index for related_files array search
CREATE INDEX idx_retrospectives_related_files
ON retrospectives USING GIN (related_files);

-- Index 2: GIN index for tags array search
CREATE INDEX idx_retrospectives_tags
ON retrospectives USING GIN (tags);

-- Index 3: B-tree index for target_application filtering
CREATE INDEX idx_retrospectives_target_application
ON retrospectives (target_application);

-- Index 4: IVFFlat index for vector similarity search
-- (requires pgvector extension)
CREATE INDEX idx_retrospectives_content_embedding
ON retrospectives
USING ivfflat (content_embedding vector_cosine_ops)
WITH (lists = 100);
```

### New RPC Function (Semantic Search)

```sql
CREATE OR REPLACE FUNCTION match_retrospectives(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_application TEXT DEFAULT NULL,
  filter_category TEXT DEFAULT NULL,
  filter_severity TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  sd_id TEXT,
  title TEXT,
  description TEXT,
  target_application TEXT,
  learning_category TEXT,
  severity_level TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.sd_id,
    r.title,
    r.description,
    r.target_application,
    r.learning_category,
    r.severity_level,
    1 - (r.content_embedding <=> query_embedding) AS similarity
  FROM retrospectives r
  WHERE r.status = 'PUBLISHED'
    AND r.content_embedding IS NOT NULL
    AND 1 - (r.content_embedding <=> query_embedding) > match_threshold
    AND (filter_application IS NULL OR r.target_application = filter_application)
    AND (filter_category IS NULL OR r.learning_category = filter_category)
    AND (filter_severity IS NULL OR r.severity_level = filter_severity)
  ORDER BY r.content_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

---

## 4-Layer Enforcement Architecture

### Layer 1: Database Constraints

**Purpose**: Cannot be bypassed, enforced at storage level

**Enforcement**:
1. `NOT NULL` on `target_application`
2. `NOT NULL` on `learning_category`
3. `CHECK` constraints on enum values
4. `CHECK` constraint on `content_embedding` for PUBLISHED status

**Error Handling**:
```
ERROR:  new row for relation "retrospectives" violates check constraint
DETAIL:  target_application must be 'EHG_engineer', 'EHG', or 'venture_*'
```

**Test Coverage**: 10 tests validating each constraint

### Layer 2: Database Triggers

**Purpose**: Business logic enforcement, auto-population

**Enforcement**:
1. Auto-populate `applies_to_all_apps` based on `learning_category`
2. Validate APPLICATION_ISSUE has `affected_components`
3. Validate CRITICAL/HIGH severity has `tags`
4. Enforce `content_embedding` for PUBLISHED status

**Error Handling**:
```
ERROR:  APPLICATION_ISSUE requires at least one affected_component
CONTEXT:  PL/pgSQL function auto_validate_retrospective_quality()
```

**Test Coverage**: 8 tests for trigger logic

### Layer 3: Application Validation

**Purpose**: Pre-insert validation with clear error messages

**Implementation**: Enhanced `validateRetrospective()` function

```javascript
function validateRetrospective(retrospective) {
  const errors = [];

  // Existing validations...

  // NEW: Validate target_application
  if (!retrospective.target_application) {
    errors.push('target_application is required');
  } else if (
    retrospective.target_application !== 'EHG_engineer' &&
    retrospective.target_application !== 'EHG' &&
    !retrospective.target_application.startsWith('venture_')
  ) {
    errors.push(
      `Invalid target_application: ${retrospective.target_application}. ` +
      `Must be 'EHG_engineer', 'EHG', or 'venture_*'`
    );
  }

  // NEW: Validate learning_category
  const validCategories = [
    'PROCESS_IMPROVEMENT', 'APPLICATION_ISSUE', 'INFRASTRUCTURE',
    'ARCHITECTURE_DECISION', 'TEAM_COLLABORATION', 'TOOL_ADOPTION',
    'PERFORMANCE_OPTIMIZATION', 'SECURITY_ENHANCEMENT', 'USER_EXPERIENCE'
  ];
  if (!retrospective.learning_category) {
    errors.push('learning_category is required');
  } else if (!validCategories.includes(retrospective.learning_category)) {
    errors.push(
      `Invalid learning_category: ${retrospective.learning_category}. ` +
      `Must be one of: ${validCategories.join(', ')}`
    );
  }

  // NEW: Validate APPLICATION_ISSUE has affected_components
  if (retrospective.learning_category === 'APPLICATION_ISSUE') {
    if (!retrospective.affected_components ||
        retrospective.affected_components.length === 0) {
      errors.push(
        'APPLICATION_ISSUE learning_category requires at least one affected_component'
      );
    }
  }

  // NEW: Validate CRITICAL/HIGH severity has tags
  if (['CRITICAL', 'HIGH'].includes(retrospective.severity_level)) {
    if (!retrospective.tags || retrospective.tags.length === 0) {
      errors.push(
        'CRITICAL/HIGH severity requires at least one tag for categorization'
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
```

**Error Handling**:
```javascript
❌ Retrospective validation failed:
   1. target_application is required
   2. learning_category is required
   3. APPLICATION_ISSUE requires at least one affected_component
```

**Test Coverage**: 15 tests for all validation rules

### Layer 4: CI/CD Gates

**Purpose**: Prevent bad code from merging

**Implementation**: GitHub Actions workflow

```yaml
name: Retrospective Quality Gates

on:
  pull_request:
    paths:
      - 'scripts/generate-comprehensive-retrospective.js'
      - 'scripts/generate-retrospective-embeddings.js'
      - 'scripts/backfill-retrospective-enhancements.js'

jobs:
  validate-retrospective-fields:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Validate field requirements
        run: |
          # Check that generate-comprehensive-retrospective.js
          # sets target_application and learning_category
          grep -q "target_application:" scripts/generate-comprehensive-retrospective.js
          grep -q "learning_category:" scripts/generate-comprehensive-retrospective.js
          echo "✅ Required fields present"

  validate-embedding-generation:
    runs-on: ubuntu-latest
    steps:
      - name: Verify OpenAI integration
        run: |
          # Check that generate-retrospective-embeddings.js exists
          test -f scripts/generate-retrospective-embeddings.js
          echo "✅ Embedding script exists"

  validate-schema-consistency:
    runs-on: ubuntu-latest
    steps:
      - name: Run consistency checks
        run: |
          node scripts/validate-system-consistency.js --check=retrospective-fields
          echo "✅ Schema consistency validated"
```

**Test Coverage**: 3 CI/CD jobs

---

## Functional Requirements

### FR-1: Multi-Application Context

**Requirement**: Every retrospective must identify its target application and learning category.

**Acceptance Criteria**:
1. `target_application` is required (NOT NULL constraint)
2. `target_application` validates as 'EHG_engineer', 'EHG', or 'venture_*'
3. `learning_category` is required (NOT NULL constraint)
4. `learning_category` validates against 9 predefined categories
5. `applies_to_all_apps` auto-populates based on category

**User Story**: US-001 (see User Stories section)

### FR-2: Code Traceability

**Requirement**: Link retrospectives to source code for pattern analysis.

**Acceptance Criteria**:
1. `related_files` accepts array of file paths
2. `related_commits` accepts array of git SHAs
3. `related_prs` accepts array of PR URLs/numbers
4. `affected_components` accepts array of component names
5. `tags` accepts array of categorization tags
6. APPLICATION_ISSUE requires at least one `affected_component` (trigger enforces)
7. CRITICAL/HIGH severity requires at least one `tag` (trigger enforces)

**User Stories**: US-002, US-003 (see User Stories section)

### FR-3: Semantic Search

**Requirement**: Enable concept-based retrospective discovery using embeddings.

**Acceptance Criteria**:
1. `content_embedding` stores vector(1536) from OpenAI
2. `match_retrospectives()` RPC function searches by similarity
3. IVFFlat index enables efficient vector search
4. PUBLISHED retrospectives must have embeddings (constraint enforces)
5. Semantic search combines with structured filters (application, category, severity)

**User Stories**: US-004, US-005 (see User Stories section)

### FR-4: 4-Layer Enforcement

**Requirement**: Prevent invalid data at 4 independent levels.

**Acceptance Criteria**:
1. Layer 1: Database constraints block invalid data
2. Layer 2: Triggers enforce business rules and auto-populate fields
3. Layer 3: Application validation provides clear error messages
4. Layer 4: CI/CD gates prevent merging bad code
5. Each layer tested independently
6. All layers operational and verifiable

**User Stories**: US-006, US-007 (see User Stories section)

### FR-5: Backfill Existing Records

**Requirement**: Update 97 existing retrospectives with new fields.

**Acceptance Criteria**:
1. All retrospectives have valid `target_application`
2. All retrospectives have valid `learning_category`
3. Embeddings generated for all PUBLISHED retrospectives
4. Backfill script runs in batches (10 at a time)
5. Backfill completes in <2 hours
6. No data loss during backfill

**User Stories**: US-008 (see User Stories section)

### FR-6: Integration with SD-KNOWLEDGE-001

**Requirement**: Enhance automated knowledge retrieval with new fields.

**Acceptance Criteria**:
1. `automated-knowledge-retrieval.js` uses semantic search
2. Filters by `target_application` when appropriate
3. Filters by `learning_category` for specific types
4. Returns 3x more relevant results (measured)
5. Research confidence improves to 95%

**User Stories**: US-009 (see User Stories section)

---

## Technical Requirements

### TR-1: Database Requirements

**pgvector Extension**:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**Version**: PostgreSQL 14+ with pgvector 0.5.0+
**Note**: Supabase includes pgvector by default

**Performance Targets**:
- Constraint overhead: <5ms per insert
- Trigger execution: <10ms per insert
- Vector search: <100ms average (with IVFFlat index)
- Backfill: <2 hours for 97 records

### TR-2: OpenAI API Requirements

**Model**: `text-embedding-3-small`
**Dimensions**: 1536
**Cost**: ~$0.00002 per 1K tokens
**Annual Cost**: ~$0.01/year (97 retrospectives × 500 tokens avg)

**Rate Limits**: 3,000 requests per minute
**Error Handling**: Exponential backoff with retries

**Environment Variable**: `OPENAI_API_KEY`

### TR-3: Application Requirements

**Node.js**: v18+
**Dependencies**:
- `@supabase/supabase-js`: ^2.38.0
- `openai`: ^4.20.0
- `dotenv`: ^16.0.0

**Scripts**:
1. `generate-comprehensive-retrospective.js` (enhance existing)
2. `generate-retrospective-embeddings.js` (create new)
3. `backfill-retrospective-enhancements.js` (create new)
4. `automated-knowledge-retrieval.js` (enhance existing)

### TR-4: CI/CD Requirements

**GitHub Actions**:
- Workflow file: `.github/workflows/retrospective-quality-gates.yml`
- 3 validation jobs (field validation, embedding verification, consistency)
- Trigger on PR changes to retrospective scripts

**Enforcement**: Block merge if any job fails

### TR-5: Testing Requirements

**Unit Tests**: 33 tests total
- 10 tests: Database constraints
- 8 tests: Trigger logic
- 15 tests: Application validation

**Integration Tests**: 8 tests total
- 3 tests: Semantic search
- 2 tests: Backfill process
- 3 tests: SD-KNOWLEDGE-001 integration

**E2E Tests**: 4 tests total
- 1 test: Full retrospective generation flow
- 1 test: Semantic search flow
- 1 test: CI/CD gate validation
- 1 test: Backfill flow

**Total**: 45 tests

---

## User Stories

### US-001: Multi-Application Context

**As a** PLAN agent
**I want to** specify which application a retrospective applies to
**So that** learnings are properly categorized and discoverable

**Acceptance Criteria**:
- [ ] `target_application` field is required
- [ ] Valid values: 'EHG_engineer', 'EHG', 'venture_*'
- [ ] Database constraint enforces valid values
- [ ] Clear error message if invalid
- [ ] Application validation catches errors pre-insert

**Priority**: Critical
**Complexity**: 3 (Medium)

### US-002: Code Traceability - Files and Commits

**As a** developer
**I want to** link retrospectives to specific files and commits
**So that** I can track code quality patterns over time

**Acceptance Criteria**:
- [ ] `related_files` accepts array of file paths
- [ ] `related_commits` accepts array of git SHAs
- [ ] GIN index enables efficient file/commit search
- [ ] Backfill script populates from git history
- [ ] Documentation explains how to populate fields

**Priority**: High
**Complexity**: 5 (Medium-High)

### US-003: Code Traceability - Components and Tags

**As a** architect
**I want to** tag retrospectives with affected components
**So that** I can identify problem areas in the codebase

**Acceptance Criteria**:
- [ ] `affected_components` accepts array of component names
- [ ] `tags` accepts array of categorization tags
- [ ] APPLICATION_ISSUE requires affected_components (trigger enforces)
- [ ] CRITICAL/HIGH severity requires tags (trigger enforces)
- [ ] GIN indexes enable efficient tag search

**Priority**: High
**Complexity**: 4 (Medium)

### US-004: Semantic Search - Embedding Generation

**As a** system
**I want to** automatically generate embeddings for retrospectives
**So that** semantic search is always available

**Acceptance Criteria**:
- [ ] `content_embedding` stores vector(1536)
- [ ] Embeddings generated on PUBLISHED status
- [ ] Database constraint enforces embeddings for PUBLISHED
- [ ] Backfill script generates embeddings for existing records
- [ ] Embedding generation script handles rate limits

**Priority**: Critical
**Complexity**: 6 (High)

### US-005: Semantic Search - Query Interface

**As a** PLAN agent
**I want to** search retrospectives by concept/meaning
**So that** I find relevant learnings regardless of wording

**Acceptance Criteria**:
- [ ] `match_retrospectives()` RPC function works
- [ ] IVFFlat index enables fast vector search (<100ms)
- [ ] Combines semantic search with structured filters
- [ ] Returns top N results sorted by similarity
- [ ] `automated-knowledge-retrieval.js` uses semantic search

**Priority**: Critical
**Complexity**: 7 (High)

### US-006: 4-Layer Enforcement - Database Level

**As a** database
**I want to** reject invalid data at storage level
**So that** data integrity is guaranteed

**Acceptance Criteria**:
- [ ] NOT NULL constraints on target_application, learning_category
- [ ] CHECK constraints on enum values
- [ ] Constraint for PUBLISHED retrospectives having embeddings
- [ ] 10 tests validate all constraints
- [ ] Clear error messages on violation

**Priority**: Critical
**Complexity**: 4 (Medium)

### US-007: 4-Layer Enforcement - Application & CI/CD

**As a** developer
**I want to** receive clear validation errors before database insert
**So that** I can fix issues quickly

**Acceptance Criteria**:
- [ ] `validateRetrospective()` checks all new fields
- [ ] Clear error messages with fix suggestions
- [ ] Pre-insert validation catches 100% of constraint violations
- [ ] CI/CD gates prevent merging invalid code
- [ ] 15 tests validate application logic

**Priority**: High
**Complexity**: 5 (Medium-High)

### US-008: Backfill Existing Records

**As a** system administrator
**I want to** update 97 existing retrospectives with new fields
**So that** all retrospectives benefit from enhancements

**Acceptance Criteria**:
- [ ] Backfill script processes in batches (10 at a time)
- [ ] All retrospectives get target_application
- [ ] All retrospectives get learning_category
- [ ] PUBLISHED retrospectives get embeddings
- [ ] Backfill completes in <2 hours
- [ ] No data loss during backfill

**Priority**: Critical
**Complexity**: 6 (High)

### US-009: SD-KNOWLEDGE-001 Integration

**As a** automated knowledge retrieval system
**I want to** use semantic search and new filters
**So that** PRD enrichment is more accurate

**Acceptance Criteria**:
- [ ] `automated-knowledge-retrieval.js` uses semantic search
- [ ] Filters by target_application
- [ ] Filters by learning_category
- [ ] 3x more relevant results per query (measured)
- [ ] Research confidence improves to 95%

**Priority**: High
**Complexity**: 5 (Medium-High)

---

## API Specifications

### RPC Function: `match_retrospectives()`

**Purpose**: Semantic search for retrospectives using vector similarity

**Signature**:
```sql
match_retrospectives(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_application TEXT DEFAULT NULL,
  filter_category TEXT DEFAULT NULL,
  filter_severity TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  sd_id TEXT,
  title TEXT,
  description TEXT,
  target_application TEXT,
  learning_category TEXT,
  severity_level TEXT,
  similarity FLOAT
)
```

**Parameters**:
- `query_embedding`: Vector(1536) from OpenAI embedding
- `match_threshold`: Minimum similarity score (0.0-1.0, default 0.7)
- `match_count`: Maximum results to return (default 10)
- `filter_application`: Optional application filter
- `filter_category`: Optional category filter
- `filter_severity`: Optional severity filter

**Returns**: Table with retrospective details and similarity score

**Example Usage (JavaScript)**:
```javascript
// Generate query embedding
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const embeddingResponse = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'authentication issues with OAuth'
});
const queryEmbedding = embeddingResponse.data[0].embedding;

// Search retrospectives
const { data, error } = await supabase.rpc('match_retrospectives', {
  query_embedding: queryEmbedding,
  match_threshold: 0.7,
  match_count: 10,
  filter_application: 'EHG_engineer',
  filter_category: 'APPLICATION_ISSUE'
});

// Results sorted by similarity
data.forEach(result => {
  console.log(`${result.title} (${(result.similarity * 100).toFixed(1)}% match)`);
});
```

**Performance**: <100ms average with IVFFlat index

---

## Testing Strategy

### Unit Tests (33 tests)

**Database Constraints (10 tests)**:
1. Test target_application NOT NULL
2. Test target_application CHECK (valid values)
3. Test learning_category NOT NULL
4. Test learning_category CHECK (valid enum)
5. Test severity_level CHECK (valid enum)
6. Test content_embedding NOT NULL for PUBLISHED
7. Test time_to_resolve >= 0
8. Test invalid target_application rejected
9. Test invalid learning_category rejected
10. Test PUBLISHED without embedding rejected

**Trigger Logic (8 tests)**:
1. Test applies_to_all_apps auto-population (PROCESS_IMPROVEMENT → true)
2. Test applies_to_all_apps auto-population (APPLICATION_ISSUE → false)
3. Test APPLICATION_ISSUE requires affected_components
4. Test APPLICATION_ISSUE allows empty components for other categories
5. Test CRITICAL severity requires tags
6. Test HIGH severity requires tags
7. Test MEDIUM severity allows empty tags
8. Test PUBLISHED status requires content_embedding

**Application Validation (15 tests)**:
1. Test validateRetrospective() catches missing target_application
2. Test validateRetrospective() catches invalid target_application
3. Test validateRetrospective() catches missing learning_category
4. Test validateRetrospective() catches invalid learning_category
5. Test validateRetrospective() catches APPLICATION_ISSUE without components
6. Test validateRetrospective() catches CRITICAL without tags
7. Test validateRetrospective() catches HIGH without tags
8. Test validateRetrospective() allows valid retrospective
9. Test validateRetrospective() provides clear error messages
10. Test safeInsert() catches type mismatches
11. Test safeInsert() handles array fields correctly
12. Test safeInsert() handles vector fields correctly
13. Test safeInsert() returns clear error messages
14. Test validation errors include field names
15. Test validation errors include fix suggestions

### Integration Tests (8 tests)

**Semantic Search (3 tests)**:
1. Test match_retrospectives() returns results
2. Test match_retrospectives() filters by application
3. Test match_retrospectives() combines filters correctly

**Backfill Process (2 tests)**:
1. Test backfill script updates target_application
2. Test backfill script generates embeddings

**SD-KNOWLEDGE-001 Integration (3 tests)**:
1. Test automated-knowledge-retrieval.js uses semantic search
2. Test automated-knowledge-retrieval.js filters by application
3. Test automated-knowledge-retrieval.js returns 3x more results

### E2E Tests (4 tests)

**Full Flows**:
1. Test: Generate retrospective → validate → insert → verify
2. Test: Search retrospectives semantically → filter → rank → return
3. Test: CI/CD gate → validate fields → check embeddings → pass/fail
4. Test: Backfill → update 97 records → generate embeddings → verify

---

## Migration Strategy

### Phase 1: Database Schema (Week 1)

**Tasks**:
1. Create migration file: `supabase/migrations/013_retrospective_enhancements.sql`
2. Add 9 new columns with defaults
3. Add 5 new constraints (initially deferred)
4. Add 4 new indexes
5. Enhance trigger function
6. Create RPC function
7. Test migration on staging

**Deliverables**:
- Migration file (tested and verified)
- Rollback script (in case of issues)
- Test results (all constraints working)

### Phase 2: Application Updates (Week 2)

**Tasks**:
1. Enhance `generate-comprehensive-retrospective.js`
   - Add new fields to retrospective object
   - Enhance validateRetrospective()
   - Add embedding generation call
2. Create `generate-retrospective-embeddings.js`
   - OpenAI API integration
   - Batch processing
   - Error handling
3. Enhance `automated-knowledge-retrieval.js`
   - Add semantic search
   - Add new filters
   - Fallback to keyword if no embeddings
4. Test all scripts independently

**Deliverables**:
- 3 enhanced scripts
- 1 new script
- Test results (all passing)

### Phase 3: CI/CD & Documentation (Week 3)

**Tasks**:
1. Create GitHub Actions workflow
   - Field validation job
   - Embedding verification job
   - Schema consistency job
2. Create 10 documentation files
   - Schema reference
   - Generation guide
   - Search guide
   - Migration guide
   - API reference
   - LEO integration guide
   - Validation gates guide
   - Examples guide
   - Testing guide
   - Issues/troubleshooting guide

**Deliverables**:
- 1 GitHub Actions workflow (tested)
- 10 documentation files (complete)

### Phase 4: Backfill & Integration (Week 4)

**Tasks**:
1. Create backfill script
   - Analyze 97 existing retrospectives
   - Determine target_application (from SD)
   - Determine learning_category (from analysis)
   - Generate embeddings for PUBLISHED
   - Process in batches (10 at a time)
2. Run backfill on staging
3. Verify data integrity
4. Run backfill on production
5. Integrate with SD-KNOWLEDGE-001
6. Verify 3x improvement in results

**Deliverables**:
- Backfill script (tested)
- Backfill report (97 records updated)
- Integration verification (3x improvement confirmed)

---

## Success Criteria

### Enforcement Metrics

1. **100% Field Compliance**
   - All retrospectives have target_application
   - All retrospectives have learning_category
   - All CRITICAL/HIGH have tags
   - All APPLICATION_ISSUE have affected_components
   - All PUBLISHED have content_embedding

2. **Zero Invalid Data**
   - Database constraints active and enforced
   - Triggers working correctly
   - Application validation catching errors
   - CI/CD gates blocking bad merges

### Search Quality Metrics

3. **90%+ Semantic Search Relevance**
   - User feedback validation
   - A/B testing vs keyword-only
   - Measured with feedback form

4. **3x More Relevant Results**
   - Baseline: Current keyword search
   - Target: Semantic + structured search
   - Measured across 20 test queries

### Integration Metrics

5. **95% Research Confidence**
   - SD-KNOWLEDGE-001 uses enhanced search
   - PRD enrichment quality improves
   - Measured via PLAN agent feedback

6. **60% Cross-Application Learning Adoption**
   - New ventures reference process improvements
   - Tracked in retrospectives
   - Measured via applies_to_all_apps usage

### Technical Metrics

7. **Performance Targets Met**
   - Constraint overhead: <5ms per insert
   - Trigger execution: <10ms per insert
   - Vector search: <100ms average
   - Backfill: <2 hours for 97 records

8. **All Tests Passing**
   - 33 unit tests: 100% pass rate
   - 8 integration tests: 100% pass rate
   - 4 E2E tests: 100% pass rate
   - Total: 45/45 tests passing

### Documentation Metrics

9. **All 10 Documentation Files Complete**
   - Schema reference (updated)
   - Generation guide (created)
   - Search guide (created)
   - Migration guide (created)
   - API reference (updated)
   - LEO integration (created)
   - Validation gates (created)
   - Examples (created)
   - Testing guide (created)
   - Issues/troubleshooting (created)

10. **Zero Blocking Issues**
    - No unresolved bugs
    - No performance regressions
    - No data integrity issues
    - All systems operational

---

## Timeline and Phases

### Week 1: Database Schema & Constraints

**Deliverables**:
- Migration file: `013_retrospective_enhancements.sql`
- 9 new columns
- 5 new constraints
- 4 new indexes
- Enhanced trigger
- RPC function
- 10 unit tests (database constraints)

**Verification**: Migration applied successfully on staging

### Week 2: Application Validation & Semantic Search

**Deliverables**:
- Enhanced `generate-comprehensive-retrospective.js`
- New `generate-retrospective-embeddings.js`
- Enhanced `automated-knowledge-retrieval.js`
- 23 unit tests (trigger + application validation)
- 8 integration tests (semantic search + backfill)

**Verification**: All scripts working with new fields

### Week 3: CI/CD Gates & Documentation

**Deliverables**:
- GitHub Actions workflow
- 3 CI/CD validation jobs
- 10 documentation files
- 4 E2E tests

**Verification**: CI/CD gates tested on staging PR

### Week 4: Backfill & Integration

**Deliverables**:
- Backfill script
- 97 retrospectives updated
- SD-KNOWLEDGE-001 integration
- Integration tests
- Final verification

**Verification**: All success criteria met

**Total Duration**: 3-4 weeks

---

## Dependencies

### Internal Dependencies

1. **SD-KNOWLEDGE-001** (completed)
   - `automated-knowledge-retrieval.js` exists
   - Integration target for semantic search
   - Success: Reuse existing patterns

2. **Prevention Infrastructure** (completed)
   - `schema-validator.js` exists
   - `safe-insert.js` exists
   - Success: Reuse for Layer 3 enforcement

3. **Retrospectives Table** (exists)
   - Current schema: 47 columns
   - Constraints active: quality_score (70-100)
   - Success: Schema ready for enhancements

### External Dependencies

4. **OpenAI API Access**
   - Required for: Embedding generation
   - Model: text-embedding-3-small
   - Cost: ~$0.01/year
   - Mitigation: OPENAI_API_KEY environment variable

5. **pgvector Extension**
   - Required for: Vector similarity search
   - Version: 0.5.0+
   - Status: Built into Supabase
   - Mitigation: Already available

6. **GitHub Actions**
   - Required for: CI/CD gates
   - Status: Available in repository
   - Mitigation: Standard infrastructure

---

## Risks and Mitigations

### Risk 1: Backfill Timeout (HIGH LIKELIHOOD)

**Risk**: Processing 97 retrospectives may timeout

**Impact**: Medium (backfill incomplete)

**Mitigation**:
- Batch processing (10 at a time)
- Retry logic with exponential backoff
- Progress tracking with resume capability
- Test on staging first

**Status**: Mitigated

### Risk 2: Embedding Generation Cost (LOW LIKELIHOOD)

**Risk**: OpenAI API costs exceed budget

**Impact**: Low (~$0.01/year estimated)

**Mitigation**:
- Use cheapest model (text-embedding-3-small)
- Generate embeddings only for PUBLISHED
- Cache embeddings (never regenerate)
- Monitor costs in OpenAI dashboard

**Status**: Mitigated (negligible cost)

### Risk 3: Constraint Violations in Existing Code (MEDIUM LIKELIHOOD)

**Risk**: Existing scripts may violate new constraints

**Impact**: Medium (scripts break)

**Mitigation**:
- Add constraints as deferred initially
- Test all scripts on staging
- Layer 3 validation catches issues pre-insert
- Clear error messages with fix suggestions

**Status**: Mitigated

### Risk 4: Vector Search Performance (MEDIUM LIKELIHOOD)

**Risk**: Vector search may be slow without proper indexing

**Impact**: Medium (search timeout)

**Mitigation**:
- IVFFlat index with appropriate lists parameter
- Test with 97 records + growth
- Fallback to keyword search if timeout
- Monitor query performance

**Status**: Mitigated

### Risk 5: Breaking Changes to Retrospective Generation (LOW LIKELIHOOD)

**Risk**: Enhancements may break existing generation

**Impact**: High (no new retrospectives)

**Mitigation**:
- Backward compatibility: new fields have defaults
- Extensive testing (45 tests total)
- Staged rollout (staging → production)
- Rollback plan ready

**Status**: Mitigated

---

## Documentation Deliverables

### 1. retrospective-schema-reference.md (UPDATE)
- Complete column reference with new fields
- Constraint explanations
- Index descriptions
- Examples for each field

### 2. retrospective-generation-guide.md (CREATE)
- How to generate retrospectives with new fields
- Field population guidelines
- Validation requirements
- Common errors and fixes

### 3. retrospective-search-guide.md (CREATE)
- Semantic search usage
- Filter combinations
- Query optimization
- Relevance scoring

### 4. retrospective-enhancement-migration-guide.md (CREATE)
- Migration steps
- Backfill process
- Rollback procedures
- Verification checklist

### 5. retrospective-api.md (UPDATE)
- `match_retrospectives()` RPC reference
- Parameter descriptions
- Example queries
- Performance considerations

### 6. leo-retrospective-integration.md (CREATE)
- SD-KNOWLEDGE-001 integration
- Usage in automated retrieval
- Filter strategies
- Expected improvements

### 7. retrospective-validation-gates.md (CREATE)
- 4-layer enforcement explanation
- Layer 1: Database constraints
- Layer 2: Triggers
- Layer 3: Application validation
- Layer 4: CI/CD gates

### 8. retrospective-examples.md (CREATE)
- Complete retrospective examples
- Each learning_category represented
- Good vs bad examples
- Field population patterns

### 9. retrospective-testing-guide.md (CREATE)
- How to run tests
- Test structure explanation
- Adding new tests
- CI/CD integration

### 10. retrospective-issues.md (CREATE - troubleshooting)
- Common errors and fixes
- Constraint violation messages
- Trigger error explanations
- Performance troubleshooting

---

## Appendix A: Database Migration Script (Preview)

```sql
-- Migration: 013_retrospective_enhancements.sql
-- Purpose: Add multi-application context, code traceability, and semantic search
-- Related: SD-RETRO-ENHANCE-001

BEGIN;

-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- STEP 1: Add new columns with defaults (allows existing records to remain valid)
-- ============================================================================

-- Application Context (3 columns)
ALTER TABLE retrospectives ADD COLUMN target_application TEXT DEFAULT 'EHG_engineer';
ALTER TABLE retrospectives ADD COLUMN learning_category TEXT DEFAULT 'PROCESS_IMPROVEMENT';
ALTER TABLE retrospectives ADD COLUMN applies_to_all_apps BOOLEAN DEFAULT false;

-- Code Traceability (5 columns)
ALTER TABLE retrospectives ADD COLUMN related_files TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE retrospectives ADD COLUMN related_commits TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE retrospectives ADD COLUMN related_prs TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE retrospectives ADD COLUMN affected_components TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE retrospectives ADD COLUMN tags TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Search & Aggregation (2 columns)
ALTER TABLE retrospectives ADD COLUMN severity_level TEXT DEFAULT 'MEDIUM';
ALTER TABLE retrospectives ADD COLUMN time_to_resolve NUMERIC(10, 2);

-- Semantic Search (1 column)
ALTER TABLE retrospectives ADD COLUMN content_embedding VECTOR(1536);

-- ============================================================================
-- STEP 2: Add constraints (after defaults are set)
-- ============================================================================

-- target_application constraint
ALTER TABLE retrospectives
ADD CONSTRAINT retrospectives_target_application_check
CHECK (
  target_application = 'EHG_engineer' OR
  target_application = 'EHG' OR
  target_application LIKE 'venture_%'
);

ALTER TABLE retrospectives ALTER COLUMN target_application SET NOT NULL;

-- learning_category constraint
ALTER TABLE retrospectives
ADD CONSTRAINT retrospectives_learning_category_check
CHECK (learning_category IN (
  'PROCESS_IMPROVEMENT', 'APPLICATION_ISSUE', 'INFRASTRUCTURE',
  'ARCHITECTURE_DECISION', 'TEAM_COLLABORATION', 'TOOL_ADOPTION',
  'PERFORMANCE_OPTIMIZATION', 'SECURITY_ENHANCEMENT', 'USER_EXPERIENCE'
));

ALTER TABLE retrospectives ALTER COLUMN learning_category SET NOT NULL;

-- severity_level constraint
ALTER TABLE retrospectives
ADD CONSTRAINT retrospectives_severity_level_check
CHECK (severity_level IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'));

-- time_to_resolve constraint
ALTER TABLE retrospectives
ADD CONSTRAINT retrospectives_time_to_resolve_check
CHECK (time_to_resolve IS NULL OR time_to_resolve >= 0);

-- ============================================================================
-- STEP 3: Add indexes
-- ============================================================================

CREATE INDEX idx_retrospectives_related_files
ON retrospectives USING GIN (related_files);

CREATE INDEX idx_retrospectives_tags
ON retrospectives USING GIN (tags);

CREATE INDEX idx_retrospectives_target_application
ON retrospectives (target_application);

-- IVFFlat index for vector similarity (will be populated during backfill)
CREATE INDEX idx_retrospectives_content_embedding
ON retrospectives
USING ivfflat (content_embedding vector_cosine_ops)
WITH (lists = 100);

-- ============================================================================
-- STEP 4: Enhance validation trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_validate_retrospective_quality()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  -- (existing variable declarations)
BEGIN
  -- (existing quality scoring logic)

  -- NEW: Auto-populate applies_to_all_apps
  IF NEW.learning_category IN (
    'PROCESS_IMPROVEMENT',
    'TEAM_COLLABORATION',
    'INFRASTRUCTURE'
  ) THEN
    NEW.applies_to_all_apps := true;
  ELSE
    NEW.applies_to_all_apps := false;
  END IF;

  -- NEW: Validate APPLICATION_ISSUE has affected_components
  IF NEW.learning_category = 'APPLICATION_ISSUE' THEN
    IF NEW.affected_components IS NULL OR
       array_length(NEW.affected_components, 1) = 0 THEN
      RAISE EXCEPTION
        'APPLICATION_ISSUE learning_category requires at least one affected_component. ' ||
        'Example: affected_components := ARRAY[''VentureCard'', ''AuthService'']';
    END IF;
  END IF;

  -- NEW: Validate CRITICAL/HIGH severity has tags
  IF NEW.severity_level IN ('CRITICAL', 'HIGH') THEN
    IF NEW.tags IS NULL OR array_length(NEW.tags, 1) = 0 THEN
      RAISE EXCEPTION
        'CRITICAL/HIGH severity requires at least one tag for categorization. ' ||
        'Example: tags := ARRAY[''bug'', ''authentication'', ''security'']';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- STEP 5: Create semantic search RPC function
-- ============================================================================

CREATE OR REPLACE FUNCTION match_retrospectives(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_application TEXT DEFAULT NULL,
  filter_category TEXT DEFAULT NULL,
  filter_severity TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  sd_id TEXT,
  title TEXT,
  description TEXT,
  target_application TEXT,
  learning_category TEXT,
  severity_level TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.sd_id,
    r.title,
    r.description,
    r.target_application,
    r.learning_category,
    r.severity_level,
    1 - (r.content_embedding <=> query_embedding) AS similarity
  FROM retrospectives r
  WHERE r.status = 'PUBLISHED'
    AND r.content_embedding IS NOT NULL
    AND 1 - (r.content_embedding <=> query_embedding) > match_threshold
    AND (filter_application IS NULL OR r.target_application = filter_application)
    AND (filter_category IS NULL OR r.learning_category = filter_category)
    AND (filter_severity IS NULL OR r.severity_level = filter_severity)
  ORDER BY r.content_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMIT;

-- ============================================================================
-- Verification queries
-- ============================================================================

-- Verify columns added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'retrospectives'
  AND column_name IN (
    'target_application', 'learning_category', 'applies_to_all_apps',
    'related_files', 'related_commits', 'related_prs',
    'affected_components', 'tags',
    'severity_level', 'time_to_resolve', 'content_embedding'
  )
ORDER BY ordinal_position;

-- Verify constraints added
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'retrospectives'
  AND constraint_name LIKE '%target_application%'
     OR constraint_name LIKE '%learning_category%'
     OR constraint_name LIKE '%severity_level%';

-- Verify indexes added
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'retrospectives'
  AND indexname LIKE '%related_files%'
     OR indexname LIKE '%tags%'
     OR indexname LIKE '%target_application%'
     OR indexname LIKE '%content_embedding%';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Retrospective enhancements migration complete!';
  RAISE NOTICE '   - 9 columns added';
  RAISE NOTICE '   - 5 constraints added';
  RAISE NOTICE '   - 4 indexes created';
  RAISE NOTICE '   - 1 trigger enhanced';
  RAISE NOTICE '   - 1 RPC function created';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Next steps:';
  RAISE NOTICE '   1. Run backfill script to populate new fields';
  RAISE NOTICE '   2. Generate embeddings for PUBLISHED retrospectives';
  RAISE NOTICE '   3. Test semantic search with match_retrospectives()';
  RAISE NOTICE '';
END;
$$;
```

---

## Appendix B: Application Validation Enhancement (Preview)

```javascript
// Enhanced validateRetrospective() function
// File: scripts/generate-comprehensive-retrospective.js

function validateRetrospective(retrospective) {
  const errors = [];

  // Existing validations (quality_score, required fields, arrays)
  // ... (existing code)

  // ==========================================================================
  // NEW VALIDATIONS for SD-RETRO-ENHANCE-001
  // ==========================================================================

  // Validate target_application (REQUIRED)
  if (!retrospective.target_application) {
    errors.push({
      field: 'target_application',
      error: 'target_application is required',
      suggestion: 'Set to "EHG_engineer", "EHG", or "venture_*"'
    });
  } else {
    const validApps = ['EHG_engineer', 'EHG'];
    const isVenture = retrospective.target_application.startsWith('venture_');
    if (!validApps.includes(retrospective.target_application) && !isVenture) {
      errors.push({
        field: 'target_application',
        error: `Invalid target_application: "${retrospective.target_application}"`,
        suggestion: 'Must be "EHG_engineer", "EHG", or "venture_*" pattern',
        received: retrospective.target_application
      });
    }
  }

  // Validate learning_category (REQUIRED)
  const validCategories = [
    'PROCESS_IMPROVEMENT', 'APPLICATION_ISSUE', 'INFRASTRUCTURE',
    'ARCHITECTURE_DECISION', 'TEAM_COLLABORATION', 'TOOL_ADOPTION',
    'PERFORMANCE_OPTIMIZATION', 'SECURITY_ENHANCEMENT', 'USER_EXPERIENCE'
  ];
  if (!retrospective.learning_category) {
    errors.push({
      field: 'learning_category',
      error: 'learning_category is required',
      suggestion: `Must be one of: ${validCategories.join(', ')}`
    });
  } else if (!validCategories.includes(retrospective.learning_category)) {
    errors.push({
      field: 'learning_category',
      error: `Invalid learning_category: "${retrospective.learning_category}"`,
      suggestion: `Must be one of: ${validCategories.join(', ')}`,
      received: retrospective.learning_category
    });
  }

  // Validate APPLICATION_ISSUE has affected_components
  if (retrospective.learning_category === 'APPLICATION_ISSUE') {
    if (!retrospective.affected_components ||
        retrospective.affected_components.length === 0) {
      errors.push({
        field: 'affected_components',
        error: 'APPLICATION_ISSUE learning_category requires at least one affected_component',
        suggestion: 'Add components like ["VentureCard", "AuthService", "Dashboard"]'
      });
    }
  }

  // Validate CRITICAL/HIGH severity has tags
  if (['CRITICAL', 'HIGH'].includes(retrospective.severity_level)) {
    if (!retrospective.tags || retrospective.tags.length === 0) {
      errors.push({
        field: 'tags',
        error: `${retrospective.severity_level} severity requires at least one tag`,
        suggestion: 'Add categorization tags like ["bug", "authentication", "performance"]'
      });
    }
  }

  // Validate severity_level is valid enum value
  const validSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
  if (retrospective.severity_level &&
      !validSeverities.includes(retrospective.severity_level)) {
    errors.push({
      field: 'severity_level',
      error: `Invalid severity_level: "${retrospective.severity_level}"`,
      suggestion: `Must be one of: ${validSeverities.join(', ')}`,
      received: retrospective.severity_level
    });
  }

  // Validate time_to_resolve is positive
  if (retrospective.time_to_resolve !== null &&
      retrospective.time_to_resolve !== undefined) {
    if (retrospective.time_to_resolve < 0) {
      errors.push({
        field: 'time_to_resolve',
        error: `time_to_resolve must be >= 0 (received: ${retrospective.time_to_resolve})`,
        suggestion: 'Set to actual hours spent resolving, or omit if unknown'
      });
    }
  }

  // Validate arrays are actually arrays (type safety)
  const arrayFields = [
    'related_files', 'related_commits', 'related_prs',
    'affected_components', 'tags'
  ];
  arrayFields.forEach(field => {
    if (retrospective[field] !== undefined &&
        retrospective[field] !== null &&
        !Array.isArray(retrospective[field])) {
      errors.push({
        field,
        error: `${field} must be an array (received: ${typeof retrospective[field]})`,
        suggestion: `Set to [] for empty or ["value1", "value2"] for items`
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}
```

---

**END OF PRD**

**Document Version**: 1.0
**Last Updated**: 2025-10-16
**Status**: Ready for PLAN→EXEC Handoff
**Next Phase**: EXEC (Implementation)
