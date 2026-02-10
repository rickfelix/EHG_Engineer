# venture_stage_transitions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T05:19:24.137Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| from_stage | `integer(32)` | **NO** | - | - |
| to_stage | `integer(32)` | **NO** | - | - |
| transition_type | `text` | YES | `'normal'::text` | - |
| approved_by | `text` | YES | - | - |
| approved_at | `timestamp with time zone` | YES | `now()` | - |
| handoff_data | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| idempotency_key | `uuid` | YES | - | UUID for idempotent stage transitions. Duplicate calls with same key are no-op. |

## Constraints

### Primary Key
- `venture_stage_transitions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_stage_transitions_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `venture_stage_transitions_transition_type_check`: CHECK ((transition_type = ANY (ARRAY['normal'::text, 'skip'::text, 'rollback'::text, 'pivot'::text])))

## Indexes

- `idx_venture_stage_transitions_idempotency`
  ```sql
  CREATE UNIQUE INDEX idx_venture_stage_transitions_idempotency ON public.venture_stage_transitions USING btree (venture_id, idempotency_key) WHERE (idempotency_key IS NOT NULL)
  ```
- `idx_venture_stage_transitions_venture`
  ```sql
  CREATE INDEX idx_venture_stage_transitions_venture ON public.venture_stage_transitions USING btree (venture_id)
  ```
- `venture_stage_transitions_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_stage_transitions_pkey ON public.venture_stage_transitions USING btree (id)
  ```

## RLS Policies

### 1. venture_stage_transitions_service_role_access (ALL)

- **Roles**: {service_role}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
