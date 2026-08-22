# coordinator_follow_ons Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_by_session | `text` | **NO** | - | - |
| kind | `text` | YES | - | - |
| subject | `text` | **NO** | - | - |
| body | `text` | YES | - | - |
| due_hint | `text` | YES | - | - |
| status | `text` | **NO** | `'open'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| closed_at | `timestamp with time zone` | YES | - | - |
| closed_by_session | `text` | YES | - | - |

## Constraints

### Primary Key
- `coordinator_follow_ons_pkey`: PRIMARY KEY (id)

### Check Constraints
- `coordinator_follow_ons_status_check`: CHECK ((status = ANY (ARRAY['open'::text, 'done'::text, 'cancelled'::text])))

## Indexes

- `coordinator_follow_ons_pkey`
  ```sql
  CREATE UNIQUE INDEX coordinator_follow_ons_pkey ON public.coordinator_follow_ons USING btree (id)
  ```
- `idx_coord_follow_ons_open`
  ```sql
  CREATE INDEX idx_coord_follow_ons_open ON public.coordinator_follow_ons USING btree (created_at) WHERE (status = 'open'::text)
  ```

## RLS Policies

### 1. coordinator_follow_ons_service_write (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
