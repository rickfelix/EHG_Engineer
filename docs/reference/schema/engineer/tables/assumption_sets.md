# assumption_sets Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-18T19:52:25.488Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| version | `integer(32)` | **NO** | `1` | - |
| parent_version_id | `uuid` | YES | - | - |
| market_assumptions | `jsonb` | YES | `'{}'::jsonb` | - |
| competitor_assumptions | `jsonb` | YES | `'{}'::jsonb` | - |
| product_assumptions | `jsonb` | YES | `'{}'::jsonb` | - |
| timing_assumptions | `jsonb` | YES | `'{}'::jsonb` | - |
| confidence_scores | `jsonb` | YES | `'{}'::jsonb` | - |
| evidence_sources | `jsonb` | YES | `'[]'::jsonb` | - |
| status | `text` | **NO** | `'draft'::text` | - |
| created_at_stage | `integer(32)` | YES | - | - |
| finalized_at_stage | `integer(32)` | YES | - | - |
| reality_data | `jsonb` | YES | - | - |
| calibration_report | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | YES | - | - |
| updated_by | `text` | YES | - | - |

## Constraints

### Primary Key
- `assumption_sets_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `assumption_sets_parent_version_id_fkey`: parent_version_id → assumption_sets(id)

### Unique Constraints
- `uq_venture_version`: UNIQUE (venture_id, version)

### Check Constraints
- `assumption_sets_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'superseded'::text, 'validated'::text, 'invalidated'::text])))

## Indexes

- `assumption_sets_pkey`
  ```sql
  CREATE UNIQUE INDEX assumption_sets_pkey ON public.assumption_sets USING btree (id)
  ```
- `idx_assumption_sets_confidence`
  ```sql
  CREATE INDEX idx_assumption_sets_confidence ON public.assumption_sets USING gin (confidence_scores)
  ```
- `idx_assumption_sets_created_at_stage`
  ```sql
  CREATE INDEX idx_assumption_sets_created_at_stage ON public.assumption_sets USING btree (created_at_stage)
  ```
- `idx_assumption_sets_market`
  ```sql
  CREATE INDEX idx_assumption_sets_market ON public.assumption_sets USING gin (market_assumptions)
  ```
- `idx_assumption_sets_parent_version`
  ```sql
  CREATE INDEX idx_assumption_sets_parent_version ON public.assumption_sets USING btree (parent_version_id)
  ```
- `idx_assumption_sets_status`
  ```sql
  CREATE INDEX idx_assumption_sets_status ON public.assumption_sets USING btree (status)
  ```
- `idx_assumption_sets_venture_id`
  ```sql
  CREATE INDEX idx_assumption_sets_venture_id ON public.assumption_sets USING btree (venture_id)
  ```
- `uq_venture_version`
  ```sql
  CREATE UNIQUE INDEX uq_venture_version ON public.assumption_sets USING btree (venture_id, version)
  ```

## RLS Policies

### 1. Users can create assumption sets for accessible ventures (INSERT)

- **Roles**: {public}
- **With Check**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.company_id IN ( SELECT ventures.company_id
           FROM profiles
          WHERE (profiles.id = auth.uid())))))`

### 2. Users can delete assumption sets for accessible ventures (DELETE)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.company_id IN ( SELECT ventures.company_id
           FROM profiles
          WHERE (profiles.id = auth.uid())))))`

### 3. Users can update assumption sets for accessible ventures (UPDATE)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.company_id IN ( SELECT ventures.company_id
           FROM profiles
          WHERE (profiles.id = auth.uid())))))`

### 4. Users can view assumption sets for accessible ventures (SELECT)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.company_id IN ( SELECT ventures.company_id
           FROM profiles
          WHERE (profiles.id = auth.uid())))))`

## Triggers

### update_assumption_sets_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
