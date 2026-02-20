# sd_wall_states Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-20T20:49:31.394Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `uuid` | **NO** | - | - |
| wall_name | `text` | **NO** | - | - |
| phase | `text` | **NO** | - | - |
| track | `text` | **NO** | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| blocked_by | `ARRAY` | YES | `'{}'::text[]` | - |
| passed_at | `timestamp with time zone` | YES | - | - |
| invalidated_at | `timestamp with time zone` | YES | - | - |
| invalidated_reason | `text` | YES | - | - |
| validation_score | `integer(32)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_wall_states_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_wall_states_sd_id_fkey`: sd_id → strategic_directives_v2(uuid_id)

### Unique Constraints
- `sd_wall_states_sd_id_wall_name_key`: UNIQUE (sd_id, wall_name)

### Check Constraints
- `sd_wall_states_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'blocked'::text, 'ready'::text, 'passed'::text, 'invalidated'::text])))

## Indexes

- `idx_wall_states_sd_id`
  ```sql
  CREATE INDEX idx_wall_states_sd_id ON public.sd_wall_states USING btree (sd_id)
  ```
- `idx_wall_states_status`
  ```sql
  CREATE INDEX idx_wall_states_status ON public.sd_wall_states USING btree (status)
  ```
- `sd_wall_states_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_wall_states_pkey ON public.sd_wall_states USING btree (id)
  ```
- `sd_wall_states_sd_id_wall_name_key`
  ```sql
  CREATE UNIQUE INDEX sd_wall_states_sd_id_wall_name_key ON public.sd_wall_states USING btree (sd_id, wall_name)
  ```

## RLS Policies

### 1. Service role full access to sd_wall_states (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_update_wall_states_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_wall_states_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
