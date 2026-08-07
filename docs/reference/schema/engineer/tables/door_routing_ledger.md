# door_routing_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-01T20:27:50.592Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| work_key | `text` | **NO** | - | - |
| door | `text` | **NO** | - | - |
| delegate_model | `text` | YES | - | - |
| tier_rank | `integer(32)` | YES | - | - |
| tokens_input | `bigint(64)` | YES | - | - |
| tokens_output | `bigint(64)` | YES | - | - |
| cost_usd | `numeric(12,6)` | YES | - | - |
| model_id | `text` | YES | - | - |
| coverage_note | `text` | YES | - | - |
| routed_at | `timestamp with time zone` | **NO** | `now()` | - |
| r_criterion | `text` | YES | - | - |
| funnel_position | `text` | YES | - | - |

## Constraints

### Primary Key
- `door_routing_ledger_pkey`: PRIMARY KEY (id)

### Check Constraints
- `door_routing_ledger_door_check`: CHECK ((door = ANY (ARRAY['one_way'::text, 'two_way'::text])))

## Indexes

- `door_routing_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX door_routing_ledger_pkey ON public.door_routing_ledger USING btree (id)
  ```
- `idx_door_routing_ledger_routed_at`
  ```sql
  CREATE INDEX idx_door_routing_ledger_routed_at ON public.door_routing_ledger USING btree (routed_at)
  ```
- `idx_door_routing_ledger_work_key`
  ```sql
  CREATE INDEX idx_door_routing_ledger_work_key ON public.door_routing_ledger USING btree (work_key)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
