# eva_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-20T23:43:09.361Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (4 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| key | `text` | **NO** | - | - |
| value | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_config_pkey`: PRIMARY KEY (key)

## Indexes

- `eva_config_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_config_pkey ON public.eva_config USING btree (key)
  ```

## RLS Policies

### 1. eva_config_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. eva_config_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
