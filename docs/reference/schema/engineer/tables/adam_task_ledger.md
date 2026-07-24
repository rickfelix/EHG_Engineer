# adam_task_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 1,612
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| parent_id | `uuid` | YES | - | Self-FK to the parent node (NULL for a root/parent-tier node). ON DELETE CASCADE removes the subtree. |
| tier | `text` | **NO** | - | parent = chairman-visible milestone/decision/blocker; child = Adam-operational subtask. |
| status | `text` | **NO** | `'open'::text` | - |
| title | `text` | **NO** | - | - |
| source_kind | `text` | **NO** | - | Rehydrate provenance: advisory_thread | sourced_sd | awaited_reply | manual. With source_ref forms the idempotent rehydrate key. |
| source_ref | `text` | **NO** | - | Stable natural key for the source (correlation_id / sd_key / …). UNIQUE with source_kind so rehydrateBoard is an upsert, not a duplicate. |
| blocker | `text` | YES | - | Materialized blocker/issue text; bubbleBlockers() surfaces a child blocker onto its parent for the chairman-curated view. |
| benefit | `text` | YES | - | - |
| risk | `text` | YES | - | - |
| token_cost | `numeric` | YES | - | Coarse per-parent token rollup (light; a simple sum — NOT per-subtask accounting). |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `adam_task_ledger_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `adam_task_ledger_parent_id_fkey`: parent_id → adam_task_ledger(id)

### Unique Constraints
- `adam_task_ledger_source_kind_source_ref_key`: UNIQUE (source_kind, source_ref)

### Check Constraints
- `adam_task_ledger_source_kind_check`: CHECK ((source_kind = ANY (ARRAY['advisory_thread'::text, 'sourced_sd'::text, 'awaited_reply'::text, 'manual'::text])))
- `adam_task_ledger_status_check`: CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'blocked'::text, 'done'::text, 'cancelled'::text])))
- `adam_task_ledger_tier_check`: CHECK ((tier = ANY (ARRAY['parent'::text, 'child'::text])))

## Indexes

- `adam_task_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX adam_task_ledger_pkey ON public.adam_task_ledger USING btree (id)
  ```
- `adam_task_ledger_source_kind_source_ref_key`
  ```sql
  CREATE UNIQUE INDEX adam_task_ledger_source_kind_source_ref_key ON public.adam_task_ledger USING btree (source_kind, source_ref)
  ```
- `idx_adam_task_ledger_parent`
  ```sql
  CREATE INDEX idx_adam_task_ledger_parent ON public.adam_task_ledger USING btree (parent_id)
  ```
- `idx_adam_task_ledger_source`
  ```sql
  CREATE INDEX idx_adam_task_ledger_source ON public.adam_task_ledger USING btree (source_kind, source_ref)
  ```
- `idx_adam_task_ledger_status`
  ```sql
  CREATE INDEX idx_adam_task_ledger_status ON public.adam_task_ledger USING btree (status)
  ```

## RLS Policies

### 1. adam_task_ledger_read (SELECT)

- **Roles**: {public}
- **Using**: `((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text))`

### 2. adam_task_ledger_service_write (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

## Triggers

### trg_adam_task_ledger_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trg_adam_task_ledger_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
