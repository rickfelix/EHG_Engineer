# file_claim_locks Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-28T01:59:01.161Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| file_path | `text` | **NO** | - | - |
| holder_session_id | `uuid` | **NO** | - | - |
| sd_id | `character varying(50)` | YES | - | - |
| branch | `text` | YES | - | - |
| claimed_at | `timestamp with time zone` | **NO** | `now()` | - |
| heartbeat_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `file_claim_locks_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `file_claim_locks_holder_fk`: holder_session_id → claude_sessions(id)

### Unique Constraints
- `file_claim_locks_path_unique`: UNIQUE (file_path)

## Indexes

- `file_claim_locks_path_unique`
  ```sql
  CREATE UNIQUE INDEX file_claim_locks_path_unique ON public.file_claim_locks USING btree (file_path)
  ```
- `file_claim_locks_pkey`
  ```sql
  CREATE UNIQUE INDEX file_claim_locks_pkey ON public.file_claim_locks USING btree (id)
  ```
- `idx_file_claim_locks_heartbeat`
  ```sql
  CREATE INDEX idx_file_claim_locks_heartbeat ON public.file_claim_locks USING btree (heartbeat_at)
  ```
- `idx_file_claim_locks_holder`
  ```sql
  CREATE INDEX idx_file_claim_locks_holder ON public.file_claim_locks USING btree (holder_session_id)
  ```
- `idx_file_claim_locks_sd`
  ```sql
  CREATE INDEX idx_file_claim_locks_sd ON public.file_claim_locks USING btree (sd_id)
  ```

## RLS Policies

### 1. service_role_all_file_claim_locks (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
