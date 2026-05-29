# gate_boundary_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-29T15:23:40.444Z
**Rows**: 5
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| from_stage | `integer(32)` | **NO** | - | - |
| to_stage | `integer(32)` | **NO** | - | - |
| required_artifacts | `ARRAY` | **NO** | `ARRAY[]::text[]` | Artifact types (text[]) that must exist in venture_artifacts before this boundary transition can pass. Each entry must appear in some upstream stage's lifecycle_stage_config.required_artifacts (enforced by validate-boundary-config-coherence.mjs CI guard). |
| quality_thresholds | `jsonb` | **NO** | `'{}'::jsonb` | Per-artifact min_quality_score overrides (JSONB: {"artifact_type": 0.5}). Empty object uses the DEFAULT_BOUNDARY_QUALITY_FLOOR=0.5 constant in lib/eva/reality-gates.js (SECURITY C4 preservation). |
| url_verification_required | `boolean` | **NO** | `false` | - |
| description | `text` | YES | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `gate_boundary_config_pkey`: PRIMARY KEY (from_stage, to_stage)

### Check Constraints
- `gate_boundary_config_stage_order`: CHECK ((to_stage > from_stage))

## Indexes

- `gate_boundary_config_pkey`
  ```sql
  CREATE UNIQUE INDEX gate_boundary_config_pkey ON public.gate_boundary_config USING btree (from_stage, to_stage)
  ```

## RLS Policies

### 1. gate_boundary_config_insert_service_role (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 2. gate_boundary_config_select_anon (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 3. gate_boundary_config_select_authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. gate_boundary_config_update_service_role (UPDATE)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_gate_boundary_config_audit

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION fn_gate_boundary_config_audit_trigger()`

---

[← Back to Schema Overview](../database-schema-overview.md)
