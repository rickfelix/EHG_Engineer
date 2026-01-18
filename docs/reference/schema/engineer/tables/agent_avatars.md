# agent_avatars Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-18T21:54:07.007Z
**Rows**: 66
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | - | - |
| agent_id | `uuid` | YES | - | - |
| variant_number | `integer(32)` | YES | - | - |
| avatar_url | `text` | YES | - | - |
| description | `text` | YES | - | - |
| ethnicity | `text` | YES | - | - |
| gender | `text` | YES | - | - |
| background_setting | `text` | YES | - | - |
| generation_status | `text` | YES | - | - |
| prompt_used | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `agent_avatars_pkey`: PRIMARY KEY (id)

## Indexes

- `agent_avatars_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_avatars_pkey ON public.agent_avatars USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_agent_avatars (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_agent_avatars (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
