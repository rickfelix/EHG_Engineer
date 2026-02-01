# leo_adrs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T03:08:38.305Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| prd_id | `text` | **NO** | - | - |
| adr_number | `text` | **NO** | - | - |
| title | `text` | **NO** | - | - |
| status | `text` | **NO** | - | - |
| decision | `text` | **NO** | - | - |
| context | `text` | **NO** | - | - |
| options | `jsonb` | **NO** | `'[]'::jsonb` | - |
| consequences | `jsonb` | **NO** | `'{}'::jsonb` | - |
| impact | `jsonb` | **NO** | `'{}'::jsonb` | - |
| rollback_plan | `text` | YES | - | - |
| superseded_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `leo_adrs_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_adrs_superseded_by_fkey`: superseded_by → leo_adrs(id)

### Check Constraints
- `leo_adrs_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'proposed'::text, 'accepted'::text, 'deprecated'::text, 'superseded'::text])))

## Indexes

- `leo_adrs_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_adrs_pkey ON public.leo_adrs USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_adrs (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_adrs (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
