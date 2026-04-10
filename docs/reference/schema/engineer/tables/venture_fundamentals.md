# venture_fundamentals Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-10T17:29:29.773Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | UUID of the venture this configuration belongs to |
| venture_name | `text` | **NO** | - | - |
| tech_stack_version | `text` | **NO** | `'1.0.0'::text` | - |
| slo_tier | `text` | **NO** | - | Current SLO tier: tier_0_infrastructure (internal tooling), tier_1_mvp (pre-PMF), tier_2_post_pmf (production) |
| slo_targets | `jsonb` | **NO** | `'{}'::jsonb` | JSONB object with SLO target values for the current tier (e.g., {"uptime": 99.9, "p95_latency_ms": 500}) |
| isolation_tier | `text` | **NO** | `'pool'::text` | Supabase isolation level: pool (shared), schema (isolated schema), separate_project (dedicated instance) |
| shared_packages | `jsonb` | **NO** | `'[]'::jsonb` | JSONB array of @ehg/* packages and versions used by this venture |
| conformance_score | `integer(32)` | YES | `0` | Overall conformance score (0-100) from the latest audit |
| last_conformance_check | `timestamp with time zone` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_fundamentals_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `uq_venture_fundamentals_venture_id`: UNIQUE (venture_id)

### Check Constraints
- `venture_fundamentals_conformance_score_check`: CHECK (((conformance_score >= 0) AND (conformance_score <= 100)))
- `venture_fundamentals_isolation_tier_check`: CHECK ((isolation_tier = ANY (ARRAY['pool'::text, 'schema'::text, 'separate_project'::text])))
- `venture_fundamentals_slo_tier_check`: CHECK ((slo_tier = ANY (ARRAY['tier_0_infrastructure'::text, 'tier_1_mvp'::text, 'tier_2_post_pmf'::text])))

## Indexes

- `uq_venture_fundamentals_venture_id`
  ```sql
  CREATE UNIQUE INDEX uq_venture_fundamentals_venture_id ON public.venture_fundamentals USING btree (venture_id)
  ```
- `venture_fundamentals_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_fundamentals_pkey ON public.venture_fundamentals USING btree (id)
  ```

## RLS Policies

### 1. authenticated_select_venture_fundamentals (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_venture_fundamentals (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_venture_fundamentals_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
