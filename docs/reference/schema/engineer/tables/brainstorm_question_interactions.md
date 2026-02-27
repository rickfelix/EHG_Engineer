# brainstorm_question_interactions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-27T22:03:40.633Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| session_id | `uuid` | **NO** | - | - |
| question_id | `text` | **NO** | - | - |
| domain | `text` | **NO** | - | - |
| phase | `text` | **NO** | - | - |
| outcome | `text` | **NO** | - | - |
| answer_length | `integer(32)` | YES | `0` | - |
| revised_count | `integer(32)` | YES | `0` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `brainstorm_question_interactions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `brainstorm_question_interactions_session_id_fkey`: session_id → brainstorm_sessions(id)

### Check Constraints
- `brainstorm_question_interactions_outcome_check`: CHECK ((outcome = ANY (ARRAY['answered'::text, 'skipped'::text, 'revised'::text])))

## Indexes

- `brainstorm_question_interactions_pkey`
  ```sql
  CREATE UNIQUE INDEX brainstorm_question_interactions_pkey ON public.brainstorm_question_interactions USING btree (id)
  ```
- `idx_brainstorm_q_interactions_domain`
  ```sql
  CREATE INDEX idx_brainstorm_q_interactions_domain ON public.brainstorm_question_interactions USING btree (domain)
  ```
- `idx_brainstorm_q_interactions_outcome`
  ```sql
  CREATE INDEX idx_brainstorm_q_interactions_outcome ON public.brainstorm_question_interactions USING btree (outcome)
  ```
- `idx_brainstorm_q_interactions_question`
  ```sql
  CREATE INDEX idx_brainstorm_q_interactions_question ON public.brainstorm_question_interactions USING btree (question_id)
  ```
- `idx_brainstorm_q_interactions_session`
  ```sql
  CREATE INDEX idx_brainstorm_q_interactions_session ON public.brainstorm_question_interactions USING btree (session_id)
  ```

## RLS Policies

### 1. manage_brainstorm_q_interactions (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. select_brainstorm_q_interactions (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
