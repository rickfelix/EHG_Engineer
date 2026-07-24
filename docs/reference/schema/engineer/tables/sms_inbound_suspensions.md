# sms_inbound_suspensions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (4 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| from_phone | `text` | **NO** | - | - |
| suspended_at | `timestamp with time zone` | **NO** | `now()` | - |
| reason | `text` | **NO** | - | - |
| cleared_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `sms_inbound_suspensions_pkey`: PRIMARY KEY (from_phone)

## Indexes

- `sms_inbound_suspensions_pkey`
  ```sql
  CREATE UNIQUE INDEX sms_inbound_suspensions_pkey ON public.sms_inbound_suspensions USING btree (from_phone)
  ```

## RLS Policies

### 1. sms_inbound_suspensions_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
