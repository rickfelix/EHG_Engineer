# agent_artifacts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T18:05:55.206Z
**Rows**: 6,099
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (20 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| sd_id | `text` | YES | - | - |
| execution_id | `uuid` | YES | - | - |
| type | `text` | **NO** | - | - |
| summary | `text` | **NO** | - | - |
| confidence | `text` | YES | `'HIGH'::text` | Verification gate trigger: LOW confidence requires read_artifact before action |
| content_text | `text` | YES | - | - |
| content_blob_path | `text` | YES | - | - |
| token_count | `integer(32)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `text` | YES | - | - |
| expires_at | `timestamp with time zone` | YES | - | - |
| session_id | `uuid` | YES | - | - |
| source_tool | `character varying(50)` | YES | - | - |
| quality_score | `integer(32)` | YES | - | - |
| validation_status | `character varying(20)` | YES | `'pending'::character varying` | - |
| validated_at | `timestamp with time zone` | YES | - | - |
| validated_by | `character varying(100)` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `agent_artifacts_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `agent_artifacts_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `agent_artifacts_confidence_check`: CHECK ((confidence = ANY (ARRAY['HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))
- `agent_artifacts_quality_score_check`: CHECK (((quality_score IS NULL) OR ((quality_score >= 0) AND (quality_score <= 100))))
- `agent_artifacts_type_check`: CHECK ((type = ANY (ARRAY['file_read'::text, 'tool_output'::text, 'bash_output'::text, 'grep_result'::text, 'glob_result'::text, 'web_fetch'::text, 'database_query'::text, 'sub_agent_instructions'::text, 'contract_input'::text, 'contract_output'::text, 'analysis'::text, 'summary'::text, 'context'::text, 'decision'::text, 'research'::text, 'plan'::text, 'validation'::text])))
- `agent_artifacts_validation_status_check`: CHECK (((validation_status)::text = ANY ((ARRAY['pending'::character varying, 'validated'::character varying, 'rejected'::character varying, 'needs_revision'::character varying])::text[])))
- `chk_source_tool`: CHECK (((source_tool IS NULL) OR ((source_tool)::text = ANY ((ARRAY['Read'::character varying, 'Bash'::character varying, 'Write'::character varying, 'Glob'::character varying, 'Grep'::character varying, 'Edit'::character varying, 'Task'::character varying, 'WebFetch'::character varying, 'WebSearch'::character varying, 'other'::character varying, 'sub-agent-executor'::character varying, 'artifact-tools'::character varying, 'leo-executor'::character varying, 'handoff-validator'::character varying, 'contract-system'::character varying, 'test-script'::character varying])::text[]))))

## Indexes

- `agent_artifacts_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_artifacts_pkey ON public.agent_artifacts USING btree (id)
  ```
- `idx_agent_artifacts_confidence`
  ```sql
  CREATE INDEX idx_agent_artifacts_confidence ON public.agent_artifacts USING btree (confidence) WHERE (confidence <> 'HIGH'::text)
  ```
- `idx_agent_artifacts_created_at`
  ```sql
  CREATE INDEX idx_agent_artifacts_created_at ON public.agent_artifacts USING btree (created_at DESC)
  ```
- `idx_agent_artifacts_execution_id`
  ```sql
  CREATE INDEX idx_agent_artifacts_execution_id ON public.agent_artifacts USING btree (execution_id)
  ```
- `idx_agent_artifacts_expires`
  ```sql
  CREATE INDEX idx_agent_artifacts_expires ON public.agent_artifacts USING btree (expires_at) WHERE (expires_at IS NOT NULL)
  ```
- `idx_agent_artifacts_sd_id`
  ```sql
  CREATE INDEX idx_agent_artifacts_sd_id ON public.agent_artifacts USING btree (sd_id)
  ```
- `idx_agent_artifacts_session`
  ```sql
  CREATE INDEX idx_agent_artifacts_session ON public.agent_artifacts USING btree (session_id)
  ```
- `idx_agent_artifacts_source_tool`
  ```sql
  CREATE INDEX idx_agent_artifacts_source_tool ON public.agent_artifacts USING btree (source_tool)
  ```
- `idx_agent_artifacts_summary_fts`
  ```sql
  CREATE INDEX idx_agent_artifacts_summary_fts ON public.agent_artifacts USING gin (to_tsvector('english'::regconfig, summary))
  ```
- `idx_agent_artifacts_type`
  ```sql
  CREATE INDEX idx_agent_artifacts_type ON public.agent_artifacts USING btree (type)
  ```
- `idx_agent_artifacts_validation_status`
  ```sql
  CREATE INDEX idx_agent_artifacts_validation_status ON public.agent_artifacts USING btree (validation_status)
  ```

## RLS Policies

### 1. Anon can insert artifacts (INSERT)

- **Roles**: {anon}
- **With Check**: `true`

### 2. Service role full access to agent_artifacts (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 3. Users can read artifacts (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trg_agent_artifacts_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_agent_artifacts_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
