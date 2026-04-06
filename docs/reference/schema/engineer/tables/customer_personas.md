# customer_personas Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-06T10:07:37.977Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `text` | **NO** | - | - |
| demographics | `jsonb` | YES | `'{}'::jsonb` | - |
| goals | `ARRAY` | YES | `'{}'::text[]` | - |
| pain_points | `ARRAY` | YES | `'{}'::text[]` | - |
| psychographics | `jsonb` | YES | `'{}'::jsonb` | - |
| industry | `text` | YES | - | - |
| archetype | `text` | YES | - | High-level persona archetype (e.g., early_adopter, enterprise_buyer, prosumer). |
| source_venture_id | `uuid` | YES | - | - |
| canonical_id | `uuid` | YES | - | Self-referencing FK for deduplication. NULL means canonical; non-NULL points to the canonical version. |
| created_by | `text` | YES | `'system'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `customer_personas_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `customer_personas_canonical_id_fkey`: canonical_id → customer_personas(id)
- `customer_personas_source_venture_id_fkey`: source_venture_id → ventures(id)

## Indexes

- `customer_personas_pkey`
  ```sql
  CREATE UNIQUE INDEX customer_personas_pkey ON public.customer_personas USING btree (id)
  ```
- `idx_customer_personas_canonical`
  ```sql
  CREATE UNIQUE INDEX idx_customer_personas_canonical ON public.customer_personas USING btree (name, COALESCE(industry, ''::text)) WHERE (canonical_id IS NULL)
  ```

## RLS Policies

### 1. all_customer_personas_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. select_customer_personas_authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### set_updated_at_customer_personas

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trg_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
