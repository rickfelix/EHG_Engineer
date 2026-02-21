# venture_templates Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-21T15:16:03.794Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| source_venture_id | `uuid` | **NO** | - | - |
| template_name | `text` | **NO** | - | - |
| template_version | `integer(32)` | **NO** | `1` | - |
| domain_tags | `ARRAY` | **NO** | `'{}'::text[]` | - |
| template_data | `jsonb` | **NO** | `'{}'::jsonb` | JSONB: scoring_thresholds, architecture_patterns, dfe_calibrations, pricing_params, gtm_effectiveness |
| effectiveness_score | `numeric(5,2)` | **NO** | `0` | - |
| usage_count | `integer(32)` | **NO** | `0` | - |
| is_current | `boolean` | **NO** | `true` | Only one version per source_venture can be current; old versions set to false |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_templates_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_templates_source_venture_id_fkey`: source_venture_id → ventures(id)

### Check Constraints
- `venture_templates_effectiveness_score_check`: CHECK (((effectiveness_score >= (0)::numeric) AND (effectiveness_score <= (100)::numeric)))

## Indexes

- `idx_venture_templates_current`
  ```sql
  CREATE UNIQUE INDEX idx_venture_templates_current ON public.venture_templates USING btree (source_venture_id) WHERE (is_current = true)
  ```
- `idx_venture_templates_data`
  ```sql
  CREATE INDEX idx_venture_templates_data ON public.venture_templates USING gin (template_data)
  ```
- `idx_venture_templates_domain_tags`
  ```sql
  CREATE INDEX idx_venture_templates_domain_tags ON public.venture_templates USING gin (domain_tags)
  ```
- `idx_venture_templates_effectiveness`
  ```sql
  CREATE INDEX idx_venture_templates_effectiveness ON public.venture_templates USING btree (effectiveness_score DESC) WHERE (is_current = true)
  ```
- `venture_templates_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_templates_pkey ON public.venture_templates USING btree (id)
  ```

## RLS Policies

### 1. venture_templates_read (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. venture_templates_write (ALL)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_venture_templates_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_venture_templates_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
