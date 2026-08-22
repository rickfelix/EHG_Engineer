# chairman_constraints_proposals Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| constraint_key | `text` | **NO** | - | - |
| name | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| filter_type | `text` | YES | - | - |
| filter_logic | `jsonb` | YES | - | - |
| weight | `numeric(3,2)` | YES | - | - |
| priority_order | `integer(32)` | YES | - | - |
| proposed_source | `text` | **NO** | - | - |
| source_ref | `text` | YES | - | - |
| rationale | `text` | YES | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| proposed_by | `text` | YES | - | - |
| proposed_at | `timestamp with time zone` | **NO** | `now()` | - |
| ratified_by | `uuid` | YES | - | - |
| ratified_at | `timestamp with time zone` | YES | - | - |
| ratified_constraint_id | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `chairman_constraints_proposals_pkey`: PRIMARY KEY (id)

### Check Constraints
- `chairman_constraints_proposals_filter_type_check`: CHECK (((filter_type IS NULL) OR (filter_type = ANY (ARRAY['hard_reject'::text, 'score_modifier'::text, 'score_bonus'::text, 'advisory'::text]))))
- `chairman_constraints_proposals_proposed_source_check`: CHECK ((proposed_source = ANY (ARRAY['kill_gate'::text, 'retrospective'::text, 'manual'::text])))
- `chairman_constraints_proposals_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'ratified'::text, 'rejected'::text])))

## Indexes

- `chairman_constraints_proposals_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_constraints_proposals_pkey ON public.chairman_constraints_proposals USING btree (id)
  ```
- `idx_ccp_constraint_key`
  ```sql
  CREATE INDEX idx_ccp_constraint_key ON public.chairman_constraints_proposals USING btree (constraint_key)
  ```
- `idx_ccp_status`
  ```sql
  CREATE INDEX idx_ccp_status ON public.chairman_constraints_proposals USING btree (status)
  ```

## RLS Policies

### 1. ccp_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`

### 2. ccp_update_chairman (UPDATE)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`
- **With Check**: `fn_is_chairman()`

---

[← Back to Schema Overview](../database-schema-overview.md)
