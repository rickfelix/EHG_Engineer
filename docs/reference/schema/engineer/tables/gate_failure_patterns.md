# gate_failure_patterns Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-13T12:55:49.260Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| gate | `character varying(10)` | **NO** | - | - |
| failure_signature | `text` | **NO** | - | - |
| occurrence_count | `integer(32)` | YES | `1` | - |
| first_seen_at | `timestamp with time zone` | YES | `now()` | - |
| last_seen_at | `timestamp with time zone` | YES | `now()` | - |
| related_pattern_id | `uuid` | YES | - | - |
| remediation_sd_id | `character varying(50)` | YES | - | - |
| remediation_status | `character varying(20)` | YES | `'pending'::character varying` | - |
| evidence | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `gate_failure_patterns_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `gate_failure_patterns_related_pattern_id_fkey`: related_pattern_id → issue_patterns(id)

### Unique Constraints
- `uq_gate_failure_signature`: UNIQUE (gate, failure_signature)

## Indexes

- `gate_failure_patterns_pkey`
  ```sql
  CREATE UNIQUE INDEX gate_failure_patterns_pkey ON public.gate_failure_patterns USING btree (id)
  ```
- `idx_gate_failure_patterns_gate`
  ```sql
  CREATE INDEX idx_gate_failure_patterns_gate ON public.gate_failure_patterns USING btree (gate)
  ```
- `idx_gate_failure_patterns_occurrence`
  ```sql
  CREATE INDEX idx_gate_failure_patterns_occurrence ON public.gate_failure_patterns USING btree (occurrence_count DESC)
  ```
- `idx_gate_failure_patterns_status`
  ```sql
  CREATE INDEX idx_gate_failure_patterns_status ON public.gate_failure_patterns USING btree (remediation_status)
  ```
- `uq_gate_failure_signature`
  ```sql
  CREATE UNIQUE INDEX uq_gate_failure_signature ON public.gate_failure_patterns USING btree (gate, failure_signature)
  ```

## Triggers

### trigger_update_gate_failure_patterns_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_gate_failure_patterns_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
