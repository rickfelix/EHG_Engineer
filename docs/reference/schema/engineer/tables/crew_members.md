# crew_members Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-11T02:41:15.246Z
**Rows**: 15
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | - | - |
| crew_id | `uuid` | YES | - | - |
| agent_id | `uuid` | YES | - | - |
| role_in_crew | `text` | YES | - | - |
| sequence_order | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `crew_members_pkey`: PRIMARY KEY (id)

## Indexes

- `crew_members_pkey`
  ```sql
  CREATE UNIQUE INDEX crew_members_pkey ON public.crew_members USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_crew_members (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_crew_members (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
