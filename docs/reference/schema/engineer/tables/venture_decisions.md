# venture_decisions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-30T10:05:06.556Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| stage | `integer(32)` | **NO** | - | - |
| gate_type | `text` | YES | - | - |
| recommendation | `text` | YES | - | - |
| decision | `text` | YES | - | - |
| notes | `text` | YES | - | - |
| decided_at | `timestamp with time zone` | YES | - | - |
| decided_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_decisions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_decisions_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `venture_decisions_gate_type_check`: CHECK ((gate_type = ANY (ARRAY['hard_gate'::text, 'advisory_checkpoint'::text, 'soft_gate'::text])))

## Indexes

- `idx_venture_decisions_created`
  ```sql
  CREATE INDEX idx_venture_decisions_created ON public.venture_decisions USING btree (created_at DESC)
  ```
- `idx_venture_decisions_stage`
  ```sql
  CREATE INDEX idx_venture_decisions_stage ON public.venture_decisions USING btree (stage)
  ```
- `idx_venture_decisions_venture`
  ```sql
  CREATE INDEX idx_venture_decisions_venture ON public.venture_decisions USING btree (venture_id)
  ```
- `venture_decisions_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_decisions_pkey ON public.venture_decisions USING btree (id)
  ```

## RLS Policies

### 1. Allow delete for authenticated (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. venture_decisions_insert_policy (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. venture_decisions_select_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. venture_decisions_update_policy (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
