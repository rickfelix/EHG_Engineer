# user_navigation_analytics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-08T21:06:59.122Z
**Rows**: 112
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | - | - |
| user_id | `uuid` | YES | - | - |
| event_type | `text` | YES | - | - |
| content_type | `text` | YES | - | - |
| content_id | `text` | YES | - | - |
| content_path | `text` | YES | - | - |
| session_id | `text` | YES | - | - |
| event_metadata | `jsonb` | YES | - | - |
| timestamp | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `user_navigation_analytics_pkey`: PRIMARY KEY (id)

## Indexes

- `user_navigation_analytics_pkey`
  ```sql
  CREATE UNIQUE INDEX user_navigation_analytics_pkey ON public.user_navigation_analytics USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_navigation_analytics (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. users_own_navigation_analytics (ALL)

- **Roles**: {authenticated}
- **Using**: `(user_id = auth.uid())`
- **With Check**: `(user_id = auth.uid())`

---

[← Back to Schema Overview](../database-schema-overview.md)
