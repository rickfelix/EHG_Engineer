# llm_providers Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T15:09:28.771Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| provider_key | `character varying(100)` | **NO** | - | - |
| provider_name | `character varying(255)` | YES | - | - |
| provider_type | `character varying(50)` | YES | - | - |
| api_base_url | `text` | YES | - | - |
| auth_method | `character varying(50)` | YES | - | - |
| capabilities | `jsonb` | YES | `'{}'::jsonb` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| status | `character varying(50)` | YES | `'active'::character varying` | - |
| health_check_url | `text` | YES | - | - |
| last_health_check | `timestamp with time zone` | YES | - | - |
| health_status | `character varying(50)` | YES | - | - |
| pricing_model | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `text` | YES | - | - |
| deleted_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `llm_providers_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `llm_providers_provider_key_key`: UNIQUE (provider_key)

## Indexes

- `llm_providers_pkey`
  ```sql
  CREATE UNIQUE INDEX llm_providers_pkey ON public.llm_providers USING btree (id)
  ```
- `llm_providers_provider_key_key`
  ```sql
  CREATE UNIQUE INDEX llm_providers_provider_key_key ON public.llm_providers USING btree (provider_key)
  ```

## RLS Policies

### 1. Allow service_role to manage llm_providers (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. Anon read llm_providers (SELECT)

- **Roles**: {anon}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
