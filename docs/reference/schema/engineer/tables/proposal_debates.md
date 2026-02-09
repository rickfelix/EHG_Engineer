# proposal_debates Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-09T14:43:56.070Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (22 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| proposal_id | `uuid` | **NO** | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| started_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| max_rounds | `integer(32)` | **NO** | `3` | - |
| actual_rounds | `integer(32)` | YES | `0` | - |
| consensus_threshold | `integer(32)` | YES | `15` | - |
| consensus_reached | `boolean` | YES | `false` | - |
| consensus_reason | `text` | YES | - | - |
| final_verdict | `text` | YES | - | - |
| final_score | `numeric(5,2)` | YES | - | - |
| top_issues | `jsonb` | YES | `'[]'::jsonb` | - |
| recommended_next_steps | `jsonb` | YES | `'[]'::jsonb` | - |
| const_002_passed | `boolean` | YES | - | - |
| const_002_result | `jsonb` | YES | - | - |
| error_code | `text` | YES | - | - |
| error_message | `text` | YES | - | - |
| correlation_id | `uuid` | YES | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `text` | YES | `'debate_orchestrator'::text` | - |

## Constraints

### Primary Key
- `proposal_debates_pkey`: PRIMARY KEY (id)

### Check Constraints
- `proposal_debates_final_verdict_check`: CHECK ((final_verdict = ANY (ARRAY['approve'::text, 'revise'::text, 'reject'::text])))
- `proposal_debates_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))

## Indexes

- `idx_proposal_debates_correlation_id`
  ```sql
  CREATE INDEX idx_proposal_debates_correlation_id ON public.proposal_debates USING btree (correlation_id)
  ```
- `idx_proposal_debates_created_at`
  ```sql
  CREATE INDEX idx_proposal_debates_created_at ON public.proposal_debates USING btree (created_at DESC)
  ```
- `idx_proposal_debates_idempotent`
  ```sql
  CREATE UNIQUE INDEX idx_proposal_debates_idempotent ON public.proposal_debates USING btree (proposal_id) WHERE (status = ANY (ARRAY['running'::text, 'completed'::text]))
  ```
- `idx_proposal_debates_proposal_id`
  ```sql
  CREATE INDEX idx_proposal_debates_proposal_id ON public.proposal_debates USING btree (proposal_id)
  ```
- `idx_proposal_debates_status`
  ```sql
  CREATE INDEX idx_proposal_debates_status ON public.proposal_debates USING btree (status)
  ```
- `proposal_debates_pkey`
  ```sql
  CREATE UNIQUE INDEX proposal_debates_pkey ON public.proposal_debates USING btree (id)
  ```

## RLS Policies

### 1. proposal_debates_read (SELECT)

- **Roles**: {public}
- **Using**: `(auth.role() = 'authenticated'::text)`

### 2. proposal_debates_service_all (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`

## Triggers

### trg_proposal_debates_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_proposal_debates_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
