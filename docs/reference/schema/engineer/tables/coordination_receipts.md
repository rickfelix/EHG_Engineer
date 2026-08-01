# coordination_receipts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-01T20:27:50.592Z
**Rows**: 347
**RLS**: Enabled (0 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| coordination_id | `uuid` | **NO** | - | Source session_coordination row. Intentionally NOT a foreign key — the source is deleted by retention at 24h and the receipt must outlive it. |
| lane | `text` | **NO** | - | - |
| state | `text` | **NO** | - | delivered | seen | disposed — three independently queryable states. Delivery is not disposition. |
| disposition | `text` | YES | - | - |
| actor_session | `text` | YES | - | Which session acted, so the metric can be shown to span multiple coordinator sessions rather than one busy seat. |
| actor_role | `text` | YES | - | - |
| is_retention | `boolean` | **NO** | `false` | TRUE when written by retention/flood-control rather than an answering agent; such receipts are excluded from the answered-rate. Mirrors payload.auto_acked (FR-7). |
| source_age_ms | `bigint(64)` | YES | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `coordination_receipts_pkey`: PRIMARY KEY (id)

## Indexes

- `coordination_receipts_pkey`
  ```sql
  CREATE UNIQUE INDEX coordination_receipts_pkey ON public.coordination_receipts USING btree (id)
  ```
- `idx_coordination_receipts_coordination_id`
  ```sql
  CREATE INDEX idx_coordination_receipts_coordination_id ON public.coordination_receipts USING btree (coordination_id)
  ```
- `idx_coordination_receipts_created_at`
  ```sql
  CREATE INDEX idx_coordination_receipts_created_at ON public.coordination_receipts USING btree (created_at DESC)
  ```
- `idx_coordination_receipts_lane_state`
  ```sql
  CREATE INDEX idx_coordination_receipts_lane_state ON public.coordination_receipts USING btree (lane, state)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
