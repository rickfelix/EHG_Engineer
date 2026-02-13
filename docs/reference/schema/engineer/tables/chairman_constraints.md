# chairman_constraints Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T10:51:37.586Z
**Rows**: 10
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| constraint_key | `text` | **NO** | - | - |
| name | `text` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| filter_type | `text` | **NO** | - | - |
| filter_logic | `jsonb` | **NO** | - | - |
| weight | `numeric(3,2)` | YES | `1.0` | - |
| priority_order | `integer(32)` | YES | `100` | - |
| version | `integer(32)` | YES | `1` | - |
| is_active | `boolean` | YES | `true` | - |
| source | `text` | YES | - | - |
| source_ref | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `chairman_constraints_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `chairman_constraints_constraint_key_key`: UNIQUE (constraint_key)

### Check Constraints
- `chairman_constraints_filter_type_check`: CHECK ((filter_type = ANY (ARRAY['hard_reject'::text, 'score_modifier'::text, 'score_bonus'::text, 'advisory'::text])))
- `chairman_constraints_source_check`: CHECK ((source = ANY (ARRAY['todoist'::text, 'brainstorm'::text, 'kill_gate'::text, 'retrospective'::text, 'manual'::text])))

## Indexes

- `chairman_constraints_constraint_key_key`
  ```sql
  CREATE UNIQUE INDEX chairman_constraints_constraint_key_key ON public.chairman_constraints USING btree (constraint_key)
  ```
- `chairman_constraints_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_constraints_pkey ON public.chairman_constraints USING btree (id)
  ```
- `idx_chairman_constraints_active`
  ```sql
  CREATE INDEX idx_chairman_constraints_active ON public.chairman_constraints USING btree (is_active, priority_order) WHERE (is_active = true)
  ```

## RLS Policies

### 1. chairman_constraints_service_all (ALL)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
