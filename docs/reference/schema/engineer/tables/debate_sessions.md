# debate_sessions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T13:21:15.711Z
**Rows**: 3
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| sd_id | `character varying(50)` | YES | - | - |
| current_phase | `text` | **NO** | - | - |
| conflict_type | `text` | **NO** | - | - |
| conflict_statement | `text` | **NO** | - | - |
| source_agents | `jsonb` | **NO** | `'[]'::jsonb` | - |
| status | `text` | **NO** | `'active'::text` | - |
| round_number | `integer(32)` | **NO** | `1` | - |
| max_rounds | `integer(32)` | **NO** | `3` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| initiated_by | `text` | **NO** | - | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| resolved_by | `text` | YES | - | - |

## Constraints

### Primary Key
- `debate_sessions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `debate_sessions_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `debate_sessions_conflict_type_check`: CHECK ((conflict_type = ANY (ARRAY['approach'::text, 'architecture'::text, 'priority'::text, 'scope'::text, 'technical_choice'::text, 'security'::text, 'performance'::text, 'other'::text])))
- `debate_sessions_current_phase_check`: CHECK ((current_phase = ANY (ARRAY['LEAD_APPROVAL'::text, 'PLAN_PRD'::text, 'EXEC'::text, 'PLAN_VERIFICATION'::text, 'LEAD_FINAL'::text, 'COMPLETED'::text])))
- `debate_sessions_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'verdict_rendered'::text, 'escalated'::text, 'resolved'::text, 'abandoned'::text])))

## Indexes

- `debate_sessions_pkey`
  ```sql
  CREATE UNIQUE INDEX debate_sessions_pkey ON public.debate_sessions USING btree (id)
  ```
- `idx_debate_sessions_active`
  ```sql
  CREATE INDEX idx_debate_sessions_active ON public.debate_sessions USING btree (status) WHERE (status = ANY (ARRAY['active'::text, 'verdict_rendered'::text]))
  ```
- `idx_debate_sessions_conflict_type`
  ```sql
  CREATE INDEX idx_debate_sessions_conflict_type ON public.debate_sessions USING btree (conflict_type)
  ```
- `idx_debate_sessions_created_at`
  ```sql
  CREATE INDEX idx_debate_sessions_created_at ON public.debate_sessions USING btree (created_at DESC)
  ```
- `idx_debate_sessions_sd_id`
  ```sql
  CREATE INDEX idx_debate_sessions_sd_id ON public.debate_sessions USING btree (sd_id)
  ```
- `idx_debate_sessions_status`
  ```sql
  CREATE INDEX idx_debate_sessions_status ON public.debate_sessions USING btree (status)
  ```

## RLS Policies

### 1. Allow authenticated to insert debate sessions (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. Allow read access to debate sessions (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 3. Allow service role to update debate sessions (UPDATE)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_update_debate_session_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_debate_session_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
