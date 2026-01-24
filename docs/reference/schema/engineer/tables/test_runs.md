# test_runs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-24T03:07:02.107Z
**Rows**: 6
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (23 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(50)` | **NO** | - | - |
| prd_id | `character varying(255)` | YES | - | - |
| run_type | `character varying(50)` | **NO** | - | - |
| triggered_by | `character varying(100)` | **NO** | - | - |
| trigger_context | `jsonb` | YES | `'{}'::jsonb` | - |
| started_at | `timestamp with time zone` | **NO** | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| duration_ms | `integer(32)` | YES | - | - |
| total_tests | `integer(32)` | **NO** | `0` | - |
| passed_tests | `integer(32)` | **NO** | `0` | - |
| failed_tests | `integer(32)` | **NO** | `0` | - |
| skipped_tests | `integer(32)` | **NO** | `0` | - |
| pass_rate | `numeric(5,2)` | YES | - | - |
| verdict | `character varying(20)` | **NO** | - | - |
| raw_report_json | `jsonb` | YES | - | - |
| report_hash | `character varying(64)` | YES | - | - |
| report_file_path | `character varying(500)` | YES | - | - |
| environment | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| evidence_pack_id | `character varying(100)` | YES | - | Unique evidence pack ID (EVP-{timestamp}-{hash}) linking to manifest artifacts. LEO v4.4 |
| evidence_manifest | `jsonb` | YES | - | Full evidence pack manifest including artifact list, SHA-256 hashes, and integrity verification data. LEO v4.4 |
| cleanup_stats | `jsonb` | YES | - | Statistics from automatic trace cleanup: tracesDeleted, bytesFreed, etc. LEO v4.4 |

## Constraints

### Primary Key
- `test_runs_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `test_runs_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `test_runs_run_type_check`: CHECK (((run_type)::text = ANY ((ARRAY['playwright'::character varying, 'vitest'::character varying, 'ci_pipeline'::character varying, 'manual_verification'::character varying])::text[])))
- `test_runs_verdict_check`: CHECK (((verdict)::text = ANY ((ARRAY['PASS'::character varying, 'FAIL'::character varying, 'PARTIAL'::character varying, 'ERROR'::character varying, 'CANCELLED'::character varying])::text[])))
- `valid_test_counts`: CHECK ((((passed_tests + failed_tests) + skipped_tests) <= total_tests))

## Indexes

- `idx_test_runs_completed_at`
  ```sql
  CREATE INDEX idx_test_runs_completed_at ON public.test_runs USING btree (completed_at DESC)
  ```
- `idx_test_runs_evidence_pack_id`
  ```sql
  CREATE INDEX idx_test_runs_evidence_pack_id ON public.test_runs USING btree (evidence_pack_id) WHERE (evidence_pack_id IS NOT NULL)
  ```
- `idx_test_runs_sd_id`
  ```sql
  CREATE INDEX idx_test_runs_sd_id ON public.test_runs USING btree (sd_id)
  ```
- `idx_test_runs_verdict`
  ```sql
  CREATE INDEX idx_test_runs_verdict ON public.test_runs USING btree (verdict)
  ```
- `test_runs_pkey`
  ```sql
  CREATE UNIQUE INDEX test_runs_pkey ON public.test_runs USING btree (id)
  ```

## RLS Policies

### 1. Allow inserts to test_runs (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. Anyone can read test_runs (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 3. No deletes from test_runs (DELETE)

- **Roles**: {public}
- **Using**: `false`

### 4. No updates to test_runs (UPDATE)

- **Roles**: {public}
- **Using**: `false`

---

[← Back to Schema Overview](../database-schema-overview.md)
