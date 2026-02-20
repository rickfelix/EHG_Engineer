# eva_vision_iterations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-20T19:27:37.470Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| vision_id | `uuid` | **NO** | - | - |
| iteration_number | `integer(32)` | **NO** | - | - |
| trigger_type | `character varying(50)` | YES | - | - |
| sds_scored | `integer(32)` | **NO** | `0` | - |
| sds_accepted | `integer(32)` | **NO** | `0` | - |
| sds_generated | `integer(32)` | **NO** | `0` | - |
| portfolio_score | `integer(32)` | YES | - | - |
| gap_analysis | `jsonb` | YES | - | - |
| vision_version_before | `integer(32)` | YES | - | - |
| vision_version_after | `integer(32)` | YES | - | - |
| started_at | `timestamp with time zone` | **NO** | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `eva_vision_iterations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_vision_iterations_vision_id_fkey`: vision_id → eva_vision_documents(id)

### Unique Constraints
- `eva_vision_iterations_vision_id_iteration_number_key`: UNIQUE (vision_id, iteration_number)

### Check Constraints
- `eva_vision_iterations_portfolio_score_check`: CHECK (((portfolio_score >= 0) AND (portfolio_score <= 100)))

## Indexes

- `eva_vision_iterations_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_vision_iterations_pkey ON public.eva_vision_iterations USING btree (id)
  ```
- `eva_vision_iterations_vision_id_iteration_number_key`
  ```sql
  CREATE UNIQUE INDEX eva_vision_iterations_vision_id_iteration_number_key ON public.eva_vision_iterations USING btree (vision_id, iteration_number)
  ```
- `idx_eva_vision_iterations_vision`
  ```sql
  CREATE INDEX idx_eva_vision_iterations_vision ON public.eva_vision_iterations USING btree (vision_id)
  ```

## RLS Policies

### 1. eva_vision_iterations_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. eva_vision_iterations_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
