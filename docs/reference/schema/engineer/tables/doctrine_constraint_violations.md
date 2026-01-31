# doctrine_constraint_violations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-31T00:29:59.670Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| violation_type | `character varying(50)` | **NO** | - | - |
| attempted_table | `character varying(100)` | **NO** | - | - |
| attempted_operation | `character varying(20)` | **NO** | - | - |
| actor_role | `character varying(50)` | **NO** | - | - |
| actor_id | `character varying(100)` | YES | - | - |
| sd_id | `character varying(100)` | YES | - | - |
| prd_id | `character varying(100)` | YES | - | - |
| payload | `jsonb` | YES | `'{}'::jsonb` | - |
| error_message | `text` | **NO** | - | - |
| stack_trace | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| session_id | `text` | YES | - | - |
| correlation_id | `uuid` | YES | - | - |

## Constraints

### Primary Key
- `doctrine_constraint_violations_pkey`: PRIMARY KEY (id)

## Indexes

- `doctrine_constraint_violations_pkey`
  ```sql
  CREATE UNIQUE INDEX doctrine_constraint_violations_pkey ON public.doctrine_constraint_violations USING btree (id)
  ```
- `idx_doctrine_violations_actor`
  ```sql
  CREATE INDEX idx_doctrine_violations_actor ON public.doctrine_constraint_violations USING btree (actor_role)
  ```
- `idx_doctrine_violations_created`
  ```sql
  CREATE INDEX idx_doctrine_violations_created ON public.doctrine_constraint_violations USING btree (created_at DESC)
  ```
- `idx_doctrine_violations_type`
  ```sql
  CREATE INDEX idx_doctrine_violations_type ON public.doctrine_constraint_violations USING btree (violation_type)
  ```

## RLS Policies

### 1. doctrine_violations_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. doctrine_violations_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
