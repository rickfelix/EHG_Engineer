# llm_models Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T11:57:53.424Z
**Rows**: 8
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (25 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| provider_id | `uuid` | YES | - | - |
| model_key | `character varying(100)` | **NO** | - | - |
| model_name | `character varying(255)` | YES | - | - |
| model_family | `character varying(100)` | YES | - | - |
| model_version | `character varying(50)` | YES | - | - |
| model_tier | `character varying(50)` | YES | - | - |
| context_window | `integer(32)` | YES | - | - |
| max_output_tokens | `integer(32)` | YES | - | - |
| supports_function_calling | `boolean` | YES | `false` | - |
| supports_vision | `boolean` | YES | `false` | - |
| supports_streaming | `boolean` | YES | `false` | - |
| supports_audio | `boolean` | YES | `false` | - |
| supports_system_prompt | `boolean` | YES | `true` | - |
| pricing | `jsonb` | YES | `'{}'::jsonb` | - |
| rate_limits | `jsonb` | YES | `'{}'::jsonb` | - |
| capabilities | `jsonb` | YES | `'{}'::jsonb` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| status | `character varying(50)` | YES | `'active'::character varying` | - |
| release_date | `date` | YES | - | - |
| deprecation_date | `date` | YES | - | - |
| typical_latency_ms | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| deleted_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `llm_models_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `llm_models_provider_id_fkey`: provider_id → llm_providers(id)

## Indexes

- `llm_models_pkey`
  ```sql
  CREATE UNIQUE INDEX llm_models_pkey ON public.llm_models USING btree (id)
  ```

## RLS Policies

### 1. Allow service_role to manage llm_models (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. Anon read llm_models (SELECT)

- **Roles**: {anon}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
