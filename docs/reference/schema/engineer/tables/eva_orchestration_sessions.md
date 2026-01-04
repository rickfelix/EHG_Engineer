# eva_orchestration_sessions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-04T14:13:42.838Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| session_id | `uuid` | **NO** | `gen_random_uuid()` | - |
| company_id | `uuid` | **NO** | - | - |
| session_type | `text` | **NO** | - | - |
| session_status | `text` | **NO** | `'active'::text` | - |
| active_agents | `ARRAY` | YES | `ARRAY[]::text[]` | Array of ai_agents.id UUIDs (as text) currently participating in session |
| chairman_oversight | `boolean` | YES | `false` | When true, Chairman must approve critical decisions during orchestration |
| orchestration_context | `jsonb` | YES | `'{}'::jsonb` | JSONB payload with session-specific context (venture_id, stage_id, objectives, constraints) |
| objective | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| started_at | `timestamp with time zone` | YES | - | - |
| paused_at | `timestamp with time zone` | YES | - | - |
| resumed_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| failed_at | `timestamp with time zone` | YES | - | - |
| created_by | `uuid` | **NO** | - | - |
| error_log | `jsonb` | YES | `'[]'::jsonb` | Array of error events |
| performance_summary | `jsonb` | YES | `'{}'::jsonb` | Aggregated performance metrics |

## Constraints

### Primary Key
- `eva_orchestration_sessions_pkey`: PRIMARY KEY (session_id)

### Foreign Keys
- `eva_orchestration_sessions_company_id_fkey`: company_id → companies(id)

### Check Constraints
- `eva_orchestration_sessions_session_status_check`: CHECK ((session_status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
- `eva_orchestration_sessions_session_type_check`: CHECK ((session_type = ANY (ARRAY['venture_workflow'::text, 'strategic_analysis'::text, 'performance_review'::text, 'integration_coordination'::text])))

## Indexes

- `eva_orchestration_sessions_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_orchestration_sessions_pkey ON public.eva_orchestration_sessions USING btree (session_id)
  ```
- `idx_eva_sessions_company`
  ```sql
  CREATE INDEX idx_eva_sessions_company ON public.eva_orchestration_sessions USING btree (company_id)
  ```
- `idx_eva_sessions_created`
  ```sql
  CREATE INDEX idx_eva_sessions_created ON public.eva_orchestration_sessions USING btree (created_at DESC)
  ```
- `idx_eva_sessions_status`
  ```sql
  CREATE INDEX idx_eva_sessions_status ON public.eva_orchestration_sessions USING btree (session_status)
  ```
- `idx_eva_sessions_type`
  ```sql
  CREATE INDEX idx_eva_sessions_type ON public.eva_orchestration_sessions USING btree (session_type)
  ```

## RLS Policies

### 1. eva_orchestration_sessions_company_delete (DELETE)

- **Roles**: {public}
- **Using**: `(company_id IN ( SELECT user_company_access.company_id
   FROM user_company_access
  WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.is_active = true) AND (user_company_access.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])))))`

### 2. eva_sessions_company_access (SELECT)

- **Roles**: {public}
- **Using**: `(company_id IN ( SELECT user_company_access.company_id
   FROM user_company_access
  WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.is_active = true))))`

### 3. eva_sessions_company_insert (INSERT)

- **Roles**: {public}
- **With Check**: `(company_id IN ( SELECT user_company_access.company_id
   FROM user_company_access
  WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.is_active = true) AND (user_company_access.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])))))`

### 4. eva_sessions_company_update (UPDATE)

- **Roles**: {public}
- **Using**: `(company_id IN ( SELECT user_company_access.company_id
   FROM user_company_access
  WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.is_active = true) AND (user_company_access.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
