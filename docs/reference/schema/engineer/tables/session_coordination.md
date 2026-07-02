# session_coordination Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-02T13:10:02.412Z
**Rows**: 11,151
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| target_session | `text` | YES | - | - |
| target_sd | `text` | YES | - | - |
| message_type | `USER-DEFINED` | **NO** | `'INFO'::coordination_message_type` | - |
| subject | `text` | **NO** | - | - |
| body | `text` | YES | - | - |
| payload | `jsonb` | YES | `'{}'::jsonb` | - |
| sender_session | `text` | YES | - | - |
| sender_type | `text` | YES | `'orchestrator'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| expires_at | `timestamp with time zone` | YES | `(now() + '01:00:00'::interval)` | - |
| read_at | `timestamp with time zone` | YES | - | - |
| acknowledged_at | `timestamp with time zone` | YES | - | - |
| correlation_id | `text` | YES | - | Optional message id this row replies to / correlates with. Nullable -- no backfill for historical rows. SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-D |

## Constraints

### Primary Key
- `session_coordination_pkey`: PRIMARY KEY (id)

### Check Constraints
- `valid_target`: CHECK (((target_session IS NOT NULL) OR (target_sd IS NOT NULL)))

## Indexes

- `idx_coord_expires`
  ```sql
  CREATE INDEX idx_coord_expires ON public.session_coordination USING btree (expires_at) WHERE (expires_at IS NOT NULL)
  ```
- `idx_coord_target_sd`
  ```sql
  CREATE INDEX idx_coord_target_sd ON public.session_coordination USING btree (target_sd) WHERE (acknowledged_at IS NULL)
  ```
- `idx_coord_target_session`
  ```sql
  CREATE INDEX idx_coord_target_session ON public.session_coordination USING btree (target_session) WHERE (acknowledged_at IS NULL)
  ```
- `idx_coord_unread`
  ```sql
  CREATE INDEX idx_coord_unread ON public.session_coordination USING btree (created_at DESC) WHERE (read_at IS NULL)
  ```
- `session_coordination_pkey`
  ```sql
  CREATE UNIQUE INDEX session_coordination_pkey ON public.session_coordination USING btree (id)
  ```

## RLS Policies

### 1. service_role_full_access (SELECT)

- **Roles**: {public}
- **Using**: `true`

## Triggers

### trg_session_coordination_insert_lint

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION session_coordination_insert_lint()`

---

[← Back to Schema Overview](../database-schema-overview.md)
