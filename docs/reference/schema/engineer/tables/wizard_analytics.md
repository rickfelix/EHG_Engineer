# wizard_analytics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-04T20:01:25.156Z
**Rows**: 62
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | - | - |
| event_type | `text` | YES | - | - |
| user_id | `uuid` | YES | - | - |
| venture_id | `text` | YES | - | - |
| step | `text` | YES | - | - |
| duration_ms | `text` | YES | - | - |
| metadata | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `wizard_analytics_pkey`: PRIMARY KEY (id)

## Indexes

- `wizard_analytics_pkey`
  ```sql
  CREATE UNIQUE INDEX wizard_analytics_pkey ON public.wizard_analytics USING btree (id)
  ```

## RLS Policies

### 1. authenticated_all_wizard_analytics (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 2. service_role_all_wizard_analytics (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
