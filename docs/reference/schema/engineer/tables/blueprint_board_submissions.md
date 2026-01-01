# blueprint_board_submissions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-01T22:50:58.156Z
**Rows**: 0
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| blueprint_id | `uuid` | **NO** | - | The opportunity blueprint being submitted for board review |
| submitted_by | `uuid` | **NO** | - | User who submitted the blueprint for review - enforced via RLS, not FK |
| board_meeting_id | `uuid` | YES | - | Board meeting where this blueprint will be/was reviewed (null if pending scheduling) |
| submission_notes | `text` | YES | - | - |
| priority | `character varying(20)` | YES | `'normal'::character varying` | - |
| status | `character varying(30)` | **NO** | `'pending'::character varying` | Current status in the board review workflow |
| review_decision | `jsonb` | YES | - | JSON object containing vote breakdown and decision details after review |
| reviewed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `blueprint_board_submissions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `blueprint_board_submissions_blueprint_id_fkey`: blueprint_id → opportunity_blueprints(id)
- `blueprint_board_submissions_board_meeting_id_fkey`: board_meeting_id → board_meetings(id)

### Check Constraints
- `blueprint_board_submissions_priority_check`: CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying, 'urgent'::character varying])::text[])))
- `blueprint_board_submissions_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'scheduled'::character varying, 'in_review'::character varying, 'approved'::character varying, 'rejected'::character varying, 'deferred'::character varying, 'withdrawn'::character varying])::text[])))

## Indexes

- `blueprint_board_submissions_pkey`
  ```sql
  CREATE UNIQUE INDEX blueprint_board_submissions_pkey ON public.blueprint_board_submissions USING btree (id)
  ```
- `idx_active_blueprint_submissions`
  ```sql
  CREATE UNIQUE INDEX idx_active_blueprint_submissions ON public.blueprint_board_submissions USING btree (blueprint_id, submitted_by) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'scheduled'::character varying, 'in_review'::character varying])::text[]))
  ```
- `idx_board_submissions_blueprint_id`
  ```sql
  CREATE INDEX idx_board_submissions_blueprint_id ON public.blueprint_board_submissions USING btree (blueprint_id)
  ```
- `idx_board_submissions_created_at`
  ```sql
  CREATE INDEX idx_board_submissions_created_at ON public.blueprint_board_submissions USING btree (created_at DESC)
  ```
- `idx_board_submissions_meeting_id`
  ```sql
  CREATE INDEX idx_board_submissions_meeting_id ON public.blueprint_board_submissions USING btree (board_meeting_id)
  ```
- `idx_board_submissions_status`
  ```sql
  CREATE INDEX idx_board_submissions_status ON public.blueprint_board_submissions USING btree (status)
  ```
- `idx_board_submissions_submitted_by`
  ```sql
  CREATE INDEX idx_board_submissions_submitted_by ON public.blueprint_board_submissions USING btree (submitted_by)
  ```

## RLS Policies

### 1. delete_own_pending_submissions (DELETE)

- **Roles**: {public}
- **Using**: `((auth.uid() = submitted_by) AND ((status)::text = 'pending'::text))`

### 2. insert_own_submissions (INSERT)

- **Roles**: {public}
- **With Check**: `(auth.uid() = submitted_by)`

### 3. select_board_submissions (SELECT)

- **Roles**: {public}
- **Using**: `(auth.role() = 'authenticated'::text)`

### 4. service_role_all_submissions (ALL)

- **Roles**: {public}
- **Using**: `((auth.jwt() ->> 'role'::text) = 'service_role'::text)`

### 5. update_own_pending_submissions (UPDATE)

- **Roles**: {public}
- **Using**: `(((auth.uid() = submitted_by) AND ((status)::text = 'pending'::text)) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text))`
- **With Check**: `(((auth.uid() = submitted_by) AND ((status)::text = 'pending'::text)) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text))`

## Triggers

### update_blueprint_board_submissions_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_bookmark_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
