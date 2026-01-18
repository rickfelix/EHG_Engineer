# exec_implementation_sessions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-18T21:54:07.007Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (27 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | - |
| prd_id | `text` | YES | - | - |
| status | `text` | **NO** | `'active'::text` | - |
| implementation_type | `text` | **NO** | - | Type of implementation: UI_COMPONENT/API_ENDPOINT/DATABASE_CHANGE/AUTHENTICATION/SYSTEM_TOOLING/GENERAL_FEATURE |
| quality_score | `integer(32)` | YES | `0` | Overall implementation quality score (0-100) |
| code_quality_score | `integer(32)` | YES | `0` | Code quality domain score (0-100) |
| performance_score | `integer(32)` | YES | `0` | Performance domain score (0-100) |
| security_score | `integer(32)` | YES | `0` | Security domain score (0-100) |
| ux_accessibility_score | `integer(32)` | YES | `0` | UX/Accessibility domain score (0-100) |
| implementation_progress | `integer(32)` | YES | `0` | - |
| sub_agent_results | `jsonb` | YES | `'[]'::jsonb` | JSON array of sub-agent activation results |
| quality_gates | `ARRAY` | YES | `ARRAY[]::text[]` | Array of required quality gates for implementation |
| pre_impl_checklist | `jsonb` | YES | `'{}'::jsonb` | - |
| test_coverage_pct | `integer(32)` | YES | `0` | - |
| performance_metrics | `jsonb` | YES | `'{}'::jsonb` | - |
| security_scan_results | `jsonb` | YES | `'{}'::jsonb` | - |
| accessibility_audit | `jsonb` | YES | `'{}'::jsonb` | - |
| before_screenshots | `ARRAY` | YES | - | - |
| after_screenshots | `ARRAY` | YES | - | - |
| demo_urls | `ARRAY` | YES | - | - |
| started_at | `timestamp with time zone` | YES | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| orchestrator | `text` | YES | `'EXEC_IMPLEMENTATION_EXCELLENCE_ORCHESTRATOR_v1.0'::text` | - |
| session_version | `text` | YES | `'1.0'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `exec_implementation_sessions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `exec_implementation_sessions_prd_id_fkey`: prd_id → product_requirements_v2(id)
- `exec_implementation_sessions_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Unique Constraints
- `exec_implementation_sessions_sd_id_status_key`: UNIQUE (sd_id, status) DEFERRABLE INITIALLY DEFERRED

### Check Constraints
- `exec_implementation_sessions_code_quality_score_check`: CHECK (((code_quality_score >= 0) AND (code_quality_score <= 100)))
- `exec_implementation_sessions_implementation_progress_check`: CHECK (((implementation_progress >= 0) AND (implementation_progress <= 100)))
- `exec_implementation_sessions_implementation_type_check`: CHECK ((implementation_type = ANY (ARRAY['UI_COMPONENT'::text, 'API_ENDPOINT'::text, 'DATABASE_CHANGE'::text, 'AUTHENTICATION'::text, 'SYSTEM_TOOLING'::text, 'GENERAL_FEATURE'::text])))
- `exec_implementation_sessions_performance_score_check`: CHECK (((performance_score >= 0) AND (performance_score <= 100)))
- `exec_implementation_sessions_quality_score_check`: CHECK (((quality_score >= 0) AND (quality_score <= 100)))
- `exec_implementation_sessions_security_score_check`: CHECK (((security_score >= 0) AND (security_score <= 100)))
- `exec_implementation_sessions_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
- `exec_implementation_sessions_test_coverage_pct_check`: CHECK (((test_coverage_pct >= 0) AND (test_coverage_pct <= 100)))
- `exec_implementation_sessions_ux_accessibility_score_check`: CHECK (((ux_accessibility_score >= 0) AND (ux_accessibility_score <= 100)))

## Indexes

- `exec_implementation_sessions_pkey`
  ```sql
  CREATE UNIQUE INDEX exec_implementation_sessions_pkey ON public.exec_implementation_sessions USING btree (id)
  ```
- `exec_implementation_sessions_sd_id_status_key`
  ```sql
  CREATE UNIQUE INDEX exec_implementation_sessions_sd_id_status_key ON public.exec_implementation_sessions USING btree (sd_id, status)
  ```
- `idx_exec_sessions_quality_score`
  ```sql
  CREATE INDEX idx_exec_sessions_quality_score ON public.exec_implementation_sessions USING btree (quality_score)
  ```
- `idx_exec_sessions_sd_active`
  ```sql
  CREATE UNIQUE INDEX idx_exec_sessions_sd_active ON public.exec_implementation_sessions USING btree (sd_id) WHERE (status = 'active'::text)
  ```
- `idx_exec_sessions_sd_id`
  ```sql
  CREATE INDEX idx_exec_sessions_sd_id ON public.exec_implementation_sessions USING btree (sd_id)
  ```
- `idx_exec_sessions_started_at`
  ```sql
  CREATE INDEX idx_exec_sessions_started_at ON public.exec_implementation_sessions USING btree (started_at DESC)
  ```
- `idx_exec_sessions_status`
  ```sql
  CREATE INDEX idx_exec_sessions_status ON public.exec_implementation_sessions USING btree (status)
  ```

## RLS Policies

### 1. exec_sessions_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. exec_sessions_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trigger_create_quality_checkpoints

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION create_quality_checkpoints_from_session()`

### trigger_update_sd_after_exec_completion

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION update_sd_after_exec_completion()`

---

[← Back to Schema Overview](../database-schema-overview.md)
