# user_preferences Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T00:38:09.582Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | - | - |
| user_id | `uuid` | YES | - | - |
| preference_category | `text` | YES | - | - |
| preference_key | `text` | YES | - | - |
| preference_value | `jsonb` | YES | - | - |
| device_type | `text` | YES | - | - |
| sync_across_devices | `boolean` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |
| active_persona | `text` | YES | - | - |

## Constraints

### Primary Key
- `user_preferences_pkey`: PRIMARY KEY (id)

## Indexes

- `user_preferences_pkey`
  ```sql
  CREATE UNIQUE INDEX user_preferences_pkey ON public.user_preferences USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_user_preferences (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. users_own_user_preferences (ALL)

- **Roles**: {authenticated}
- **Using**: `(user_id = auth.uid())`
- **With Check**: `(user_id = auth.uid())`

---

[← Back to Schema Overview](../database-schema-overview.md)
