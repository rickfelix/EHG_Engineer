# subagent_requirements Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T14:46:52.935Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | YES | - | - |
| phase | `text` | **NO** | - | - |
| required_subagents | `ARRAY` | **NO** | `'{}'::text[]` | - |
| optional_subagents | `ARRAY` | YES | `'{}'::text[]` | - |
| requirements_met | `boolean` | YES | `false` | - |
| checked_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `subagent_requirements_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `subagent_requirements_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Unique Constraints
- `subagent_requirements_sd_id_phase_key`: UNIQUE (sd_id, phase)

### Check Constraints
- `subagent_requirements_phase_check`: CHECK ((phase = ANY (ARRAY['planning'::text, 'implementation'::text, 'verification'::text])))

## Indexes

- `idx_subagent_requirements_sd_phase`
  ```sql
  CREATE INDEX idx_subagent_requirements_sd_phase ON public.subagent_requirements USING btree (sd_id, phase)
  ```
- `subagent_requirements_pkey`
  ```sql
  CREATE UNIQUE INDEX subagent_requirements_pkey ON public.subagent_requirements USING btree (id)
  ```
- `subagent_requirements_sd_id_phase_key`
  ```sql
  CREATE UNIQUE INDEX subagent_requirements_sd_id_phase_key ON public.subagent_requirements USING btree (sd_id, phase)
  ```

## RLS Policies

### 1. authenticated_read_subagent_requirements (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_subagent_requirements (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
