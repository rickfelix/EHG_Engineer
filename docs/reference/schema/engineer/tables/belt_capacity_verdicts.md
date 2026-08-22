# belt_capacity_verdicts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 673
**RLS**: Enabled (0 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| run_id | `text` | YES | - | - |
| verdict | `text` | **NO** | - | The capacity ladder reading, one of the frozen four. NOT the forecast's rendered verdict, which the corpus gate may set to OK-CORPUS-GATED — that lives in detail->>'rendered_verdict'. |
| belt_depth | `integer(32)` | **NO** | - | - |
| demand_soon | `integer(32)` | **NO** | - | - |
| deficit | `integer(32)` | **NO** | - | - |
| detail | `jsonb` | YES | - | - |
| recorded_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `belt_capacity_verdicts_pkey`: PRIMARY KEY (id)

### Check Constraints
- `belt_capacity_verdicts_verdict_check`: CHECK ((verdict = ANY (ARRAY['DEFICIT-URGENT'::text, 'DEFICIT'::text, 'TIGHT'::text, 'SURPLUS'::text])))

## Indexes

- `belt_capacity_verdicts_pkey`
  ```sql
  CREATE UNIQUE INDEX belt_capacity_verdicts_pkey ON public.belt_capacity_verdicts USING btree (id)
  ```
- `belt_capacity_verdicts_recorded_at_idx`
  ```sql
  CREATE INDEX belt_capacity_verdicts_recorded_at_idx ON public.belt_capacity_verdicts USING btree (recorded_at DESC)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
