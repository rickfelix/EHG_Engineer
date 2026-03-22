# uat_credential_history Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-22T18:00:11.108Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| environment | `character varying(50)` | **NO** | - | - |
| old_credentials | `jsonb` | YES | - | - |
| new_credentials | `jsonb` | YES | - | - |
| reason | `character varying(255)` | YES | - | - |
| rotated_by | `character varying(255)` | YES | - | - |
| rotated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `uat_credential_history_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_uat_credential_history_environment`
  ```sql
  CREATE INDEX idx_uat_credential_history_environment ON public.uat_credential_history USING btree (environment)
  ```
- `idx_uat_credential_history_rotated_at`
  ```sql
  CREATE INDEX idx_uat_credential_history_rotated_at ON public.uat_credential_history USING btree (rotated_at)
  ```
- `uat_credential_history_pkey`
  ```sql
  CREATE UNIQUE INDEX uat_credential_history_pkey ON public.uat_credential_history USING btree (id)
  ```

## RLS Policies

### 1. Service role can view history (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. service_role_insert_uat_credential_history (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 3. service_role_select_uat_credential_history (SELECT)

- **Roles**: {service_role}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
