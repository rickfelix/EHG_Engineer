# debate_arguments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T00:14:08.377Z
**Rows**: 6
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| debate_session_id | `uuid` | **NO** | - | - |
| round_number | `integer(32)` | **NO** | - | - |
| agent_code | `text` | **NO** | - | - |
| argument_type | `text` | **NO** | - | - |
| summary | `text` | **NO** | - | - |
| detailed_reasoning | `text` | **NO** | - | - |
| constitution_citations | `jsonb` | YES | `'[]'::jsonb` | - |
| evidence_refs | `jsonb` | YES | `'[]'::jsonb` | - |
| confidence_score | `numeric(3,2)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| in_response_to_argument_id | `uuid` | YES | - | - |

## Constraints

### Primary Key
- `debate_arguments_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `debate_arguments_debate_session_id_fkey`: debate_session_id → debate_sessions(id)
- `debate_arguments_in_response_to_argument_id_fkey`: in_response_to_argument_id → debate_arguments(id)

### Check Constraints
- `debate_arguments_argument_type_check`: CHECK ((argument_type = ANY (ARRAY['initial_position'::text, 'rebuttal'::text, 'clarification'::text, 'constitution_citation'::text, 'evidence'::text])))
- `debate_arguments_confidence_score_check`: CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)))
- `debate_arguments_round_number_check`: CHECK ((round_number >= 1))

## Indexes

- `debate_arguments_pkey`
  ```sql
  CREATE UNIQUE INDEX debate_arguments_pkey ON public.debate_arguments USING btree (id)
  ```
- `idx_debate_arguments_agent`
  ```sql
  CREATE INDEX idx_debate_arguments_agent ON public.debate_arguments USING btree (agent_code)
  ```
- `idx_debate_arguments_created_at`
  ```sql
  CREATE INDEX idx_debate_arguments_created_at ON public.debate_arguments USING btree (created_at DESC)
  ```
- `idx_debate_arguments_response`
  ```sql
  CREATE INDEX idx_debate_arguments_response ON public.debate_arguments USING btree (in_response_to_argument_id) WHERE (in_response_to_argument_id IS NOT NULL)
  ```
- `idx_debate_arguments_round`
  ```sql
  CREATE INDEX idx_debate_arguments_round ON public.debate_arguments USING btree (debate_session_id, round_number)
  ```
- `idx_debate_arguments_session`
  ```sql
  CREATE INDEX idx_debate_arguments_session ON public.debate_arguments USING btree (debate_session_id)
  ```

## RLS Policies

### 1. Allow authenticated to insert debate arguments (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. Allow read access to debate arguments (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
