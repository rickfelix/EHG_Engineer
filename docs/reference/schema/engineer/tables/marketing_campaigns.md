# marketing_campaigns Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-01T17:59:03.922Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| name | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| status | `text` | **NO** | `'draft'::text` | - |
| start_date | `timestamp with time zone` | YES | - | - |
| end_date | `timestamp with time zone` | YES | - | - |
| objective | `text` | YES | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `marketing_campaigns_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `marketing_campaigns_venture_id_fkey`: venture_id → ventures(id)

## Indexes

- `idx_marketing_campaigns_status`
  ```sql
  CREATE INDEX idx_marketing_campaigns_status ON public.marketing_campaigns USING btree (status)
  ```
- `idx_marketing_campaigns_venture`
  ```sql
  CREATE INDEX idx_marketing_campaigns_venture ON public.marketing_campaigns USING btree (venture_id)
  ```
- `marketing_campaigns_pkey`
  ```sql
  CREATE UNIQUE INDEX marketing_campaigns_pkey ON public.marketing_campaigns USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_marketing_campaigns (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. venture_read_marketing_campaigns (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE ((auth.uid())::text = (ventures.created_by)::text)))`

## Triggers

### trg_marketing_campaigns_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_marketing_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
