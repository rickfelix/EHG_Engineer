# sd_capabilities Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-05T22:49:52.110Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_uuid | `uuid` | **NO** | - | - |
| sd_id | `character varying(100)` | **NO** | - | - |
| capability_type | `character varying(50)` | **NO** | - | - |
| capability_key | `character varying(200)` | **NO** | - | - |
| action | `character varying(20)` | **NO** | - | - |
| action_details | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `sd_capabilities_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_capabilities_sd_uuid_fkey`: sd_uuid → strategic_directives_v2(uuid_id)

### Unique Constraints
- `sd_capabilities_sd_uuid_capability_key_action_key`: UNIQUE (sd_uuid, capability_key, action)

### Check Constraints
- `sd_capabilities_action_check`: CHECK (((action)::text = ANY ((ARRAY['registered'::character varying, 'updated'::character varying, 'deprecated'::character varying])::text[])))
- `sd_capabilities_capability_type_check`: CHECK (((capability_type)::text = ANY ((ARRAY['agent'::character varying, 'tool'::character varying, 'crew'::character varying, 'skill'::character varying])::text[])))

## Indexes

- `idx_sd_capabilities_action`
  ```sql
  CREATE INDEX idx_sd_capabilities_action ON public.sd_capabilities USING btree (action)
  ```
- `idx_sd_capabilities_capability_key`
  ```sql
  CREATE INDEX idx_sd_capabilities_capability_key ON public.sd_capabilities USING btree (capability_key)
  ```
- `idx_sd_capabilities_created_at`
  ```sql
  CREATE INDEX idx_sd_capabilities_created_at ON public.sd_capabilities USING btree (created_at)
  ```
- `idx_sd_capabilities_sd_uuid`
  ```sql
  CREATE INDEX idx_sd_capabilities_sd_uuid ON public.sd_capabilities USING btree (sd_uuid)
  ```
- `sd_capabilities_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_capabilities_pkey ON public.sd_capabilities USING btree (id)
  ```
- `sd_capabilities_sd_uuid_capability_key_action_key`
  ```sql
  CREATE UNIQUE INDEX sd_capabilities_sd_uuid_capability_key_action_key ON public.sd_capabilities USING btree (sd_uuid, capability_key, action)
  ```

## RLS Policies

### 1. Authenticated users can read sd_capabilities (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Service role full access on sd_capabilities (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
