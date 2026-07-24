# market_signal_observations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 40
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| source | `text` | **NO** | - | - |
| query_term | `text` | **NO** | - | - |
| family | `text` | **NO** | - | - |
| raw_value | `jsonb` | **NO** | - | - |
| content_hash | `text` | **NO** | - | - |
| fetched_at | `timestamp with time zone` | **NO** | - | - |
| transform_version | `text` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `market_signal_observations_pkey`: PRIMARY KEY (id)

### Check Constraints
- `market_signal_observations_family_check`: CHECK ((family = ANY (ARRAY['money_in'::text, 'stickiness'::text, 'structural'::text, 'attention'::text])))

## Indexes

- `idx_market_signal_observations_lookup`
  ```sql
  CREATE INDEX idx_market_signal_observations_lookup ON public.market_signal_observations USING btree (source, query_term, family, fetched_at)
  ```
- `market_signal_observations_pkey`
  ```sql
  CREATE UNIQUE INDEX market_signal_observations_pkey ON public.market_signal_observations USING btree (id)
  ```

## RLS Policies

### 1. market_signal_observations_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
