# agent_readiness_audit_sample Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 24
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| audit_run_id | `uuid` | **NO** | - | - |
| prompt | `text` | **NO** | - | - |
| requested_model | `text` | **NO** | - | - |
| actual_responder_model | `text` | **NO** | - | - |
| cache_hit | `boolean` | **NO** | - | - |
| sample_index | `integer(32)` | **NO** | - | - |
| found | `boolean` | **NO** | - | - |
| recommended | `boolean` | **NO** | - | - |
| raw_response | `text` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `agent_readiness_audit_sample_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `agent_readiness_audit_sample_audit_run_id_fkey`: audit_run_id → agent_readiness_audit_run(id)

### Check Constraints
- `agent_readiness_audit_sample_no_cache`: CHECK ((cache_hit = false))
- `agent_readiness_audit_sample_no_fallback`: CHECK ((actual_responder_model = requested_model))
- `agent_readiness_audit_sample_prompt_nonempty`: CHECK ((btrim(prompt) <> ''::text))
- `agent_readiness_audit_sample_raw_response_nonempty`: CHECK ((btrim(raw_response) <> ''::text))
- `agent_readiness_audit_sample_requested_model_nonempty`: CHECK ((btrim(requested_model) <> ''::text))
- `agent_readiness_audit_sample_sample_index_positive`: CHECK ((sample_index >= 1))

## Indexes

- `agent_readiness_audit_sample_cell_replicate_key`
  ```sql
  CREATE UNIQUE INDEX agent_readiness_audit_sample_cell_replicate_key ON public.agent_readiness_audit_sample USING btree (audit_run_id, md5(prompt), requested_model, sample_index)
  ```
- `agent_readiness_audit_sample_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_readiness_audit_sample_pkey ON public.agent_readiness_audit_sample USING btree (id)
  ```
- `agent_readiness_audit_sample_rate_idx`
  ```sql
  CREATE INDEX agent_readiness_audit_sample_rate_idx ON public.agent_readiness_audit_sample USING btree (audit_run_id, requested_model, found, recommended)
  ```
- `agent_readiness_audit_sample_run_idx`
  ```sql
  CREATE INDEX agent_readiness_audit_sample_run_idx ON public.agent_readiness_audit_sample USING btree (audit_run_id)
  ```

## RLS Policies

### 1. agent_readiness_audit_sample_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### agent_readiness_audit_sample_freeze_trg

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION agent_readiness_measurement_freeze()`

### agent_readiness_audit_sample_freeze_trg

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION agent_readiness_measurement_freeze()`

---

[← Back to Schema Overview](../database-schema-overview.md)
