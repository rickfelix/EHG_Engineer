# sdip_submissions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-08T22:48:54.513Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (37 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `bigint(64)` | **NO** | `nextval('sdip_submissions_id_seq'::regclass)` | - |
| submission_title | `text` | YES | - | - |
| screenshot_url | `text` | YES | - | - |
| chairman_input | `text` | **NO** | - | - |
| pacer_analysis | `jsonb` | YES | - | PACER categorization - backend only, not displayed in UI |
| pacer_version | `text` | YES | `'v1.0'::text` | - |
| intent_summary | `text` | YES | - | - |
| intent_original | `text` | YES | - | - |
| intent_confirmed | `boolean` | YES | `false` | - |
| intent_confirmed_at | `timestamp with time zone` | YES | - | - |
| strat_tac_system | `jsonb` | YES | - | - |
| strat_tac_override | `jsonb` | YES | - | - |
| strat_tac_final | `jsonb` | YES | - | - |
| strat_tac_reviewed | `boolean` | YES | `false` | - |
| strat_tac_reviewed_at | `timestamp with time zone` | YES | - | - |
| synthesis | `jsonb` | YES | - | - |
| change_policies | `jsonb` | YES | - | - |
| synthesis_reviewed | `boolean` | YES | `false` | - |
| synthesis_reviewed_at | `timestamp with time zone` | YES | - | - |
| clarifying_questions | `jsonb` | YES | - | - |
| question_answers | `jsonb` | YES | - | - |
| questions_answered | `boolean` | YES | `false` | - |
| questions_answered_at | `timestamp with time zone` | YES | - | - |
| client_summary | `text` | YES | - | - |
| summary_confirmed | `boolean` | YES | `false` | - |
| summary_confirmed_at | `timestamp with time zone` | YES | - | - |
| current_step | `integer(32)` | YES | `1` | - |
| validation_complete | `boolean` | YES | `false` | - |
| all_gates_passed | `boolean` | YES | `false` | - |
| gate_status | `jsonb` | YES | `'{"step1": false, "step2": false, "step3": false, "step4": false, "step5": false, "step6": false}'::jsonb` | Tracks which validation gates have been passed |
| analysis_mode | `text` | YES | `'CRITICAL'::text` | Critical mode only in MVP+, no supportive mode |
| group_id | `uuid` | YES | - | - |
| created_by | `uuid` | **NO** | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| resulting_sd_id | `text` | YES | - | - |

## Constraints

### Primary Key
- `sdip_submissions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `fk_group_id`: group_id → sdip_groups(id)

### Check Constraints
- `sdip_submissions_analysis_mode_check`: CHECK ((analysis_mode = 'CRITICAL'::text))
- `sdip_submissions_current_step_check`: CHECK (((current_step >= 1) AND (current_step <= 6)))

## Indexes

- `idx_sdip_created_at`
  ```sql
  CREATE INDEX idx_sdip_created_at ON public.sdip_submissions USING btree (created_at DESC)
  ```
- `idx_sdip_created_by`
  ```sql
  CREATE INDEX idx_sdip_created_by ON public.sdip_submissions USING btree (created_by)
  ```
- `idx_sdip_current_step`
  ```sql
  CREATE INDEX idx_sdip_current_step ON public.sdip_submissions USING btree (current_step) WHERE (validation_complete = false)
  ```
- `idx_sdip_date_range`
  ```sql
  CREATE INDEX idx_sdip_date_range ON public.sdip_submissions USING btree (created_at, updated_at)
  ```
- `idx_sdip_gate_tracking`
  ```sql
  CREATE INDEX idx_sdip_gate_tracking ON public.sdip_submissions USING btree (current_step, validation_complete) WHERE (validation_complete = false)
  ```
- `idx_sdip_group_id`
  ```sql
  CREATE INDEX idx_sdip_group_id ON public.sdip_submissions USING btree (group_id) WHERE (group_id IS NOT NULL)
  ```
- `idx_sdip_resulting_sd`
  ```sql
  CREATE INDEX idx_sdip_resulting_sd ON public.sdip_submissions USING btree (resulting_sd_id) WHERE (resulting_sd_id IS NOT NULL)
  ```
- `idx_sdip_user_incomplete`
  ```sql
  CREATE INDEX idx_sdip_user_incomplete ON public.sdip_submissions USING btree (created_by, validation_complete) WHERE (validation_complete = false)
  ```
- `idx_sdip_user_status`
  ```sql
  CREATE INDEX idx_sdip_user_status ON public.sdip_submissions USING btree (created_by, validation_complete, current_step)
  ```
- `sdip_submissions_pkey`
  ```sql
  CREATE UNIQUE INDEX sdip_submissions_pkey ON public.sdip_submissions USING btree (id)
  ```

## RLS Policies

### 1. sdip_delete_policy (DELETE)

- **Roles**: {public}
- **Using**: `((auth.jwt() ->> 'role'::text) = 'admin'::text)`

### 2. sdip_insert_policy (INSERT)

- **Roles**: {public}
- **With Check**: `(auth.uid() = created_by)`

### 3. sdip_select_policy (SELECT)

- **Roles**: {public}
- **Using**: `((auth.uid() = created_by) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'validator'::text, 'system'::text])))`

### 4. sdip_update_policy (UPDATE)

- **Roles**: {public}
- **Using**: `((auth.uid() = created_by) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'validator'::text])))`
- **With Check**: `((auth.uid() = created_by) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'validator'::text])))`

## Triggers

### log_sdip_gate_transitions

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION log_gate_transition()`

### update_sdip_submissions_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
