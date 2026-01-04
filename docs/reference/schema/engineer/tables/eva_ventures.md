# eva_ventures Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-04T15:10:53.065Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| name | `text` | **NO** | - | - |
| status | `text` | YES | `'active'::text` | - |
| health_status | `text` | YES | `'yellow'::text` | - |
| mrr | `numeric(12,2)` | YES | `0` | - |
| mrr_growth_rate | `numeric(5,2)` | YES | `0` | - |
| churn_rate | `numeric(5,2)` | YES | `0` | - |
| burn_rate | `numeric(12,2)` | YES | `0` | - |
| runway_months | `integer(32)` | YES | `0` | - |
| decision_class | `text` | YES | `'C'::text` | - |
| last_decision_at | `timestamp with time zone` | YES | - | - |
| pending_decisions | `integer(32)` | YES | `0` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_ventures_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_ventures_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `eva_ventures_venture_id_key`: UNIQUE (venture_id)

### Check Constraints
- `eva_ventures_decision_class_check`: CHECK ((decision_class = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])))
- `eva_ventures_health_status_check`: CHECK ((health_status = ANY (ARRAY['green'::text, 'yellow'::text, 'red'::text])))
- `eva_ventures_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'killed'::text, 'graduated'::text])))

## Indexes

- `eva_ventures_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_ventures_pkey ON public.eva_ventures USING btree (id)
  ```
- `eva_ventures_venture_id_key`
  ```sql
  CREATE UNIQUE INDEX eva_ventures_venture_id_key ON public.eva_ventures USING btree (venture_id)
  ```
- `idx_eva_ventures_health`
  ```sql
  CREATE INDEX idx_eva_ventures_health ON public.eva_ventures USING btree (health_status)
  ```
- `idx_eva_ventures_status`
  ```sql
  CREATE INDEX idx_eva_ventures_status ON public.eva_ventures USING btree (status)
  ```

## RLS Policies

### 1. eva_ventures_admin_access (ALL)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
