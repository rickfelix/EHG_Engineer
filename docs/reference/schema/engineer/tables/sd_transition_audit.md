# sd_transition_audit Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-13T16:20:07.411Z
**Rows**: 72
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `uuid` | **NO** | - | - |
| transition_type | `character varying(50)` | **NO** | - | - |
| session_id | `text` | YES | - | - |
| request_id | `text` | **NO** | - | - |
| pre_state | `jsonb` | **NO** | - | - |
| post_state | `jsonb` | YES | - | - |
| status | `character varying(20)` | YES | `'in_progress'::character varying` | - |
| error_details | `jsonb` | YES | - | - |
| started_at | `timestamp with time zone` | YES | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `sd_transition_audit_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_transition_audit_sd_id_fkey`: sd_id → strategic_directives_v2(uuid_id)

### Unique Constraints
- `sd_transition_audit_request_id_key`: UNIQUE (request_id)

### Check Constraints
- `sd_transition_audit_status_check`: CHECK (((status)::text = ANY ((ARRAY['in_progress'::character varying, 'completed'::character varying, 'rolled_back'::character varying, 'failed'::character varying])::text[])))

## Indexes

- `idx_sd_transition_audit_request_id`
  ```sql
  CREATE INDEX idx_sd_transition_audit_request_id ON public.sd_transition_audit USING btree (request_id)
  ```
- `idx_sd_transition_audit_sd_id`
  ```sql
  CREATE INDEX idx_sd_transition_audit_sd_id ON public.sd_transition_audit USING btree (sd_id)
  ```
- `idx_sd_transition_audit_status`
  ```sql
  CREATE INDEX idx_sd_transition_audit_status ON public.sd_transition_audit USING btree (status)
  ```
- `sd_transition_audit_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_transition_audit_pkey ON public.sd_transition_audit USING btree (id)
  ```
- `sd_transition_audit_request_id_key`
  ```sql
  CREATE UNIQUE INDEX sd_transition_audit_request_id_key ON public.sd_transition_audit USING btree (request_id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
