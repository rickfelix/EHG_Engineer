# genesis_deployments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-13T12:55:49.260Z
**Rows**: 0
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| simulation_id | `uuid` | YES | - | Reference to the simulation session this deployment belongs to |
| preview_url | `text` | **NO** | - | Full Vercel preview URL (https://xxx.vercel.app) |
| deployment_id | `text` | YES | - | Vercel deployment ID for management operations (dpl_xxx format) |
| project_name | `text` | YES | - | - |
| ttl_days | `integer(32)` | YES | `7` | Time-to-live in days before auto-cleanup (default: 7) |
| expires_at | `timestamp with time zone` | **NO** | - | - |
| health_status | `text` | YES | `'pending'::text` | Current health status from periodic checks: pending, healthy, unhealthy, expired, deleted |
| last_health_check | `timestamp with time zone` | YES | - | - |
| error_message | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `genesis_deployments_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `genesis_deployments_simulation_id_fkey`: simulation_id → simulation_sessions(id)

### Check Constraints
- `genesis_deployments_health_status_check`: CHECK ((health_status = ANY (ARRAY['pending'::text, 'healthy'::text, 'unhealthy'::text, 'expired'::text, 'deleted'::text])))

## Indexes

- `genesis_deployments_pkey`
  ```sql
  CREATE UNIQUE INDEX genesis_deployments_pkey ON public.genesis_deployments USING btree (id)
  ```
- `idx_genesis_deployments_expires_at`
  ```sql
  CREATE INDEX idx_genesis_deployments_expires_at ON public.genesis_deployments USING btree (expires_at)
  ```
- `idx_genesis_deployments_health_status`
  ```sql
  CREATE INDEX idx_genesis_deployments_health_status ON public.genesis_deployments USING btree (health_status)
  ```
- `idx_genesis_deployments_simulation_id`
  ```sql
  CREATE INDEX idx_genesis_deployments_simulation_id ON public.genesis_deployments USING btree (simulation_id)
  ```

## RLS Policies

### 1. genesis_deployments_delete (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. genesis_deployments_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. genesis_deployments_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. genesis_deployments_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 5. genesis_deployments_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
