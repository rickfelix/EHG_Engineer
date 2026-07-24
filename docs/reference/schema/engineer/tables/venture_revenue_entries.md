# venture_revenue_entries Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| entry_type | `text` | **NO** | - | - |
| amount | `numeric(14,2)` | YES | - | - |
| count | `integer(32)` | YES | - | - |
| currency | `text` | **NO** | `'USD'::text` | - |
| note | `text` | YES | - | - |
| recorded_at | `timestamp with time zone` | **NO** | `now()` | - |
| recorded_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_revenue_entries_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_revenue_entries_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `venture_revenue_entries_entry_type_check`: CHECK ((entry_type = ANY (ARRAY['first_dollar'::text, 'mrr'::text, 'signup_count'::text])))
- `venture_revenue_entries_value_present`: CHECK (((amount IS NOT NULL) OR (count IS NOT NULL)))

## Indexes

- `idx_venture_revenue_entries_venture_recorded`
  ```sql
  CREATE INDEX idx_venture_revenue_entries_venture_recorded ON public.venture_revenue_entries USING btree (venture_id, recorded_at DESC)
  ```
- `venture_revenue_entries_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_revenue_entries_pkey ON public.venture_revenue_entries USING btree (id)
  ```

## RLS Policies

### 1. venture_revenue_entries_insert_chairman (INSERT)

- **Roles**: {authenticated}
- **With Check**: `fn_is_chairman()`

### 2. venture_revenue_entries_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
