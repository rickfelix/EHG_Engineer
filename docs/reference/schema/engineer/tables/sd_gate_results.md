# sd_gate_results Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T22:06:06.603Z
**Rows**: 1
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `uuid` | **NO** | - | - |
| gate_id | `text` | **NO** | - | - |
| result | `text` | **NO** | - | - |
| score | `integer(32)` | YES | - | - |
| max_score | `integer(32)` | YES | - | - |
| issues | `jsonb` | YES | `'[]'::jsonb` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| executed_at | `timestamp with time zone` | YES | `now()` | - |
| retry_count | `integer(32)` | YES | `0` | - |

## Constraints

### Primary Key
- `sd_gate_results_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_gate_results_sd_id_fkey`: sd_id → strategic_directives_v2(uuid_id)

### Unique Constraints
- `sd_gate_results_sd_id_gate_id_key`: UNIQUE (sd_id, gate_id)

### Check Constraints
- `sd_gate_results_result_check`: CHECK ((result = ANY (ARRAY['PASS'::text, 'FAIL'::text, 'SKIP'::text, 'PENDING'::text])))

## Indexes

- `idx_gate_results_result`
  ```sql
  CREATE INDEX idx_gate_results_result ON public.sd_gate_results USING btree (result)
  ```
- `idx_gate_results_sd_id`
  ```sql
  CREATE INDEX idx_gate_results_sd_id ON public.sd_gate_results USING btree (sd_id)
  ```
- `sd_gate_results_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_gate_results_pkey ON public.sd_gate_results USING btree (id)
  ```
- `sd_gate_results_sd_id_gate_id_key`
  ```sql
  CREATE UNIQUE INDEX sd_gate_results_sd_id_gate_id_key ON public.sd_gate_results USING btree (sd_id, gate_id)
  ```

## RLS Policies

### 1. Service role full access to sd_gate_results (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
