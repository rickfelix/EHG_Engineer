# venture_stage_cutover_grandfather Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 32
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (3 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| venture_id | `uuid` | **NO** | - | - |
| stage_number | `integer(32)` | **NO** | - | - |
| grandfathered_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_stage_cutover_grandfather_pkey`: PRIMARY KEY (venture_id, stage_number)

## Indexes

- `venture_stage_cutover_grandfather_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_stage_cutover_grandfather_pkey ON public.venture_stage_cutover_grandfather USING btree (venture_id, stage_number)
  ```

## RLS Policies

### 1. venture_stage_cutover_grandfather_service_only (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
