# Migration Summary: Brainstorm Sessions

**Migration File**: `20260210_brainstorm_sessions.sql`
**SD**: SD-LEO-FEAT-EXPAND-BRAINSTORM-COMMAND-001
**Executed**: 2026-02-10
**Status**: ✅ COMPLETE

## Overview

Created comprehensive schema for tracking brainstorming sessions across multiple domains (venture, protocol, integration, architecture) with question effectiveness analytics and outcome classification.

## Tables Created

### 1. `brainstorm_sessions`
**Purpose**: Track brainstorming sessions with outcome classification and quality metrics

**Key Columns**:
- `domain`: venture | protocol | integration | architecture
- `topic`: Session topic (text)
- `mode`: conversational | structured
- `stage`: ideation | validation | mvp | growth | scale (venture-specific)
- `venture_ids`: Array of related venture IDs
- `capabilities_status`: matched | unavailable | not_checked | empty
- `matched_capabilities`: JSONB array of matched capabilities
- `new_capability_candidates`: JSONB array of potential new capabilities
- `outcome_type`: sd_created | quick_fix | no_action | consideration_only | needs_triage | conflict | significant_departure
- `outcome_auto_classified`: Boolean flag for automatic classification
- `conflict_flag`: Boolean flag for architectural/strategic conflicts
- `session_quality_score`: Numeric(4,3) between 0 and 1
- `crystallization_score`: Numeric(4,3) between 0 and 1
- `retrospective_status`: pending | completed | queued | failed
- `document_path`: Path to session document
- `created_sd_id`: References strategic_directives_v2.sd_key if SD created
- `metadata`: JSONB for extensibility
- `created_at`, `updated_at`: Timestamps

**Indexes**:
- `idx_brainstorm_sessions_domain` - Query by domain
- `idx_brainstorm_sessions_outcome` - Query by outcome type
- `idx_brainstorm_sessions_conflict` - Filter conflict-flagged sessions
- `idx_brainstorm_sessions_retro_pending` - Find sessions needing retrospective
- `idx_brainstorm_sessions_venture_ids` - GIN index for venture ID queries
- `idx_brainstorm_sessions_created_sd` - Query sessions that created SDs
- `idx_brainstorm_sessions_created_at` - Time-ordered queries

### 2. `brainstorm_question_interactions`
**Purpose**: Track user responses to individual questions for effectiveness measurement

**Key Columns**:
- `session_id`: Foreign key to brainstorm_sessions (CASCADE DELETE)
- `question_id`: Unique question identifier (e.g., 'protocol.discovery.problem')
- `domain`: Question domain
- `phase`: Phase within domain workflow
- `outcome`: answered | skipped | revised
- `answer_length`: Integer character count
- `revised_count`: Number of times user revised answer
- `created_at`: Timestamp

**Indexes**:
- `idx_brainstorm_q_interactions_session` - Query by session
- `idx_brainstorm_q_interactions_question` - Query by question
- `idx_brainstorm_q_interactions_outcome` - Filter by outcome type
- `idx_brainstorm_q_interactions_domain` - Query by domain

### 3. `brainstorm_question_effectiveness`
**Purpose**: Aggregate effectiveness metrics per question across all sessions

**Key Columns**:
- `domain`: Question domain
- `question_id`: Unique question identifier
- `effectiveness_score`: Numeric(5,3) between 0 and 1
- `total_sessions`: Total sessions where question appeared
- `answered_count`: Number of times answered
- `skipped_count`: Number of times skipped
- `avg_answer_length`: Average character count
- `led_to_action_count`: Sessions resulting in sd_created or quick_fix
- `updated_at`: Timestamp

**Unique Constraint**: (domain, question_id)

**Indexes**:
- `idx_brainstorm_q_effectiveness_domain` - Query by domain
- `idx_brainstorm_q_effectiveness_score` - Order by effectiveness score
- `idx_brainstorm_q_effectiveness_skip_rate` - Calculated skip rate index

## RLS Policies

All three tables have identical RLS policy structure:

- **SELECT**: `authenticated` role (read access for logged-in users)
- **ALL**: `service_role` (full access for backend operations)

**Policies**:
- `select_brainstorm_sessions` / `select_brainstorm_q_interactions` / `select_brainstorm_q_effectiveness`
- `manage_brainstorm_sessions` / `manage_brainstorm_q_interactions` / `manage_brainstorm_q_effectiveness`

## Triggers

**Function**: `update_brainstorm_updated_at()`
**Purpose**: Automatically update `updated_at` column on UPDATE operations

**Applied to**:
- `brainstorm_sessions.updated_at` via `trg_brainstorm_sessions_updated`
- `brainstorm_question_effectiveness.updated_at` via `trg_brainstorm_q_effectiveness_updated`

**Verification**: ✅ Tested with INSERT and UPDATE operations - triggers fire correctly

## Use Cases

### Session Tracking
- Track brainstorming sessions across multiple domains
- Classify outcomes (SD creation, quick-fix, consideration-only, etc.)
- Flag conflicts with existing architecture/strategy
- Track capability matching results
- Quality scoring for retrospective analysis

### Question Effectiveness Analysis
- Measure which questions get answered vs skipped
- Track answer quality (length, revision patterns)
- Identify high-value vs low-value questions
- Optimize question ordering based on effectiveness scores
- Correlate questions with actionable outcomes

### Retrospective Integration
- Pending sessions queue for retrospective analysis
- Track which brainstorms led to SD creation
- Quality metrics for continuous improvement
- Cross-session pattern analysis

## Connection Pattern

Migration executed using SUPABASE_POOLER_URL (no password required):

```javascript
const { Client } = require('pg');
const client = new Client({
  connectionString: process.env.SUPABASE_POOLER_URL
});
```

## Verification Performed

1. ✅ All three tables created successfully
2. ✅ All indexes created (18 total)
3. ✅ RLS policies applied correctly (6 policies)
4. ✅ Triggers created and tested
5. ✅ Foreign key constraint (brainstorm_question_interactions → brainstorm_sessions)
6. ✅ CHECK constraints on domain, mode, outcome_type, etc.
7. ✅ UNIQUE constraint on (domain, question_id) in effectiveness table
8. ✅ GIN index on venture_ids array column

## Next Steps

1. Update `/brainstorm` CLI command to write to these tables
2. Implement question effectiveness calculation logic
3. Create retrospective integration hook for `pending` sessions
4. Build analytics queries for question optimization
5. Update schema documentation via `npm run schema:docs:engineer`
