# taste_interaction_logs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-26T21:16:02.093Z
**Rows**: 2
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| gate_type | `text` | **NO** | - | - |
| stage_number | `integer(32)` | **NO** | - | - |
| decision | `text` | **NO** | - | - |
| dimension_scores | `jsonb` | YES | - | - |
| context_tags | `ARRAY` | YES | `'{}'::text[]` | - |
| source | `text` | **NO** | `'system'::text` | - |
| chairman_notes | `text` | YES | - | - |
| confidence_at_decision | `numeric(4,3)` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `taste_interaction_logs_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `taste_interaction_logs_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `taste_interaction_logs_decision_check`: CHECK ((decision = ANY (ARRAY['approve'::text, 'conditional'::text, 'escalate'::text])))
- `taste_interaction_logs_gate_type_check`: CHECK ((gate_type = ANY (ARRAY['design'::text, 'scope'::text, 'architecture'::text])))
- `taste_interaction_logs_source_check`: CHECK ((source = ANY (ARRAY['active'::text, 'timeout'::text, 'system'::text])))

## Indexes

- `idx_taste_logs_confidence`
  ```sql
  CREATE INDEX idx_taste_logs_confidence ON public.taste_interaction_logs USING btree (gate_type, source, created_at DESC)
  ```
- `idx_taste_logs_venture_gate`
  ```sql
  CREATE INDEX idx_taste_logs_venture_gate ON public.taste_interaction_logs USING btree (venture_id, gate_type, created_at DESC)
  ```
- `taste_interaction_logs_pkey`
  ```sql
  CREATE UNIQUE INDEX taste_interaction_logs_pkey ON public.taste_interaction_logs USING btree (id)
  ```

## RLS Policies

### 1. taste_logs_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
