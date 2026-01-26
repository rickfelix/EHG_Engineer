# uat_test_users Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-26T04:24:06.742Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| email | `character varying(255)` | **NO** | - | - |
| password | `text` | **NO** | - | - |
| type | `character varying(50)` | YES | `'uat_test_user'::character varying` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| last_used | `timestamp with time zone` | YES | - | - |
| rotation_due | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `uat_test_users_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `uat_test_users_email_key`: UNIQUE (email)

## Indexes

- `idx_uat_test_users_email`
  ```sql
  CREATE INDEX idx_uat_test_users_email ON public.uat_test_users USING btree (email)
  ```
- `idx_uat_test_users_type`
  ```sql
  CREATE INDEX idx_uat_test_users_type ON public.uat_test_users USING btree (type)
  ```
- `uat_test_users_email_key`
  ```sql
  CREATE UNIQUE INDEX uat_test_users_email_key ON public.uat_test_users USING btree (email)
  ```
- `uat_test_users_pkey`
  ```sql
  CREATE UNIQUE INDEX uat_test_users_pkey ON public.uat_test_users USING btree (id)
  ```

## RLS Policies

### 1. Service role can manage test users (ALL)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
