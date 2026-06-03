# competitor_intelligence Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-06-03T21:50:16.531Z
**Rows**: 0
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | Nullable FK to ventures.id. NULL for pre-seed Stage-0 records. |
| global_competitor_id | `uuid` | YES | - | Nullable FK to global_competitors.id (table confirmed present). ON DELETE SET NULL keeps the CI record even if the global competitor is removed. |
| competitor_url | `text` | YES | - | - |
| competitor_name | `text` | YES | - | - |
| source | `text` | **NO** | `'manual'::text` | - |
| four_buckets | `jsonb` | YES | - | Four-bucket framework storage: {facts, assumptions, simulations, unknowns} |
| competitive_intelligence | `jsonb` | YES | - | Structured analysis: {company, product, market, swot} |
| differentiation_strategy | `jsonb` | YES | - | Slot for Child E board output; NULL until Child E writes here. |
| differentiation_delta | `numeric` | YES | - | Slot for Child E delta gate numeric result; NULL until Child E writes here. |
| sanitization_status | `text` | **NO** | `'pending'::text` | - |
| quality | `jsonb` | YES | - | Quality metadata: {confidence_score, data_quality} |
| created_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `competitor_intelligence_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `competitor_intelligence_global_competitor_id_fkey`: global_competitor_id → global_competitors(id)
- `competitor_intelligence_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `competitor_intelligence_sanitization_status_check`: CHECK ((sanitization_status = ANY (ARRAY['pending'::text, 'passed'::text, 'flagged'::text])))
- `competitor_intelligence_source_check`: CHECK ((source = ANY (ARRAY['teardown'::text, 'differentiation_research'::text, 'discovery'::text, 'manual'::text])))

## Indexes

- `competitor_intelligence_pkey`
  ```sql
  CREATE UNIQUE INDEX competitor_intelligence_pkey ON public.competitor_intelligence USING btree (id)
  ```
- `idx_competitor_intelligence_created_by`
  ```sql
  CREATE INDEX idx_competitor_intelligence_created_by ON public.competitor_intelligence USING btree (created_by)
  ```
- `idx_competitor_intelligence_global_competitor_id`
  ```sql
  CREATE INDEX idx_competitor_intelligence_global_competitor_id ON public.competitor_intelligence USING btree (global_competitor_id)
  ```
- `idx_competitor_intelligence_sanitization_status`
  ```sql
  CREATE INDEX idx_competitor_intelligence_sanitization_status ON public.competitor_intelligence USING btree (sanitization_status)
  ```
- `idx_competitor_intelligence_venture_id`
  ```sql
  CREATE INDEX idx_competitor_intelligence_venture_id ON public.competitor_intelligence USING btree (venture_id)
  ```

## RLS Policies

### 1. ci_delete_own_venture (DELETE)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 2. ci_insert_own_venture (INSERT)

- **Roles**: {public}
- **With Check**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 3. ci_select_own_venture (SELECT)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 4. ci_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 5. ci_update_own_venture (UPDATE)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

## Triggers

### trg_competitor_intelligence_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
