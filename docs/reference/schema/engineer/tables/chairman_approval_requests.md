# chairman_approval_requests Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-30T13:00:06.703Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| request_type | `character varying(50)` | **NO** | - | - |
| request_title | `character varying(200)` | **NO** | - | - |
| request_description | `text` | **NO** | - | - |
| request_data | `jsonb` | **NO** | `'{}'::jsonb` | - |
| priority | `character varying(20)` | YES | `'normal'::character varying` | - |
| status | `character varying(20)` | YES | `'pending'::character varying` | - |
| decision_by | `uuid` | YES | - | - |
| decision_at | `timestamp with time zone` | YES | - | - |
| decision_rationale | `text` | YES | - | - |
| requested_by | `uuid` | YES | - | - |
| deadline_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `chairman_approval_requests_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `chairman_approval_requests_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `chairman_approval_requests_priority_check`: CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying, 'urgent'::character varying])::text[])))
- `chairman_approval_requests_request_type_check`: CHECK (((request_type)::text = ANY ((ARRAY['valuation_approval'::character varying, 'substage_override'::character varying, 'exit_strategy_approval'::character varying, 'investor_approach'::character varying, 'kill_switch'::character varying])::text[])))
- `chairman_approval_requests_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'under_review'::character varying, 'approved'::character varying, 'rejected'::character varying, 'deferred'::character varying, 'cancelled'::character varying])::text[])))
- `valid_decision_rationale`: CHECK ((((status)::text <> ALL ((ARRAY['approved'::character varying, 'rejected'::character varying])::text[])) OR (char_length(decision_rationale) >= 50)))

## Indexes

- `chairman_approval_requests_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_approval_requests_pkey ON public.chairman_approval_requests USING btree (id)
  ```
- `idx_chairman_approval_requests_created`
  ```sql
  CREATE INDEX idx_chairman_approval_requests_created ON public.chairman_approval_requests USING btree (created_at DESC)
  ```
- `idx_chairman_approval_requests_pending`
  ```sql
  CREATE INDEX idx_chairman_approval_requests_pending ON public.chairman_approval_requests USING btree (status, priority) WHERE ((status)::text = 'pending'::text)
  ```
- `idx_chairman_approval_requests_priority`
  ```sql
  CREATE INDEX idx_chairman_approval_requests_priority ON public.chairman_approval_requests USING btree (priority)
  ```
- `idx_chairman_approval_requests_status`
  ```sql
  CREATE INDEX idx_chairman_approval_requests_status ON public.chairman_approval_requests USING btree (status)
  ```
- `idx_chairman_approval_requests_type`
  ```sql
  CREATE INDEX idx_chairman_approval_requests_type ON public.chairman_approval_requests USING btree (request_type)
  ```
- `idx_chairman_approval_requests_venture`
  ```sql
  CREATE INDEX idx_chairman_approval_requests_venture ON public.chairman_approval_requests USING btree (venture_id)
  ```

## RLS Policies

### 1. Company access chairman_approval_requests (ALL)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

## Triggers

### update_chairman_approval_requests_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
