# ai_gen_provenance Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-29T15:23:40.444Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| chairman_decision_id | `uuid` | **NO** | - | - |
| claim_id | `text` | **NO** | - | client-side stable hash of claim text |
| claim_text_excerpt | `text` | **NO** | - | first 280 chars for audit display, never PII |
| source_table | `text` | **NO** | - | - |
| source_row_id | `uuid` | **NO** | - | - |
| source_field_path | `text` | **NO** | - | JSONPath into source row, e.g. $.metrics.cac |
| confidence | `numeric(3,2)` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `ai_gen_provenance_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `ai_gen_provenance_chairman_decision_id_fkey`: chairman_decision_id → chairman_decisions(id)

### Check Constraints
- `ai_gen_provenance_confidence_check`: CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))
- `ai_gen_provenance_source_table_check`: CHECK ((source_table = ANY (ARRAY['ventures'::text, 'stage_executions'::text, 'stage13_assessments'::text, 'stage13_substage_states'::text, 'stage13_valuations'::text, 'stage_artifact_requirements'::text, 'stage_data_contracts'::text, 'stage_events'::text, 'stage_proving_journal'::text, 'stage_prop_contracts'::text, 'stage_of_death_predictions'::text, 'stage_zero_requests'::text])))

## Indexes

- `ai_gen_provenance_pkey`
  ```sql
  CREATE UNIQUE INDEX ai_gen_provenance_pkey ON public.ai_gen_provenance USING btree (id)
  ```
- `idx_ai_gen_provenance_claim_id`
  ```sql
  CREATE INDEX idx_ai_gen_provenance_claim_id ON public.ai_gen_provenance USING btree (claim_id)
  ```
- `idx_ai_gen_provenance_created_brin`
  ```sql
  CREATE INDEX idx_ai_gen_provenance_created_brin ON public.ai_gen_provenance USING brin (created_at)
  ```
- `idx_ai_gen_provenance_decision`
  ```sql
  CREATE INDEX idx_ai_gen_provenance_decision ON public.ai_gen_provenance USING btree (chairman_decision_id)
  ```
- `idx_ai_gen_provenance_source`
  ```sql
  CREATE INDEX idx_ai_gen_provenance_source ON public.ai_gen_provenance USING btree (source_table, source_row_id)
  ```

## RLS Policies

### 1. ai_gen_provenance_chairman_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`

### 2. ai_gen_provenance_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
