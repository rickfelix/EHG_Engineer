# stage_zero_requests Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-29T23:00:08.909Z
**Rows**: 4
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| requested_by | `uuid` | **NO** | - | The authenticated Supabase user who created this request. |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| blueprint_id | `uuid` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| prompt | `text` | YES | - | - |
| status | `USER-DEFINED` | **NO** | `'pending'::stage_zero_status` | - |
| claimed_by_session | `text` | YES | - | Identifier of the Claude Code CLI session that claimed this request (prevents double-processing). |
| claimed_at | `timestamp with time zone` | YES | - | - |
| started_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| result | `jsonb` | YES | - | Structured output once Stage 0 analysis completes. Schema is defined by the CLI processor. |
| error_message | `text` | YES | - | - |
| error_details | `jsonb` | YES | - | - |
| priority | `smallint(16)` | **NO** | `0` | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `stage_zero_requests_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `stage_zero_requests_blueprint_id_fkey`: blueprint_id → opportunity_blueprints(id)
- `stage_zero_requests_requested_by_fkey`: requested_by → users(id)
- `stage_zero_requests_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `must_reference_blueprint_venture_or_path`: CHECK (((blueprint_id IS NOT NULL) OR (venture_id IS NOT NULL) OR ((metadata ->> 'path'::text) IS NOT NULL)))

## Indexes

- `idx_stage_zero_requests_blueprint_id`
  ```sql
  CREATE INDEX idx_stage_zero_requests_blueprint_id ON public.stage_zero_requests USING btree (blueprint_id) WHERE (blueprint_id IS NOT NULL)
  ```
- `idx_stage_zero_requests_path`
  ```sql
  CREATE INDEX idx_stage_zero_requests_path ON public.stage_zero_requests USING btree (((metadata ->> 'path'::text))) WHERE ((metadata ->> 'path'::text) IS NOT NULL)
  ```
- `idx_stage_zero_requests_pending`
  ```sql
  CREATE INDEX idx_stage_zero_requests_pending ON public.stage_zero_requests USING btree (priority DESC, created_at) WHERE (status = 'pending'::stage_zero_status)
  ```
- `idx_stage_zero_requests_requested_by`
  ```sql
  CREATE INDEX idx_stage_zero_requests_requested_by ON public.stage_zero_requests USING btree (requested_by, created_at DESC)
  ```
- `idx_stage_zero_requests_venture_id`
  ```sql
  CREATE INDEX idx_stage_zero_requests_venture_id ON public.stage_zero_requests USING btree (venture_id) WHERE (venture_id IS NOT NULL)
  ```
- `stage_zero_requests_pkey`
  ```sql
  CREATE UNIQUE INDEX stage_zero_requests_pkey ON public.stage_zero_requests USING btree (id)
  ```

## RLS Policies

### 1. dismiss_own_stage_zero_requests (UPDATE)

- **Roles**: {authenticated}
- **Using**: `((auth.uid() = requested_by) AND (status = ANY (ARRAY['completed'::stage_zero_status, 'failed'::stage_zero_status])))`
- **With Check**: `((auth.uid() = requested_by) AND (status = 'dismissed'::stage_zero_status))`

### 2. insert_own_stage_zero_requests (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(auth.uid() = requested_by)`

### 3. select_own_stage_zero_requests (SELECT)

- **Roles**: {authenticated}
- **Using**: `(auth.uid() = requested_by)`

### 4. update_own_pending_stage_zero_requests (UPDATE)

- **Roles**: {authenticated}
- **Using**: `((auth.uid() = requested_by) AND (status = 'pending'::stage_zero_status))`
- **With Check**: `(auth.uid() = requested_by)`

## Triggers

### trg_stage_zero_requests_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_stage_zero_requests_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
