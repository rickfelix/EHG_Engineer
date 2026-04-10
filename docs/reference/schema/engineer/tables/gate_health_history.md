# gate_health_history Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-10T09:32:01.719Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| gate | `character varying(10)` | **NO** | - | - |
| week_start | `date` | **NO** | - | - |
| total_attempts | `integer(32)` | YES | - | - |
| passes | `integer(32)` | YES | - | - |
| failures | `integer(32)` | YES | - | - |
| pass_rate | `numeric(5,1)` | YES | - | - |
| avg_score | `numeric(5,1)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `gate_health_history_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `uq_gate_health_week`: UNIQUE (gate, week_start)

## Indexes

- `gate_health_history_pkey`
  ```sql
  CREATE UNIQUE INDEX gate_health_history_pkey ON public.gate_health_history USING btree (id)
  ```
- `idx_gate_health_history_gate_week`
  ```sql
  CREATE INDEX idx_gate_health_history_gate_week ON public.gate_health_history USING btree (gate, week_start DESC)
  ```
- `uq_gate_health_week`
  ```sql
  CREATE UNIQUE INDEX uq_gate_health_week ON public.gate_health_history USING btree (gate, week_start)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
