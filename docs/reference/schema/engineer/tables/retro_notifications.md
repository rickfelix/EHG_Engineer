# retro_notifications Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-12-30T21:56:22.248Z
**Rows**: 543
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | - |
| notification_type | `text` | **NO** | `'sd_completion'::text` | - |
| payload | `jsonb` | YES | `'{}'::jsonb` | - |
| status | `text` | YES | `'pending'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| processed_at | `timestamp with time zone` | YES | - | - |
| error_message | `text` | YES | - | - |

## Constraints

### Primary Key
- `retro_notifications_pkey`: PRIMARY KEY (id)

### Check Constraints
- `retro_notifications_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))

## Indexes

- `idx_retro_notifications_status`
  ```sql
  CREATE INDEX idx_retro_notifications_status ON public.retro_notifications USING btree (status, created_at)
  ```
- `retro_notifications_pkey`
  ```sql
  CREATE UNIQUE INDEX retro_notifications_pkey ON public.retro_notifications USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_retro_notifications (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_retro_notifications (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
