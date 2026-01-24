# feedback Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-24T03:07:02.107Z
**Rows**: 15
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (42 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| type | `character varying(20)` | **NO** | - | - |
| source_application | `character varying(50)` | **NO** | - | - |
| source_type | `character varying(30)` | **NO** | - | - |
| source_id | `uuid` | YES | - | - |
| title | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| status | `character varying(20)` | YES | `'new'::character varying` | - |
| priority | `character varying(10)` | YES | - | - |
| sd_id | `character varying(50)` | YES | - | - |
| user_id | `uuid` | YES | - | - |
| session_id | `character varying(100)` | YES | - | - |
| page_url | `character varying(500)` | YES | - | - |
| command | `character varying(100)` | YES | - | - |
| environment | `jsonb` | YES | - | - |
| severity | `character varying(20)` | YES | - | - |
| category | `character varying(50)` | YES | - | - |
| error_message | `text` | YES | - | - |
| stack_trace | `text` | YES | - | - |
| error_hash | `character varying(64)` | YES | - | - |
| occurrence_count | `integer(32)` | YES | `1` | - |
| first_seen | `timestamp with time zone` | YES | - | - |
| last_seen | `timestamp with time zone` | YES | - | - |
| resolution_type | `character varying(30)` | YES | - | - |
| value_estimate | `character varying(20)` | YES | - | - |
| effort_estimate | `character varying(20)` | YES | - | - |
| votes | `integer(32)` | YES | `0` | - |
| use_case | `text` | YES | - | - |
| original_type | `character varying(20)` | YES | - | - |
| converted_at | `timestamp with time zone` | YES | - | - |
| conversion_reason | `text` | YES | - | - |
| triaged_at | `timestamp with time zone` | YES | - | - |
| triaged_by | `character varying(100)` | YES | - | - |
| snoozed_until | `timestamp with time zone` | YES | - | - |
| ignore_pattern | `character varying(255)` | YES | - | - |
| ai_triage_suggestion | `jsonb` | YES | - | - |
| assigned_to | `character varying(100)` | YES | - | - |
| resolution_sd_id | `character varying(50)` | YES | - | - |
| resolution_notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| resolved_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `feedback_pkey`: PRIMARY KEY (id)

### Check Constraints
- `feedback_effort_estimate_check`: CHECK (((effort_estimate)::text = ANY ((ARRAY['small'::character varying, 'medium'::character varying, 'large'::character varying])::text[])))
- `feedback_severity_check`: CHECK (((severity)::text = ANY ((ARRAY['critical'::character varying, 'high'::character varying, 'medium'::character varying, 'low'::character varying])::text[])))
- `feedback_source_type_check`: CHECK (((source_type)::text = ANY ((ARRAY['manual_feedback'::character varying, 'auto_capture'::character varying, 'uat_failure'::character varying, 'error_capture'::character varying, 'uncaught_exception'::character varying, 'unhandled_rejection'::character varying, 'manual_capture'::character varying])::text[])))
- `feedback_status_check`: CHECK (((status)::text = ANY ((ARRAY['new'::character varying, 'triaged'::character varying, 'in_progress'::character varying, 'resolved'::character varying, 'wont_fix'::character varying, 'backlog'::character varying, 'shipped'::character varying])::text[])))
- `feedback_type_check`: CHECK (((type)::text = ANY ((ARRAY['issue'::character varying, 'enhancement'::character varying])::text[])))
- `feedback_value_estimate_check`: CHECK (((value_estimate)::text = ANY ((ARRAY['high'::character varying, 'medium'::character varying, 'low'::character varying])::text[])))

## Indexes

- `feedback_pkey`
  ```sql
  CREATE UNIQUE INDEX feedback_pkey ON public.feedback USING btree (id)
  ```
- `idx_feedback_created_at`
  ```sql
  CREATE INDEX idx_feedback_created_at ON public.feedback USING btree (created_at DESC)
  ```
- `idx_feedback_enhancements`
  ```sql
  CREATE INDEX idx_feedback_enhancements ON public.feedback USING btree (created_at DESC) WHERE ((type)::text = 'enhancement'::text)
  ```
- `idx_feedback_error_hash`
  ```sql
  CREATE INDEX idx_feedback_error_hash ON public.feedback USING btree (error_hash) WHERE (error_hash IS NOT NULL)
  ```
- `idx_feedback_issues`
  ```sql
  CREATE INDEX idx_feedback_issues ON public.feedback USING btree (created_at DESC) WHERE ((type)::text = 'issue'::text)
  ```
- `idx_feedback_priority`
  ```sql
  CREATE INDEX idx_feedback_priority ON public.feedback USING btree (priority)
  ```
- `idx_feedback_sd_id`
  ```sql
  CREATE INDEX idx_feedback_sd_id ON public.feedback USING btree (sd_id)
  ```
- `idx_feedback_severity`
  ```sql
  CREATE INDEX idx_feedback_severity ON public.feedback USING btree (severity) WHERE ((type)::text = 'issue'::text)
  ```
- `idx_feedback_snoozed`
  ```sql
  CREATE INDEX idx_feedback_snoozed ON public.feedback USING btree (snoozed_until) WHERE (snoozed_until IS NOT NULL)
  ```
- `idx_feedback_source_app`
  ```sql
  CREATE INDEX idx_feedback_source_app ON public.feedback USING btree (source_application)
  ```
- `idx_feedback_source_type`
  ```sql
  CREATE INDEX idx_feedback_source_type ON public.feedback USING btree (source_type)
  ```
- `idx_feedback_status`
  ```sql
  CREATE INDEX idx_feedback_status ON public.feedback USING btree (status)
  ```
- `idx_feedback_value`
  ```sql
  CREATE INDEX idx_feedback_value ON public.feedback USING btree (value_estimate) WHERE ((type)::text = 'enhancement'::text)
  ```

## RLS Policies

### 1. delete_feedback_policy (DELETE)

- **Roles**: {service_role}
- **Using**: `true`

### 2. insert_feedback_policy (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 3. select_feedback_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. update_feedback_policy (UPDATE)

- **Roles**: {service_role}
- **Using**: `true`

## Triggers

### trigger_update_feedback_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_feedback_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
