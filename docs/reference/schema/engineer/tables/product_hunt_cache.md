# product_hunt_cache Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-04T03:43:38.145Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| category | `text` | **NO** | - | - |
| products | `jsonb` | **NO** | `'[]'::jsonb` | - |
| fetched_at | `timestamp with time zone` | YES | `now()` | - |
| expires_at | `timestamp with time zone` | YES | `(now() + '24:00:00'::interval)` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `product_hunt_cache_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `product_hunt_cache_venture_id_fkey`: venture_id → ventures(id)

## Indexes

- `idx_phc_expires`
  ```sql
  CREATE INDEX idx_phc_expires ON public.product_hunt_cache USING btree (expires_at)
  ```
- `idx_phc_venture_category`
  ```sql
  CREATE INDEX idx_phc_venture_category ON public.product_hunt_cache USING btree (venture_id, category)
  ```
- `product_hunt_cache_pkey`
  ```sql
  CREATE UNIQUE INDEX product_hunt_cache_pkey ON public.product_hunt_cache USING btree (id)
  ```

## RLS Policies

### 1. Service role full access (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
