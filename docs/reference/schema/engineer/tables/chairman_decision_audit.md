# chairman_decision_audit Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-16T01:07:03.421Z
**Rows**: 2
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| decision_id | `uuid` | **NO** | - | - |
| venture_id | `uuid` | **NO** | - | - |
| lifecycle_stage | `integer(32)` | **NO** | - | - |
| effect_type | `text` | **NO** | - | - |
| applied_at | `timestamp with time zone` | **NO** | `now()` | - |
| applied_by | `text` | **NO** | `'trigger'::text` | - |

## Constraints

### Primary Key
- `chairman_decision_audit_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `chairman_decision_audit_decision_id_fkey`: decision_id → chairman_decisions(id)

### Unique Constraints
- `uq_decision_effect`: UNIQUE (decision_id, effect_type)

### Check Constraints
- `chairman_decision_audit_effect_type_check`: CHECK ((effect_type = ANY (ARRAY['vision_unarchive'::text, 'artifact_dedup_skip'::text])))

## Indexes

- `chairman_decision_audit_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_decision_audit_pkey ON public.chairman_decision_audit USING btree (id)
  ```
- `idx_chairman_audit_venture_stage`
  ```sql
  CREATE INDEX idx_chairman_audit_venture_stage ON public.chairman_decision_audit USING btree (venture_id, lifecycle_stage)
  ```
- `uq_decision_effect`
  ```sql
  CREATE UNIQUE INDEX uq_decision_effect ON public.chairman_decision_audit USING btree (decision_id, effect_type)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
