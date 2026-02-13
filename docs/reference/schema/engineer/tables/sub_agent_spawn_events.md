# sub_agent_spawn_events Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T23:53:41.400Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `uuid` | **NO** | - | - |
| phase | `text` | **NO** | - | - |
| agents_spawned | `ARRAY` | **NO** | `'{}'::text[]` | - |
| execution_ids | `ARRAY` | YES | `'{}'::uuid[]` | - |
| spawned_at | `timestamp with time zone` | YES | `now()` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `sub_agent_spawn_events_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sub_agent_spawn_events_sd_id_fkey`: sd_id → strategic_directives_v2(uuid_id)

## Indexes

- `idx_subagent_spawns_sd_id`
  ```sql
  CREATE INDEX idx_subagent_spawns_sd_id ON public.sub_agent_spawn_events USING btree (sd_id)
  ```
- `sub_agent_spawn_events_pkey`
  ```sql
  CREATE UNIQUE INDEX sub_agent_spawn_events_pkey ON public.sub_agent_spawn_events USING btree (id)
  ```

## RLS Policies

### 1. Service role full access to sub_agent_spawn_events (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
