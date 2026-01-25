# nav_preferences Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-25T00:34:15.838Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | - | - |
| user_id | `uuid` | YES | - | - |
| default_maturity | `text` | YES | - | - |
| show_draft | `boolean` | YES | - | - |
| show_development | `boolean` | YES | - | - |
| show_complete | `boolean` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `nav_preferences_pkey`: PRIMARY KEY (id)

## Indexes

- `nav_preferences_pkey`
  ```sql
  CREATE UNIQUE INDEX nav_preferences_pkey ON public.nav_preferences USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_nav_preferences (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. users_own_nav_preferences (ALL)

- **Roles**: {authenticated}
- **Using**: `(user_id = auth.uid())`
- **With Check**: `(user_id = auth.uid())`

---

[← Back to Schema Overview](../database-schema-overview.md)
