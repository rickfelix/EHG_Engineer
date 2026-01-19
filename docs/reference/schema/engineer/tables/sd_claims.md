# sd_claims Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-19T03:32:49.878Z
**Rows**: 1,491
**RLS**: Enabled (2 policies)

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

### Check Constraints
- `sd_claims_release_reason_check`: CHECK ((release_reason = ANY (ARRAY['completed'::text, 'timeout'::text, 'manual'::text, 'conflict'::text, 'session_ended'::text])))

## Indexes

- `idx_sd_claims_active`
  ```sql
  CREATE INDEX idx_sd_claims_active ON public.sd_claims USING btree (sd_id) WHERE (released_at IS NULL)
  ```
- `idx_sd_claims_sd`
  ```sql
  CREATE INDEX idx_sd_claims_sd ON public.sd_claims USING btree (sd_id)
  ```
- `idx_sd_claims_session`
  ```sql
  CREATE INDEX idx_sd_claims_session ON public.sd_claims USING btree (session_id)
  ```
- `sd_claims_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_claims_pkey ON public.sd_claims USING btree (id)
  ```

## RLS Policies

### 1. Allow all for anon (ALL)

- **Roles**: {anon}
- **Using**: `true`
- **With Check**: `true`

### 2. Allow all for authenticated (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
