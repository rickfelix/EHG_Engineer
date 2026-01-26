# aegis_constitutions Table


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-26
- **Tags**: database, schema, rls, protocol

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-26T04:26:11.529Z
**Rows**: 7
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| code | `character varying(50)` | **NO** | - | Unique code identifier (e.g., PROTOCOL, FOUR_OATHS, DOCTRINE) |
| name | `character varying(100)` | **NO** | - | - |
| description | `text` | YES | - | - |
| version | `character varying(20)` | **NO** | `'1.0.0'::character varying` | - |
| domain | `character varying(50)` | **NO** | - | Domain this constitution governs |
| enforcement_mode | `character varying(20)` | **NO** | `'enforced'::character varying` | enforced=block violations, audit_only=log only, disabled=skip |
| parent_constitution_id | `uuid` | YES | - | Parent constitution for inheritance |
| is_active | `boolean` | **NO** | `true` | - |
| superseded_by | `uuid` | YES | - | ID of constitution that replaced this one (append-only versioning) |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `character varying(100)` | YES | `'SYSTEM'::character varying` | - |

## Constraints

### Primary Key
- `aegis_constitutions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `aegis_constitutions_parent_constitution_id_fkey`: parent_constitution_id → aegis_constitutions(id)
- `aegis_constitutions_superseded_by_fkey`: superseded_by → aegis_constitutions(id)

### Unique Constraints
- `aegis_constitutions_code_key`: UNIQUE (code)

### Check Constraints
- `aegis_constitutions_domain_check`: CHECK (((domain)::text = ANY ((ARRAY['self_improvement'::character varying, 'agent_behavior'::character varying, 'system_state'::character varying, 'execution'::character varying, 'compliance'::character varying])::text[])))
- `aegis_constitutions_enforcement_mode_check`: CHECK (((enforcement_mode)::text = ANY ((ARRAY['enforced'::character varying, 'audit_only'::character varying, 'disabled'::character varying])::text[])))

## Indexes

- `aegis_constitutions_code_key`
  ```sql
  CREATE UNIQUE INDEX aegis_constitutions_code_key ON public.aegis_constitutions USING btree (code)
  ```
- `aegis_constitutions_pkey`
  ```sql
  CREATE UNIQUE INDEX aegis_constitutions_pkey ON public.aegis_constitutions USING btree (id)
  ```
- `idx_aegis_constitutions_active`
  ```sql
  CREATE INDEX idx_aegis_constitutions_active ON public.aegis_constitutions USING btree (is_active)
  ```
- `idx_aegis_constitutions_code`
  ```sql
  CREATE INDEX idx_aegis_constitutions_code ON public.aegis_constitutions USING btree (code)
  ```
- `idx_aegis_constitutions_domain`
  ```sql
  CREATE INDEX idx_aegis_constitutions_domain ON public.aegis_constitutions USING btree (domain)
  ```

## RLS Policies

### 1. insert_aegis_constitutions (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. limited_update_aegis_constitutions (UPDATE)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

### 3. no_delete_aegis_constitutions (DELETE)

- **Roles**: {public}
- **Using**: `false`

### 4. select_aegis_constitutions (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
