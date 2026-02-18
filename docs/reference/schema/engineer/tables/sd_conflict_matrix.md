# sd_conflict_matrix Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-18T15:11:07.799Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id_a | `text` | **NO** | - | - |
| sd_id_b | `text` | **NO** | - | - |
| conflict_type | `text` | YES | - | - |
| conflict_severity | `text` | YES | - | - |
| affected_areas | `jsonb` | YES | - | - |
| detected_at | `timestamp with time zone` | YES | `now()` | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| resolution_notes | `text` | YES | - | - |

## Constraints

### Primary Key
- `sd_conflict_matrix_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `sd_conflict_matrix_sd_id_a_sd_id_b_conflict_type_key`: UNIQUE (sd_id_a, sd_id_b, conflict_type)

### Check Constraints
- `sd_conflict_matrix_check`: CHECK ((sd_id_a < sd_id_b))
- `sd_conflict_matrix_conflict_severity_check`: CHECK ((conflict_severity = ANY (ARRAY['blocking'::text, 'warning'::text, 'info'::text])))
- `sd_conflict_matrix_conflict_type_check`: CHECK ((conflict_type = ANY (ARRAY['file_overlap'::text, 'component_overlap'::text, 'dependency_conflict'::text, 'resource_conflict'::text])))

## Indexes

- `idx_conflict_matrix_sd_a`
  ```sql
  CREATE INDEX idx_conflict_matrix_sd_a ON public.sd_conflict_matrix USING btree (sd_id_a)
  ```
- `idx_conflict_matrix_sd_b`
  ```sql
  CREATE INDEX idx_conflict_matrix_sd_b ON public.sd_conflict_matrix USING btree (sd_id_b)
  ```
- `sd_conflict_matrix_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_conflict_matrix_pkey ON public.sd_conflict_matrix USING btree (id)
  ```
- `sd_conflict_matrix_sd_id_a_sd_id_b_conflict_type_key`
  ```sql
  CREATE UNIQUE INDEX sd_conflict_matrix_sd_id_a_sd_id_b_conflict_type_key ON public.sd_conflict_matrix USING btree (sd_id_a, sd_id_b, conflict_type)
  ```

## RLS Policies

### 1. Allow all for anon (ALL)

- **Roles**: {anon}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
