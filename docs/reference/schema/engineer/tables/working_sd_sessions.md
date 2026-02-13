# working_sd_sessions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T23:20:47.932Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | YES | - | - |
| started_at | `timestamp with time zone` | YES | `now()` | - |
| ended_at | `timestamp with time zone` | YES | - | - |
| agent_type | `text` | YES | - | - |
| user_id | `text` | YES | - | - |
| session_notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `working_sd_sessions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `working_sd_sessions_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `working_sd_sessions_agent_type_check`: CHECK ((agent_type = ANY (ARRAY['LEAD'::text, 'PLAN'::text, 'EXEC'::text])))

## Indexes

- `idx_working_sessions_active`
  ```sql
  CREATE INDEX idx_working_sessions_active ON public.working_sd_sessions USING btree (sd_id, started_at) WHERE (ended_at IS NULL)
  ```
- `idx_working_sessions_sd`
  ```sql
  CREATE INDEX idx_working_sessions_sd ON public.working_sd_sessions USING btree (sd_id)
  ```
- `working_sd_sessions_pkey`
  ```sql
  CREATE UNIQUE INDEX working_sd_sessions_pkey ON public.working_sd_sessions USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_working_sd_sessions (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_working_sd_sessions (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
