# worker_heartbeats Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-16T00:41:46.314Z
**Rows**: N/A (RLS restricted)
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| worker_id | `text` | **NO** | - | - |
| worker_type | `text` | **NO** | `'stage-execution-worker'::text` | - |
| last_heartbeat_at | `timestamp with time zone` | **NO** | `now()` | - |
| status | `text` | **NO** | `'online'::text` | - |
| pid | `integer(32)` | YES | - | - |
| hostname | `text` | YES | - | - |
| started_at | `timestamp with time zone` | **NO** | `now()` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `worker_heartbeats_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `worker_heartbeats_worker_id_unique`: UNIQUE (worker_id)

### Check Constraints
- `worker_heartbeats_status_check`: CHECK ((status = ANY (ARRAY['online'::text, 'stopped'::text, 'crashed'::text])))

## Indexes

- `idx_worker_heartbeats_type_status`
  ```sql
  CREATE INDEX idx_worker_heartbeats_type_status ON public.worker_heartbeats USING btree (worker_type, status)
  ```
- `worker_heartbeats_pkey`
  ```sql
  CREATE UNIQUE INDEX worker_heartbeats_pkey ON public.worker_heartbeats USING btree (id)
  ```
- `worker_heartbeats_worker_id_unique`
  ```sql
  CREATE UNIQUE INDEX worker_heartbeats_worker_id_unique ON public.worker_heartbeats USING btree (worker_id)
  ```

## RLS Policies

### 1. service_role_full_access (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
