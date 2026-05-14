# gvos_adherence_logs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-14T17:44:12.435Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| run_at | `timestamp with time zone` | **NO** | `now()` | - |
| run_id | `text` | **NO** | - | CI run identifier (GitHub Actions run ID or local benchmark suite invocation hash). Groups all 200 results for one benchmark execution. |
| prompt_hash | `text` | **NO** | - | SHA-256 hash of the GVOS lovablePayload sent to Lovable for this benchmark sample. Same prompt across runs has the same hash, enabling longitudinal comparison. |
| archetype_id | `uuid` | YES | - | - |
| expected_archetype_id | `uuid` | YES | - | - |
| classification_correct | `boolean` | YES | - | Did the auto-classifier route to expected_archetype_id? Used by classifier-accuracy regression detection. |
| lovable_output_hash | `text` | YES | - | - |
| adherence_score | `numeric(4,3)` | YES | - | Lovable output adherence to the GVOS constraint set (0.000-1.000). Computed by validators/adherence-validator.js parsing Lovable output against design_reference_library exemplars. |
| constraint_violations | `jsonb` | **NO** | `'[]'::jsonb` | JSONB array of constraint violations found in Lovable output. E.g., [{"token":"Zero-Radius Constraint","violation":"border-radius: 8px detected"}]. |
| benchmark_suite_version | `text` | YES | - | - |

## Constraints

### Primary Key
- `gvos_adherence_logs_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `gvos_adherence_logs_archetype_id_fkey`: archetype_id → gvos_archetypes(id)
- `gvos_adherence_logs_expected_archetype_id_fkey`: expected_archetype_id → gvos_archetypes(id)

### Unique Constraints
- `gvos_adherence_logs_run_id_prompt_hash_key`: UNIQUE (run_id, prompt_hash)

### Check Constraints
- `gvos_adherence_logs_adherence_score_check`: CHECK (((adherence_score IS NULL) OR ((adherence_score >= (0)::numeric) AND (adherence_score <= (1)::numeric))))
- `gvos_adherence_logs_violations_is_array`: CHECK ((jsonb_typeof(constraint_violations) = 'array'::text))

## Indexes

- `gvos_adherence_logs_pkey`
  ```sql
  CREATE UNIQUE INDEX gvos_adherence_logs_pkey ON public.gvos_adherence_logs USING btree (id)
  ```
- `gvos_adherence_logs_run_id_prompt_hash_key`
  ```sql
  CREATE UNIQUE INDEX gvos_adherence_logs_run_id_prompt_hash_key ON public.gvos_adherence_logs USING btree (run_id, prompt_hash)
  ```
- `idx_gvos_adherence_logs_archetype_id`
  ```sql
  CREATE INDEX idx_gvos_adherence_logs_archetype_id ON public.gvos_adherence_logs USING btree (archetype_id)
  ```
- `idx_gvos_adherence_logs_archetype_run`
  ```sql
  CREATE INDEX idx_gvos_adherence_logs_archetype_run ON public.gvos_adherence_logs USING btree (archetype_id, run_at DESC)
  ```
- `idx_gvos_adherence_logs_run_at`
  ```sql
  CREATE INDEX idx_gvos_adherence_logs_run_at ON public.gvos_adherence_logs USING btree (run_at DESC)
  ```
- `idx_gvos_adherence_logs_run_id`
  ```sql
  CREATE INDEX idx_gvos_adherence_logs_run_id ON public.gvos_adherence_logs USING btree (run_id)
  ```

## RLS Policies

### 1. gvos_adherence_logs_insert_admin (INSERT)

- **Roles**: {authenticated,service_role}
- **With Check**: `is_leo_admin()`

### 2. gvos_adherence_logs_select_chairman (SELECT)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`

### 3. gvos_adherence_logs_select_service_role (SELECT)

- **Roles**: {service_role}
- **Using**: `true`

## Triggers

### gvos_adherence_logs_block_delete_trigger

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION gvos_adherence_logs_block_mutation()`

### gvos_adherence_logs_block_update_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION gvos_adherence_logs_block_mutation()`

---

[← Back to Schema Overview](../database-schema-overview.md)
