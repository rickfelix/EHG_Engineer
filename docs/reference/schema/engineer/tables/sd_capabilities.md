# sd_capabilities Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-11T16:06:42.147Z
**Rows**: 61
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_uuid | `uuid` | **NO** | - | - |
| sd_id | `character varying(100)` | **NO** | - | - |
| capability_type | `character varying(50)` | **NO** | - | - |
| capability_key | `character varying(200)` | YES | - | TEMPORARILY NULLABLE: Investigating what inserts NULL values. Should be NOT NULL once root cause fixed. |
| action | `character varying(20)` | **NO** | - | - |
| action_details | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| category | `character varying(50)` | YES | - | - |

## Constraints

### Primary Key
- `sd_capabilities_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_capabilities_sd_uuid_fkey`: sd_uuid → strategic_directives_v2(uuid_id)

### Unique Constraints
- `sd_capabilities_sd_uuid_capability_key_action_key`: UNIQUE (sd_uuid, capability_key, action)

### Check Constraints
- `sd_capabilities_action_check`: CHECK (((action)::text = ANY ((ARRAY['registered'::character varying, 'updated'::character varying, 'deprecated'::character varying])::text[])))
- `sd_capabilities_capability_type_check`: CHECK (((capability_type)::text = ANY ((ARRAY['agent'::character varying, 'crew'::character varying, 'tool'::character varying, 'skill'::character varying, 'database_schema'::character varying, 'database_function'::character varying, 'rls_policy'::character varying, 'migration'::character varying, 'api_endpoint'::character varying, 'component'::character varying, 'hook'::character varying, 'service'::character varying, 'utility'::character varying, 'workflow'::character varying, 'webhook'::character varying, 'external_integration'::character varying, 'validation_rule'::character varying, 'quality_gate'::character varying, 'protocol'::character varying])::text[])))
- `sd_capabilities_category_check`: CHECK (((category)::text = ANY ((ARRAY['ai_automation'::character varying, 'infrastructure'::character varying, 'application'::character varying, 'integration'::character varying, 'governance'::character varying])::text[])))

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
