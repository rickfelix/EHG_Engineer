# stage_proving_journal Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-06T10:29:00.448Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| stage_number | `integer(32)` | **NO** | - | - |
| gate_stage | `integer(32)` | YES | - | - |
| planned | `jsonb` | YES | `'{}'::jsonb` | - |
| actual | `jsonb` | YES | `'{}'::jsonb` | - |
| gaps | `jsonb` | YES | `'[]'::jsonb` | - |
| enhancements | `jsonb` | YES | `'[]'::jsonb` | - |
| chairman_decision | `text` | YES | - | - |
| journal_notes | `text` | YES | - | - |
| assessment_duration_ms | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `stage_proving_journal_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `stage_proving_journal_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `stage_proving_journal_venture_id_stage_number_key`: UNIQUE (venture_id, stage_number)

### Check Constraints
- `stage_proving_journal_chairman_decision_check`: CHECK ((chairman_decision = ANY (ARRAY['proceed'::text, 'fix_first'::text, 'skip'::text, 'defer'::text, 'kill'::text])))
- `stage_proving_journal_stage_number_check`: CHECK (((stage_number >= 1) AND (stage_number <= 26)))

## Indexes

- `idx_stage_proving_journal_venture`
  ```sql
  CREATE INDEX idx_stage_proving_journal_venture ON public.stage_proving_journal USING btree (venture_id)
  ```
- `stage_proving_journal_pkey`
  ```sql
  CREATE UNIQUE INDEX stage_proving_journal_pkey ON public.stage_proving_journal USING btree (id)
  ```
- `stage_proving_journal_venture_id_stage_number_key`
  ```sql
  CREATE UNIQUE INDEX stage_proving_journal_venture_id_stage_number_key ON public.stage_proving_journal USING btree (venture_id, stage_number)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
