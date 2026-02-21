# eva_claude_code_intake Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-21T15:06:05.923Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (20 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| github_release_id | `bigint(64)` | **NO** | - | GitHub API release ID — dedup key |
| tag_name | `text` | **NO** | - | - |
| title | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| release_url | `text` | YES | - | - |
| published_at | `timestamp with time zone` | YES | - | - |
| is_prerelease | `boolean` | YES | `false` | - |
| relevance_score | `numeric(3,2)` | YES | - | 0.0-1.0 score of how relevant this release is to EHG workflows |
| impact_areas | `jsonb` | YES | `'[]'::jsonb` | - |
| analysis_summary | `text` | YES | - | - |
| workflow_improvements | `jsonb` | YES | `'[]'::jsonb` | - |
| recommendation | `text` | YES | - | Analysis recommendation: adopt, evaluate, monitor, or skip |
| feedback_id | `uuid` | YES | - | - |
| approval_request_id | `uuid` | YES | - | - |
| brainstorm_session_id | `uuid` | YES | - | - |
| status | `text` | **NO** | `'pending'::text` | Lifecycle: pending → evaluating → notified → approved/rejected/skipped → processed |
| raw_data | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_claude_code_intake_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `eva_claude_code_intake_github_release_id_key`: UNIQUE (github_release_id)

### Check Constraints
- `eva_claude_code_intake_recommendation_check`: CHECK ((recommendation = ANY (ARRAY['adopt'::text, 'evaluate'::text, 'monitor'::text, 'skip'::text])))
- `eva_claude_code_intake_relevance_score_check`: CHECK (((relevance_score >= (0)::numeric) AND (relevance_score <= (1)::numeric)))
- `eva_claude_code_intake_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'evaluating'::text, 'notified'::text, 'approved'::text, 'rejected'::text, 'skipped'::text, 'processed'::text, 'error'::text])))

## Indexes

- `eva_claude_code_intake_github_release_id_key`
  ```sql
  CREATE UNIQUE INDEX eva_claude_code_intake_github_release_id_key ON public.eva_claude_code_intake USING btree (github_release_id)
  ```
- `eva_claude_code_intake_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_claude_code_intake_pkey ON public.eva_claude_code_intake USING btree (id)
  ```
- `idx_eva_cc_intake_pending`
  ```sql
  CREATE INDEX idx_eva_cc_intake_pending ON public.eva_claude_code_intake USING btree (status) WHERE (status = 'pending'::text)
  ```
- `idx_eva_cc_intake_published`
  ```sql
  CREATE INDEX idx_eva_cc_intake_published ON public.eva_claude_code_intake USING btree (published_at DESC)
  ```
- `idx_eva_cc_intake_status`
  ```sql
  CREATE INDEX idx_eva_cc_intake_status ON public.eva_claude_code_intake USING btree (status)
  ```
- `idx_eva_cc_intake_tag`
  ```sql
  CREATE INDEX idx_eva_cc_intake_tag ON public.eva_claude_code_intake USING btree (tag_name)
  ```

## RLS Policies

### 1. manage_eva_claude_code_intake (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. select_eva_claude_code_intake (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trg_eva_claude_code_intake_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_eva_intake_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
