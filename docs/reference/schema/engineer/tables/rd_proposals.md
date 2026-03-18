# rd_proposals Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-18T21:13:15.267Z
**Rows**: 5
**RLS**: Enabled (6 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (23 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| title | `text` | **NO** | - | - |
| hypothesis | `text` | YES | - | - |
| methodology | `text` | YES | - | - |
| expected_outcome | `text` | YES | - | - |
| priority_score | `numeric(5,2)` | YES | - | - |
| status | `USER-DEFINED` | **NO** | `'pending_review'::rd_proposal_status` | - |
| proposal_type | `USER-DEFINED` | YES | - | - |
| venture_ids | `jsonb` | YES | `'[]'::jsonb` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| dedup_key | `text` | YES | - | - |
| created_by | `text` | **NO** | `'batch-job'::text` | - |
| reviewed_at | `timestamp with time zone` | YES | - | - |
| reviewer_notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| evidence | `jsonb` | YES | `'[]'::jsonb` | - |
| expected_impact | `text` | YES | - | - |
| signal_source | `text` | YES | `'composite'::text` | - |
| batch_run_id | `uuid` | YES | - | - |
| decided_at | `timestamp with time zone` | YES | - | - |
| decided_by | `text` | YES | - | - |
| decision_notes | `text` | YES | - | - |

## Constraints

### Primary Key
- `rd_proposals_pkey`: PRIMARY KEY (id)

### Check Constraints
- `rd_proposals_priority_score_check`: CHECK (((priority_score >= (0)::numeric) AND (priority_score <= (100)::numeric)))
- `rd_proposals_signal_source_check`: CHECK ((signal_source = ANY (ARRAY['calibration'::text, 'codebase_health'::text, 'venture_portfolio'::text, 'composite'::text])))

## Indexes

- `idx_rd_proposals_batch_run`
  ```sql
  CREATE INDEX idx_rd_proposals_batch_run ON public.rd_proposals USING btree (batch_run_id)
  ```
- `idx_rd_proposals_created_at`
  ```sql
  CREATE INDEX idx_rd_proposals_created_at ON public.rd_proposals USING btree (created_at DESC)
  ```
- `idx_rd_proposals_dedup`
  ```sql
  CREATE INDEX idx_rd_proposals_dedup ON public.rd_proposals USING btree (dedup_key)
  ```
- `idx_rd_proposals_priority`
  ```sql
  CREATE INDEX idx_rd_proposals_priority ON public.rd_proposals USING btree (priority_score DESC)
  ```
- `idx_rd_proposals_signal_source`
  ```sql
  CREATE INDEX idx_rd_proposals_signal_source ON public.rd_proposals USING btree (signal_source)
  ```
- `idx_rd_proposals_status`
  ```sql
  CREATE INDEX idx_rd_proposals_status ON public.rd_proposals USING btree (status)
  ```
- `idx_rd_proposals_type`
  ```sql
  CREATE INDEX idx_rd_proposals_type ON public.rd_proposals USING btree (proposal_type)
  ```
- `rd_proposals_pkey`
  ```sql
  CREATE UNIQUE INDEX rd_proposals_pkey ON public.rd_proposals USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. authenticated_read_rd_proposals (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. rd_proposals_authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. rd_proposals_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 5. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 6. service_role_all_rd_proposals (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_rd_proposals_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_rd_proposals_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
