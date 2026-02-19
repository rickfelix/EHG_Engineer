# brainstorm_sessions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-19T23:26:50.288Z
**Rows**: 4
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (21 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| domain | `text` | **NO** | - | - |
| topic | `text` | **NO** | - | - |
| mode | `text` | **NO** | `'conversational'::text` | - |
| stage | `text` | YES | - | - |
| venture_ids | `ARRAY` | YES | `'{}'::uuid[]` | - |
| cross_venture | `boolean` | YES | `false` | - |
| capabilities_status | `text` | **NO** | `'not_checked'::text` | - |
| matched_capabilities | `jsonb` | YES | `'[]'::jsonb` | - |
| new_capability_candidates | `jsonb` | YES | `'[]'::jsonb` | - |
| outcome_type | `text` | YES | - | - |
| outcome_auto_classified | `boolean` | YES | `false` | - |
| conflict_flag | `boolean` | YES | `false` | - |
| session_quality_score | `numeric(4,3)` | YES | - | - |
| crystallization_score | `numeric(4,3)` | YES | - | - |
| retrospective_status | `text` | **NO** | `'pending'::text` | - |
| document_path | `text` | YES | - | - |
| created_sd_id | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `brainstorm_sessions_pkey`: PRIMARY KEY (id)

### Check Constraints
- `brainstorm_sessions_capabilities_status_check`: CHECK ((capabilities_status = ANY (ARRAY['matched'::text, 'unavailable'::text, 'not_checked'::text, 'empty'::text])))
- `brainstorm_sessions_crystallization_score_check`: CHECK (((crystallization_score >= (0)::numeric) AND (crystallization_score <= (1)::numeric)))
- `brainstorm_sessions_domain_check`: CHECK ((domain = ANY (ARRAY['venture'::text, 'protocol'::text, 'integration'::text, 'architecture'::text])))
- `brainstorm_sessions_mode_check`: CHECK ((mode = ANY (ARRAY['conversational'::text, 'structured'::text])))
- `brainstorm_sessions_outcome_type_check`: CHECK ((outcome_type = ANY (ARRAY['sd_created'::text, 'quick_fix'::text, 'no_action'::text, 'consideration_only'::text, 'needs_triage'::text, 'conflict'::text, 'significant_departure'::text])))
- `brainstorm_sessions_retrospective_status_check`: CHECK ((retrospective_status = ANY (ARRAY['pending'::text, 'completed'::text, 'queued'::text, 'failed'::text])))
- `brainstorm_sessions_session_quality_score_check`: CHECK (((session_quality_score >= (0)::numeric) AND (session_quality_score <= (1)::numeric)))
- `brainstorm_sessions_stage_check`: CHECK ((stage = ANY (ARRAY['ideation'::text, 'validation'::text, 'mvp'::text, 'growth'::text, 'scale'::text])))

## Indexes

- `brainstorm_sessions_pkey`
  ```sql
  CREATE UNIQUE INDEX brainstorm_sessions_pkey ON public.brainstorm_sessions USING btree (id)
  ```
- `idx_brainstorm_sessions_conflict`
  ```sql
  CREATE INDEX idx_brainstorm_sessions_conflict ON public.brainstorm_sessions USING btree (conflict_flag) WHERE (conflict_flag = true)
  ```
- `idx_brainstorm_sessions_created_at`
  ```sql
  CREATE INDEX idx_brainstorm_sessions_created_at ON public.brainstorm_sessions USING btree (created_at DESC)
  ```
- `idx_brainstorm_sessions_created_sd`
  ```sql
  CREATE INDEX idx_brainstorm_sessions_created_sd ON public.brainstorm_sessions USING btree (created_sd_id) WHERE (created_sd_id IS NOT NULL)
  ```
- `idx_brainstorm_sessions_domain`
  ```sql
  CREATE INDEX idx_brainstorm_sessions_domain ON public.brainstorm_sessions USING btree (domain)
  ```
- `idx_brainstorm_sessions_outcome`
  ```sql
  CREATE INDEX idx_brainstorm_sessions_outcome ON public.brainstorm_sessions USING btree (outcome_type)
  ```
- `idx_brainstorm_sessions_retro_pending`
  ```sql
  CREATE INDEX idx_brainstorm_sessions_retro_pending ON public.brainstorm_sessions USING btree (retrospective_status) WHERE (retrospective_status = 'pending'::text)
  ```
- `idx_brainstorm_sessions_venture_ids`
  ```sql
  CREATE INDEX idx_brainstorm_sessions_venture_ids ON public.brainstorm_sessions USING gin (venture_ids)
  ```

## RLS Policies

### 1. manage_brainstorm_sessions (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. select_brainstorm_sessions (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trg_brainstorm_sessions_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_brainstorm_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
