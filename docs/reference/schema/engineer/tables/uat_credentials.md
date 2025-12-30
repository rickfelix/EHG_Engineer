# uat_credentials Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-12-30T21:56:22.248Z
**Rows**: 2
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (5 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| environment | `character varying(50)` | **NO** | - | - |
| credentials | `jsonb` | **NO** | - | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `uat_credentials_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `uat_credentials_environment_key`: UNIQUE (environment)

## Indexes

- `idx_uat_credentials_environment`
  ```sql
  CREATE INDEX idx_uat_credentials_environment ON public.uat_credentials USING btree (environment)
  ```
- `uat_credentials_environment_key`
  ```sql
  CREATE UNIQUE INDEX uat_credentials_environment_key ON public.uat_credentials USING btree (environment)
  ```
- `uat_credentials_pkey`
  ```sql
  CREATE UNIQUE INDEX uat_credentials_pkey ON public.uat_credentials USING btree (id)
  ```

## RLS Policies

### 1. Service role can manage credentials (ALL)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
