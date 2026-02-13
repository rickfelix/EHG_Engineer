# leo_feature_flag_audit_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T20:38:04.433Z
**Rows**: 6
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| flag_key | `text` | **NO** | - | - |
| action | `text` | **NO** | - | - |
| previous_state | `jsonb` | YES | - | - |
| new_state | `jsonb` | YES | - | - |
| changed_by | `text` | YES | - | - |
| environment | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `leo_feature_flag_audit_log_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_leo_feature_flag_audit_log_created_at`
  ```sql
  CREATE INDEX idx_leo_feature_flag_audit_log_created_at ON public.leo_feature_flag_audit_log USING btree (created_at DESC)
  ```
- `idx_leo_feature_flag_audit_log_flag_key`
  ```sql
  CREATE INDEX idx_leo_feature_flag_audit_log_flag_key ON public.leo_feature_flag_audit_log USING btree (flag_key, created_at DESC)
  ```
- `leo_feature_flag_audit_log_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_feature_flag_audit_log_pkey ON public.leo_feature_flag_audit_log USING btree (id)
  ```

## RLS Policies

### 1. leo_feature_flag_audit_log_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. leo_feature_flag_audit_log_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
