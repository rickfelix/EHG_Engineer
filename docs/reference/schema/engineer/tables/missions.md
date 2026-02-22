# missions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T14:34:13.063Z
**Rows**: 1
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| mission_text | `text` | **NO** | - | - |
| version | `integer(32)` | **NO** | `1` | - |
| status | `text` | **NO** | `'draft'::text` | - |
| proposed_by | `text` | YES | - | - |
| approved_by | `text` | YES | - | - |
| reasoning | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `missions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `missions_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `missions_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])))

## Indexes

- `idx_missions_active_per_venture`
  ```sql
  CREATE UNIQUE INDEX idx_missions_active_per_venture ON public.missions USING btree (venture_id) WHERE (status = 'active'::text)
  ```
- `missions_pkey`
  ```sql
  CREATE UNIQUE INDEX missions_pkey ON public.missions USING btree (id)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### set_missions_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
