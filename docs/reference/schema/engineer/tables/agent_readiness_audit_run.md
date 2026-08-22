# agent_readiness_audit_run Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 5
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_url | `text` | **NO** | - | - |
| run_type | `text` | **NO** | - | - |
| prompt_set_id | `text` | **NO** | - | - |
| prompt_count | `integer(32)` | **NO** | - | - |
| model_set | `ARRAY` | **NO** | - | - |
| samples_per_cell | `integer(32)` | **NO** | - | - |
| pinned_temperature | `numeric(4,3)` | **NO** | - | - |
| stage_tag | `text` | **NO** | - | FR-5: which pipeline context produced this run. Closed vocabulary with no unknown-member, so the first-pipeline-proof claim is checkable against this tag rather than asserted from memory. |
| expected_sample_count | `integer(32)` | YES | - | Derived denominator for completeness. A run with fewer actual samples than this had samples REFUSED by the agent_readiness_audit_sample integrity CHECKs — see v_agent_readiness_audit_run_integrity. |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `agent_readiness_audit_run_pkey`: PRIMARY KEY (id)

### Check Constraints
- `agent_readiness_audit_run_model_set_canonical`: CHECK ((model_set = canonical_model_set(model_set)))
- `agent_readiness_audit_run_model_set_nonempty`: CHECK ((cardinality(model_set) >= 1))
- `agent_readiness_audit_run_prompt_count_floor`: CHECK ((prompt_count >= 5))
- `agent_readiness_audit_run_prompt_set_id_nonempty`: CHECK ((btrim(prompt_set_id) <> ''::text))
- `agent_readiness_audit_run_run_type_check`: CHECK ((run_type = ANY (ARRAY['before'::text, 'after'::text])))
- `agent_readiness_audit_run_samples_per_cell_floor`: CHECK ((samples_per_cell >= 5))
- `agent_readiness_audit_run_stage_tag_vocabulary`: CHECK ((stage_tag = ANY (ARRAY['standalone_pre_pipeline'::text, 'eva_stage0_nursery'::text, 'dogfood_internal'::text])))
- `agent_readiness_audit_run_temperature_range`: CHECK (((pinned_temperature >= (0)::numeric) AND (pinned_temperature <= (2)::numeric)))
- `agent_readiness_audit_run_venture_url_normalized`: CHECK (((venture_url = lower(btrim(venture_url))) AND (venture_url ~ '^https?://'::text) AND (venture_url !~~ '%/'::text)))

## Indexes

- `agent_readiness_audit_run_pair_lookup_idx`
  ```sql
  CREATE INDEX agent_readiness_audit_run_pair_lookup_idx ON public.agent_readiness_audit_run USING btree (venture_url, prompt_set_id, model_set, run_type, created_at DESC)
  ```
- `agent_readiness_audit_run_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_readiness_audit_run_pkey ON public.agent_readiness_audit_run USING btree (id)
  ```
- `agent_readiness_audit_run_stage_tag_idx`
  ```sql
  CREATE INDEX agent_readiness_audit_run_stage_tag_idx ON public.agent_readiness_audit_run USING btree (stage_tag, created_at DESC)
  ```

## RLS Policies

### 1. agent_readiness_audit_run_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### agent_readiness_audit_run_freeze_trg

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION agent_readiness_measurement_freeze()`

### agent_readiness_audit_run_freeze_trg

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION agent_readiness_measurement_freeze()`

---

[← Back to Schema Overview](../database-schema-overview.md)
