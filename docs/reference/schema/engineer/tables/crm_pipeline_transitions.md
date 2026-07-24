# crm_pipeline_transitions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 1,704
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| case_id | `uuid` | **NO** | - | - |
| from_stage | `text` | **NO** | - | - |
| to_stage | `text` | **NO** | - | - |
| provenance_event_id | `uuid` | **NO** | - | - |
| idempotency_key | `uuid` | YES | - | - |
| transitioned_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `crm_pipeline_transitions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `crm_pipeline_transitions_case_id_fkey`: case_id → crm_pipeline_cases(id)
- `crm_pipeline_transitions_provenance_event_id_fkey`: provenance_event_id → crm_inbound_events(id)

## Indexes

- `crm_pipeline_transitions_pkey`
  ```sql
  CREATE UNIQUE INDEX crm_pipeline_transitions_pkey ON public.crm_pipeline_transitions USING btree (id)
  ```
- `idx_crm_pipeline_transitions_case_id`
  ```sql
  CREATE INDEX idx_crm_pipeline_transitions_case_id ON public.crm_pipeline_transitions USING btree (case_id)
  ```
- `uq_crm_pipeline_transitions_idempotency`
  ```sql
  CREATE UNIQUE INDEX uq_crm_pipeline_transitions_idempotency ON public.crm_pipeline_transitions USING btree (case_id, idempotency_key) WHERE (idempotency_key IS NOT NULL)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_crm_enforce_pipeline_stage_edge

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION crm_enforce_pipeline_stage_edge()`

---

[← Back to Schema Overview](../database-schema-overview.md)
