# browser_actuation_session_caps Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-15T16:18:27.599Z
**Rows**: 0
**RLS**: Enabled (0 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (4 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| session_id | `text` | **NO** | - | - |
| action_count | `integer(32)` | **NO** | `0` | - |
| cap_limit | `integer(32)` | **NO** | - | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `browser_actuation_session_caps_pkey`: PRIMARY KEY (session_id)

## Indexes

- `browser_actuation_session_caps_pkey`
  ```sql
  CREATE UNIQUE INDEX browser_actuation_session_caps_pkey ON public.browser_actuation_session_caps USING btree (session_id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
