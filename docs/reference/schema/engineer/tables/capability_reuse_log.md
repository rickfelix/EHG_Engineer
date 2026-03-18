# capability_reuse_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-18T00:48:10.800Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| capability_id | `uuid` | **NO** | - | - |
| capability_key | `character varying(200)` | **NO** | - | - |
| reusing_sd_id | `character varying(100)` | **NO** | - | - |
| reusing_sd_uuid | `uuid` | YES | - | - |
| reuse_context | `text` | YES | - | - |
| reuse_type | `character varying(50)` | YES | - | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `capability_reuse_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `capability_reuse_log_capability_id_fkey`: capability_id → sd_capabilities(id)
- `capability_reuse_log_reusing_sd_uuid_fkey`: reusing_sd_uuid → strategic_directives_v2(uuid_id)

### Check Constraints
- `capability_reuse_log_reuse_type_check`: CHECK (((reuse_type)::text = ANY ((ARRAY['direct'::character varying, 'extended'::character varying, 'forked'::character varying, 'referenced'::character varying])::text[])))

## Indexes

- `capability_reuse_log_pkey`
  ```sql
  CREATE UNIQUE INDEX capability_reuse_log_pkey ON public.capability_reuse_log USING btree (id)
  ```
- `idx_capability_reuse_capability`
  ```sql
  CREATE INDEX idx_capability_reuse_capability ON public.capability_reuse_log USING btree (capability_id)
  ```
- `idx_capability_reuse_sd`
  ```sql
  CREATE INDEX idx_capability_reuse_sd ON public.capability_reuse_log USING btree (reusing_sd_id)
  ```

## RLS Policies

### 1. service_role_insert_capability_reuse_log (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 2. service_role_select_capability_reuse_log (SELECT)

- **Roles**: {service_role}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
