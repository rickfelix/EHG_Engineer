# discovery_strategies Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-21T07:05:42.917Z
**Rows**: 4
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| strategy_key | `text` | **NO** | - | - |
| name | `text` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| prompt_template | `text` | YES | - | - |
| data_sources | `jsonb` | YES | `'[]'::jsonb` | - |
| scoring_criteria | `jsonb` | YES | - | - |
| min_revenue_target | `numeric(10,2)` | YES | - | - |
| automation_required | `boolean` | YES | `true` | - |
| times_used | `integer(32)` | YES | `0` | - |
| avg_ventures_generated | `numeric(4,1)` | YES | - | - |
| is_active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `discovery_strategies_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `discovery_strategies_strategy_key_key`: UNIQUE (strategy_key)

## Indexes

- `discovery_strategies_pkey`
  ```sql
  CREATE UNIQUE INDEX discovery_strategies_pkey ON public.discovery_strategies USING btree (id)
  ```
- `discovery_strategies_strategy_key_key`
  ```sql
  CREATE UNIQUE INDEX discovery_strategies_strategy_key_key ON public.discovery_strategies USING btree (strategy_key)
  ```

## RLS Policies

### 1. discovery_strategies_service_all (ALL)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
