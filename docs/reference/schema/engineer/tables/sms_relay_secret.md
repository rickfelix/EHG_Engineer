# sms_relay_secret Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 1
**RLS**: Enabled (0 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (3 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `1` | - |
| secret_value | `text` | **NO** | - | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `sms_relay_secret_pkey`: PRIMARY KEY (id)

### Check Constraints
- `sms_relay_secret_id_check`: CHECK ((id = 1))

## Indexes

- `sms_relay_secret_pkey`
  ```sql
  CREATE UNIQUE INDEX sms_relay_secret_pkey ON public.sms_relay_secret USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
