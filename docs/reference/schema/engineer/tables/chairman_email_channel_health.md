# chairman_email_channel_health Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 1
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `text` | **NO** | `'singleton'::text` | - |
| last_success_at | `timestamp with time zone` | YES | - | - |
| consecutive_failures | `integer(32)` | **NO** | `0` | - |
| last_error_class | `text` | YES | - | - |
| last_canary_verified_at | `timestamp with time zone` | YES | - | - |
| alarm_state | `text` | **NO** | `'clear'::text` | - |
| alarm_raised_at | `timestamp with time zone` | YES | - | - |
| alarm_cleared_at | `timestamp with time zone` | YES | - | - |
| last_alarm_notify_error | `text` | YES | - | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `chairman_email_channel_health_pkey`: PRIMARY KEY (id)

### Check Constraints
- `chairman_email_channel_health_alarm_state_check`: CHECK ((alarm_state = ANY (ARRAY['clear'::text, 'raised'::text, 'cooldown'::text])))
- `chairman_email_channel_health_id_check`: CHECK ((id = 'singleton'::text))

## Indexes

- `chairman_email_channel_health_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_email_channel_health_pkey ON public.chairman_email_channel_health USING btree (id)
  ```

## RLS Policies

### 1. service_role_full_access (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
