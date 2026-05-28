# pocock_oos_findings Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-28T17:45:31.644Z
**Rows**: 4,517
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| category | `text` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| rationale | `text` | **NO** | - | - |
| rejected_in_sd | `text` | YES | - | - |
| rejected_in_brainstorm | `uuid` | YES | - | - |
| source | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `pocock_oos_findings_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_pocock_oos_findings_category`
  ```sql
  CREATE INDEX idx_pocock_oos_findings_category ON public.pocock_oos_findings USING btree (category)
  ```
- `idx_pocock_oos_findings_created_at`
  ```sql
  CREATE INDEX idx_pocock_oos_findings_created_at ON public.pocock_oos_findings USING btree (created_at DESC)
  ```
- `pocock_oos_findings_pkey`
  ```sql
  CREATE UNIQUE INDEX pocock_oos_findings_pkey ON public.pocock_oos_findings USING btree (id)
  ```

## RLS Policies

### 1. pocock_oos_findings_authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. pocock_oos_findings_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
