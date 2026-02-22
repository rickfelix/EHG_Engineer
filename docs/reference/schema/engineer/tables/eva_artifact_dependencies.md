# eva_artifact_dependencies Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T00:37:34.488Z
**Rows**: 7
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| source_stage | `integer(32)` | **NO** | - | - |
| target_stage | `integer(32)` | **NO** | - | - |
| artifact_type | `text` | **NO** | - | - |
| artifact_key | `text` | YES | - | JSON path or table reference where artifact is stored (e.g., venture_metadata.icp) |
| required | `boolean` | YES | `true` | - |
| validation_status | `text` | YES | - | - |
| validation_notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_artifact_dependencies_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `eva_artifact_dependencies_source_stage_target_stage_artifac_key`: UNIQUE (source_stage, target_stage, artifact_type)

### Check Constraints
- `eva_artifact_dependencies_check`: CHECK ((source_stage < target_stage))
- `eva_artifact_dependencies_source_stage_check`: CHECK (((source_stage >= 1) AND (source_stage <= 25)))
- `eva_artifact_dependencies_target_stage_check`: CHECK (((target_stage >= 1) AND (target_stage <= 25)))
- `eva_artifact_dependencies_validation_status_check`: CHECK ((validation_status = ANY (ARRAY['pending'::text, 'validated'::text, 'missing'::text, 'invalid'::text])))

## Indexes

- `eva_artifact_dependencies_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_artifact_dependencies_pkey ON public.eva_artifact_dependencies USING btree (id)
  ```
- `eva_artifact_dependencies_source_stage_target_stage_artifac_key`
  ```sql
  CREATE UNIQUE INDEX eva_artifact_dependencies_source_stage_target_stage_artifac_key ON public.eva_artifact_dependencies USING btree (source_stage, target_stage, artifact_type)
  ```
- `idx_eva_artifact_deps_source`
  ```sql
  CREATE INDEX idx_eva_artifact_deps_source ON public.eva_artifact_dependencies USING btree (source_stage)
  ```
- `idx_eva_artifact_deps_status`
  ```sql
  CREATE INDEX idx_eva_artifact_deps_status ON public.eva_artifact_dependencies USING btree (validation_status) WHERE (validation_status = ANY (ARRAY['missing'::text, 'invalid'::text]))
  ```
- `idx_eva_artifact_deps_target`
  ```sql
  CREATE INDEX idx_eva_artifact_deps_target ON public.eva_artifact_dependencies USING btree (target_stage)
  ```

## RLS Policies

### 1. authenticated_read_artifact_deps (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_eva_artifact_deps (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
