# plan_subagent_queries Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-18T21:49:49.245Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('plan_subagent_queries_id_seq'::regclass)` | - |
| session_id | `uuid` | **NO** | - | - |
| sub_agent_code | `character varying(20)` | **NO** | - | - |
| query_type | `character varying(50)` | **NO** | `'verification_check'::character varying` | - |
| request_payload | `jsonb` | YES | - | - |
| response_payload | `jsonb` | YES | - | - |
| status | `character varying(20)` | YES | - | - |
| confidence | `integer(32)` | YES | - | - |
| requested_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| responded_at | `timestamp without time zone` | YES | - | - |
| response_time_ms | `integer(32)` | YES | - | - |
| timeout_ms | `integer(32)` | YES | `5000` | - |
| retry_count | `integer(32)` | YES | `0` | - |
| max_retries | `integer(32)` | YES | `3` | - |
| circuit_breaker_status | `character varying(20)` | YES | `'closed'::character varying` | - |

## Constraints

### Primary Key
- `plan_subagent_queries_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `plan_subagent_queries_session_id_sub_agent_code_key`: UNIQUE (session_id, sub_agent_code)

### Check Constraints
- `plan_subagent_queries_confidence_check`: CHECK (((confidence >= 0) AND (confidence <= 100)))
- `plan_subagent_queries_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'running'::character varying, 'success'::character varying, 'failed'::character varying, 'timeout'::character varying])::text[])))

## Indexes

- `idx_subagent_session`
  ```sql
  CREATE INDEX idx_subagent_session ON public.plan_subagent_queries USING btree (session_id)
  ```
- `plan_subagent_queries_pkey`
  ```sql
  CREATE UNIQUE INDEX plan_subagent_queries_pkey ON public.plan_subagent_queries USING btree (id)
  ```
- `plan_subagent_queries_session_id_sub_agent_code_key`
  ```sql
  CREATE UNIQUE INDEX plan_subagent_queries_session_id_sub_agent_code_key ON public.plan_subagent_queries USING btree (session_id, sub_agent_code)
  ```

## RLS Policies

### 1. authenticated_read_plan_subagent_queries (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_plan_subagent_queries (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
