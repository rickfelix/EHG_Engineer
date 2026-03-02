# leo_protocol_state Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-02T01:18:17.458Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (3 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| key | `character varying(100)` | **NO** | - | - |
| value | `jsonb` | **NO** | `'{}'::jsonb` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `leo_protocol_state_pkey`: PRIMARY KEY (key)

## Indexes

- `leo_protocol_state_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_protocol_state_pkey ON public.leo_protocol_state USING btree (key)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
