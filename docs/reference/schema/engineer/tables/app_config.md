# app_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T11:05:08.363Z
**Rows**: 1
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (5 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| key | `text` | **NO** | - | - |
| value | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `app_config_pkey`: PRIMARY KEY (key)

## Indexes

- `app_config_pkey`
  ```sql
  CREATE UNIQUE INDEX app_config_pkey ON public.app_config USING btree (key)
  ```

## RLS Policies

### 1. app_config_anon_read (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. app_config_authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. app_config_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
