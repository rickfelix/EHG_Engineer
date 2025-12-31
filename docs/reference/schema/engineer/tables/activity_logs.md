# activity_logs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-12-31T16:02:09.576Z
**Rows**: 243
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| user_id | `uuid` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| activity_type | `text` | YES | - | - |
| activity_action | `text` | YES | - | - |
| metadata | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `activity_logs_pkey`: PRIMARY KEY (id)

## Indexes

- `activity_logs_pkey`
  ```sql
  CREATE UNIQUE INDEX activity_logs_pkey ON public.activity_logs USING btree (id)
  ```

## RLS Policies

### 1. authenticated_all_activity_logs (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 2. service_role_all_activity_logs (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
