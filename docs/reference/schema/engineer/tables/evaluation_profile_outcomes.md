# evaluation_profile_outcomes Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T02:06:16.124Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| profile_id | `uuid` | YES | - | - |
| profile_version | `integer(32)` | YES | - | - |
| venture_id | `uuid` | **NO** | - | - |
| gate_boundary | `text` | **NO** | - | Stage boundary key (e.g. "5->6", "stage_3", "graduation") |
| signal_type | `text` | **NO** | - | Gate outcome signal: pass, fail, review, or skip |
| outcome | `jsonb` | **NO** | `'{}'::jsonb` | Detailed outcome data including scores, reasons, and metadata |
| evaluated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `evaluation_profile_outcomes_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `evaluation_profile_outcomes_profile_id_fkey`: profile_id → evaluation_profiles(id)

### Check Constraints
- `evaluation_profile_outcomes_signal_type_check`: CHECK ((signal_type = ANY (ARRAY['pass'::text, 'fail'::text, 'review'::text, 'skip'::text])))

## Indexes

- `evaluation_profile_outcomes_pkey`
  ```sql
  CREATE UNIQUE INDEX evaluation_profile_outcomes_pkey ON public.evaluation_profile_outcomes USING btree (id)
  ```
- `idx_epo_boundary`
  ```sql
  CREATE INDEX idx_epo_boundary ON public.evaluation_profile_outcomes USING btree (gate_boundary)
  ```
- `idx_epo_profile_boundary`
  ```sql
  CREATE INDEX idx_epo_profile_boundary ON public.evaluation_profile_outcomes USING btree (profile_id, gate_boundary)
  ```
- `idx_epo_profile_id`
  ```sql
  CREATE INDEX idx_epo_profile_id ON public.evaluation_profile_outcomes USING btree (profile_id)
  ```
- `idx_epo_venture_id`
  ```sql
  CREATE INDEX idx_epo_venture_id ON public.evaluation_profile_outcomes USING btree (venture_id)
  ```

## RLS Policies

### 1. epo_read_all (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. epo_write_service (ALL)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
