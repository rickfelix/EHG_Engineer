# sourcing_chairman_queue Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| source_id | `text` | YES | - | - |
| title | `text` | YES | - | - |
| lane | `text` | **NO** | - | - |
| gate_type | `text` | **NO** | - | - |
| escalation_type | `text` | YES | - | - |
| context | `jsonb` | **NO** | `'{}'::jsonb` | - |
| sla_hours | `integer(32)` | YES | - | - |
| sla_due_at | `timestamp with time zone` | YES | - | - |
| state | `text` | **NO** | `'pending'::text` | - |
| deferred_until | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| decided_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `sourcing_chairman_queue_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `sourcing_chairman_queue_source_id_gate_type_key`: UNIQUE (source_id, gate_type)

### Check Constraints
- `sourcing_chairman_queue_state_check`: CHECK ((state = ANY (ARRAY['pending'::text, 'decided'::text, 'deferred_until'::text, 'escalated'::text])))

## Indexes

- `idx_sourcing_chairman_queue_sla`
  ```sql
  CREATE INDEX idx_sourcing_chairman_queue_sla ON public.sourcing_chairman_queue USING btree (sla_due_at) WHERE (state = 'pending'::text)
  ```
- `idx_sourcing_chairman_queue_state`
  ```sql
  CREATE INDEX idx_sourcing_chairman_queue_state ON public.sourcing_chairman_queue USING btree (state)
  ```
- `sourcing_chairman_queue_pkey`
  ```sql
  CREATE UNIQUE INDEX sourcing_chairman_queue_pkey ON public.sourcing_chairman_queue USING btree (id)
  ```
- `sourcing_chairman_queue_source_id_gate_type_key`
  ```sql
  CREATE UNIQUE INDEX sourcing_chairman_queue_source_id_gate_type_key ON public.sourcing_chairman_queue USING btree (source_id, gate_type)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
