# sd_claims Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T14:38:37.646Z
**Rows**: 2,541
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | - |
| session_id | `text` | **NO** | - | - |
| track | `text` | **NO** | - | - |
| claimed_at | `timestamp with time zone` | YES | `now()` | - |
| released_at | `timestamp with time zone` | YES | - | - |
| release_reason | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_claims_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_claims_session_id_fkey`: session_id → claude_sessions(session_id)

### Unique Constraints
- **None** - The previous `sd_claims_sd_session_unique` constraint (UNIQUE on sd_id, session_id) was removed in migration `20260213_fix_sd_claims_lifecycle_aware_unique.sql` to allow multiple claims per sd_id + session_id pair over time.
- **Lifecycle-aware uniqueness** is now enforced via the `sd_claims_active_unique` partial unique index (see Indexes section below).

### Check Constraints
- `sd_claims_release_reason_check`: CHECK ((release_reason = ANY (ARRAY['completed'::text, 'timeout'::text, 'manual'::text, 'conflict'::text, 'session_ended'::text, 'AUTO_REPLACED'::text, 'STALE_CLEANUP'::text])))

## Indexes

- `idx_sd_claims_sd`
  ```sql
  CREATE INDEX idx_sd_claims_sd ON public.sd_claims USING btree (sd_id)
  ```
- `idx_sd_claims_session`
  ```sql
  CREATE INDEX idx_sd_claims_session ON public.sd_claims USING btree (session_id)
  ```
- `sd_claims_active_unique` **(Partial Unique Index - Lifecycle-Aware)**
  ```sql
  CREATE UNIQUE INDEX sd_claims_active_unique ON public.sd_claims USING btree (sd_id) WHERE (released_at IS NULL)
  ```
  **Purpose**: Enforces that only ONE unreleased (active) claim can exist per SD at any time. This is lifecycle-aware because it only applies to claims where `released_at IS NULL`. Once a claim is released, the constraint no longer applies, allowing the same sd_id to be claimed again in the future.

  **Replaces**: The old `idx_sd_claims_active` non-unique index, and complements the removed `sd_claims_sd_session_unique` constraint by providing database-level enforcement of single active claim per SD.
- `sd_claims_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_claims_pkey ON public.sd_claims USING btree (id)
  ```

## RLS Policies

### 1. Allow all for anon (ALL)

- **Roles**: {anon}
- **Using**: `true`
- **With Check**: `true`

### 2. authenticated_insert_sd_claims (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. authenticated_select_sd_claims (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. authenticated_update_sd_claims (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 5. service_role_all_sd_claims (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Schema Change History

### 2026-02-13: Lifecycle-Aware Unique Constraint (QF-20260213-620)

**Migration**: `database/migrations/20260213_fix_sd_claims_lifecycle_aware_unique.sql`

**Changes**:
- **Dropped**: `sd_claims_sd_session_unique` (UNIQUE constraint on sd_id, session_id)
  - **Reason**: Prevented the same session from claiming the same SD again after releasing it, causing unnecessary conflicts in iterative development workflows
- **Dropped**: `idx_sd_claims_active` (non-unique partial index on sd_id WHERE released_at IS NULL)
  - **Reason**: Replaced by unique partial index below for database-level enforcement
- **Created**: `sd_claims_active_unique` (UNIQUE partial index on sd_id WHERE released_at IS NULL)
  - **Purpose**: Ensures only ONE active claim per SD at database level, while allowing claim history (multiple released claims for same SD over time)
- **Cleaned**: 71 orphaned unreleased claims from stale sessions

**Impact**:
- Sessions can now reclaim SDs they previously worked on (common in iterative development and multi-phase work)
- Database-level enforcement of single active claim per SD prevents race conditions (integrity protection)
- Claim history is preserved for auditing and retrospectives (all released claims remain in table)

**Related Documentation**:
- **Operations Guide**: `docs/06_deployment/multi-session-coordination-ops.md`
- **Heartbeat Manager**: `docs/reference/heartbeat-manager.md`

---

[← Back to Schema Overview](../database-schema-overview.md)
