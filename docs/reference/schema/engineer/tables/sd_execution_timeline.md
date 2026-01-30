# sd_execution_timeline Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-30T00:55:02.600Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(255)` | **NO** | - | - |
| phase | `character varying(50)` | **NO** | - | - |
| phase_started_at | `timestamp without time zone` | **NO** | - | - |
| phase_completed_at | `timestamp without time zone` | YES | - | - |
| duration_hours | `numeric(10,2)` | YES | - | - |
| duration_minutes | `integer(32)` | YES | - | - |
| agent_responsible | `character varying(50)` | YES | - | - |
| completion_status | `character varying(50)` | YES | `'in_progress'::character varying` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| updated_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `sd_execution_timeline_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_sd_timeline_phase`
  ```sql
  CREATE INDEX idx_sd_timeline_phase ON public.sd_execution_timeline USING btree (phase)
  ```
- `idx_sd_timeline_sd_id`
  ```sql
  CREATE INDEX idx_sd_timeline_sd_id ON public.sd_execution_timeline USING btree (sd_id)
  ```
- `sd_execution_timeline_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_execution_timeline_pkey ON public.sd_execution_timeline USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_sd_execution_timeline (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_sd_execution_timeline (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
