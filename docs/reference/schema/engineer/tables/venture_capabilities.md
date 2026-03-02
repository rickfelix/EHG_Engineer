# venture_capabilities Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-02T01:18:17.458Z
**Rows**: 7
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `text` | **NO** | - | Capability name (e.g., AI Scoring Engine, Payment Gateway) |
| origin_venture_id | `uuid` | **NO** | - | Venture where this capability was first developed |
| origin_sd_key | `text` | YES | - | SD that produced this capability (optional) |
| capability_type | `text` | **NO** | - | Category of capability (e.g., infrastructure, ai_ml, data_pipeline, ui_component) |
| reusability_score | `integer(32)` | YES | `5` | How easily this capability can be reused (0-10) |
| integration_dependencies | `jsonb` | YES | `'[]'::jsonb` | Array of dependencies needed to integrate this capability |
| revenue_leverage_score | `integer(32)` | YES | `5` | Revenue impact potential (0-10) |
| maturity_level | `text` | YES | `'experimental'::text` | Current maturity: experimental, stable, production, deprecated |
| consumers | `jsonb` | YES | `'[]'::jsonb` | Array of venture IDs currently consuming this capability |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `venture_capabilities_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_capabilities_origin_venture_id_fkey`: origin_venture_id → ventures(id)

### Unique Constraints
- `uq_venture_capabilities_name_venture`: UNIQUE (name, origin_venture_id)

### Check Constraints
- `venture_capabilities_maturity_level_check`: CHECK ((maturity_level = ANY (ARRAY['experimental'::text, 'stable'::text, 'production'::text, 'deprecated'::text])))
- `venture_capabilities_reusability_score_check`: CHECK (((reusability_score >= 0) AND (reusability_score <= 10)))
- `venture_capabilities_revenue_leverage_score_check`: CHECK (((revenue_leverage_score >= 0) AND (revenue_leverage_score <= 10)))

## Indexes

- `idx_venture_capabilities_consumers_gin`
  ```sql
  CREATE INDEX idx_venture_capabilities_consumers_gin ON public.venture_capabilities USING gin (consumers)
  ```
- `idx_venture_capabilities_deps_gin`
  ```sql
  CREATE INDEX idx_venture_capabilities_deps_gin ON public.venture_capabilities USING gin (integration_dependencies)
  ```
- `idx_venture_capabilities_maturity`
  ```sql
  CREATE INDEX idx_venture_capabilities_maturity ON public.venture_capabilities USING btree (maturity_level)
  ```
- `idx_venture_capabilities_origin_venture`
  ```sql
  CREATE INDEX idx_venture_capabilities_origin_venture ON public.venture_capabilities USING btree (origin_venture_id)
  ```
- `idx_venture_capabilities_type`
  ```sql
  CREATE INDEX idx_venture_capabilities_type ON public.venture_capabilities USING btree (capability_type)
  ```
- `uq_venture_capabilities_name_venture`
  ```sql
  CREATE UNIQUE INDEX uq_venture_capabilities_name_venture ON public.venture_capabilities USING btree (name, origin_venture_id)
  ```
- `venture_capabilities_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_capabilities_pkey ON public.venture_capabilities USING btree (id)
  ```

## RLS Policies

### 1. authenticated_select_venture_capabilities (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_venture_capabilities (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
