# exec_quality_checkpoints Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T17:46:55.871Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| session_id | `uuid` | **NO** | - | - |
| sd_id | `text` | **NO** | - | - |
| checkpoint_name | `text` | **NO** | - | - |
| checkpoint_type | `text` | **NO** | - | - |
| is_required | `boolean` | YES | `true` | - |
| is_complete | `boolean` | YES | `false` | - |
| score | `integer(32)` | YES | `0` | - |
| evidence_url | `text` | YES | - | - |
| completion_notes | `text` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| completed_by | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `exec_quality_checkpoints_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `exec_quality_checkpoints_sd_id_fkey`: sd_id → strategic_directives_v2(id)
- `exec_quality_checkpoints_session_id_fkey`: session_id → exec_implementation_sessions(id)

### Unique Constraints
- `exec_quality_checkpoints_session_id_checkpoint_name_key`: UNIQUE (session_id, checkpoint_name)

### Check Constraints
- `exec_quality_checkpoints_checkpoint_type_check`: CHECK ((checkpoint_type = ANY (ARRAY['CODE_QUALITY'::text, 'PERFORMANCE'::text, 'SECURITY'::text, 'TESTING'::text, 'ACCESSIBILITY'::text, 'DOCUMENTATION'::text])))
- `exec_quality_checkpoints_score_check`: CHECK (((score >= 0) AND (score <= 100)))

## Indexes

- `exec_quality_checkpoints_pkey`
  ```sql
  CREATE UNIQUE INDEX exec_quality_checkpoints_pkey ON public.exec_quality_checkpoints USING btree (id)
  ```
- `exec_quality_checkpoints_session_id_checkpoint_name_key`
  ```sql
  CREATE UNIQUE INDEX exec_quality_checkpoints_session_id_checkpoint_name_key ON public.exec_quality_checkpoints USING btree (session_id, checkpoint_name)
  ```
- `idx_exec_checkpoints_complete`
  ```sql
  CREATE INDEX idx_exec_checkpoints_complete ON public.exec_quality_checkpoints USING btree (is_complete)
  ```
- `idx_exec_checkpoints_sd_id`
  ```sql
  CREATE INDEX idx_exec_checkpoints_sd_id ON public.exec_quality_checkpoints USING btree (sd_id)
  ```
- `idx_exec_checkpoints_session_id`
  ```sql
  CREATE INDEX idx_exec_checkpoints_session_id ON public.exec_quality_checkpoints USING btree (session_id)
  ```
- `idx_exec_checkpoints_type`
  ```sql
  CREATE INDEX idx_exec_checkpoints_type ON public.exec_quality_checkpoints USING btree (checkpoint_type)
  ```

## RLS Policies

### 1. exec_checkpoints_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. exec_checkpoints_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
