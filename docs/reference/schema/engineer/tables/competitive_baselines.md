# competitive_baselines Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-05T13:22:03.303Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| competitor_name | `text` | **NO** | - | - |
| baseline_type | `text` | **NO** | `'COMPETITOR'::text` | - |
| pricing_data | `jsonb` | YES | `'{}'::jsonb` | - |
| feature_coverage | `jsonb` | YES | `'{}'::jsonb` | - |
| performance_metrics | `jsonb` | YES | `'{}'::jsonb` | - |
| epistemic_tag | `text` | **NO** | `'UNKNOWN'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `competitive_baselines_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `competitive_baselines_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `competitive_baselines_baseline_type_check`: CHECK ((baseline_type = ANY (ARRAY['COMPETITOR'::text, 'STATUS_QUO'::text])))
- `competitive_baselines_epistemic_tag_check`: CHECK ((epistemic_tag = ANY (ARRAY['FACT'::text, 'ASSUMPTION'::text, 'SIMULATION'::text, 'UNKNOWN'::text])))

## Indexes

- `competitive_baselines_pkey`
  ```sql
  CREATE UNIQUE INDEX competitive_baselines_pkey ON public.competitive_baselines USING btree (id)
  ```
- `idx_competitive_baselines_venture_id`
  ```sql
  CREATE INDEX idx_competitive_baselines_venture_id ON public.competitive_baselines USING btree (venture_id)
  ```

## RLS Policies

### 1. Service role full access on competitive_baselines (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
