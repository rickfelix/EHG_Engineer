# leo_artifacts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-21T07:38:02.749Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| prd_id | `text` | **NO** | - | - |
| artifact_type | `text` | **NO** | - | - |
| artifact_name | `text` | **NO** | - | - |
| content | `jsonb` | **NO** | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `leo_artifacts_pkey`: PRIMARY KEY (id)

## Indexes

- `leo_artifacts_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_artifacts_pkey ON public.leo_artifacts USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_artifacts (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_artifacts (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
