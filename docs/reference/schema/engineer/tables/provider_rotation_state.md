# provider_rotation_state Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-17T00:14:05.959Z
**Rows**: 1
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (4 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `1` | - |
| rotation_index | `integer(32)` | **NO** | `0` | - |
| last_rotation | `jsonb` | **NO** | `'{}'::jsonb` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `provider_rotation_state_pkey`: PRIMARY KEY (id)

### Check Constraints
- `provider_rotation_state_id_check`: CHECK ((id = 1))

## Indexes

- `provider_rotation_state_pkey`
  ```sql
  CREATE UNIQUE INDEX provider_rotation_state_pkey ON public.provider_rotation_state USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
