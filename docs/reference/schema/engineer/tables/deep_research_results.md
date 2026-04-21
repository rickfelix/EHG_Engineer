# deep_research_results Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-21T23:30:46.188Z
**Rows**: 2
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (21 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| query | `text` | **NO** | - | The research query/prompt sent to the provider |
| provider | `text` | **NO** | - | AI provider: gemini, anthropic, or openai |
| model | `text` | **NO** | - | - |
| response | `text` | **NO** | - | - |
| response_format | `text` | YES | `'markdown'::text` | - |
| file_path | `text` | YES | - | - |
| cost_usd | `numeric(10,6)` | YES | `0` | - |
| duration_ms | `integer(32)` | YES | - | - |
| tokens_used | `jsonb` | YES | `'{}'::jsonb` | Token usage breakdown (input_tokens, output_tokens, thinking_tokens) |
| status | `text` | **NO** | `'pending'::text` | - |
| error_message | `text` | YES | - | - |
| research_session_id | `uuid` | YES | - | Groups multiple research calls into a single session |
| brainstorm_session_id | `uuid` | YES | - | - |
| sd_key | `text` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| trigger_source | `text` | YES | - | What initiated this research call |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `deep_research_results_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `deep_research_results_brainstorm_session_id_fkey`: brainstorm_session_id → brainstorm_sessions(id)
- `deep_research_results_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `deep_research_results_duration_ms_check`: CHECK ((duration_ms >= 0))
- `deep_research_results_provider_check`: CHECK ((provider = ANY (ARRAY['gemini'::text, 'anthropic'::text, 'openai'::text, 'google'::text, 'ollama'::text])))
- `deep_research_results_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'timeout'::text])))
- `deep_research_results_trigger_source_check`: CHECK ((trigger_source = ANY (ARRAY['manual'::text, 'triangulation'::text, 'brainstorm'::text, 'vision'::text])))

## Indexes

- `deep_research_results_pkey`
  ```sql
  CREATE UNIQUE INDEX deep_research_results_pkey ON public.deep_research_results USING btree (id)
  ```
- `idx_deep_research_created`
  ```sql
  CREATE INDEX idx_deep_research_created ON public.deep_research_results USING btree (created_at DESC)
  ```
- `idx_deep_research_provider`
  ```sql
  CREATE INDEX idx_deep_research_provider ON public.deep_research_results USING btree (provider)
  ```
- `idx_deep_research_sd`
  ```sql
  CREATE INDEX idx_deep_research_sd ON public.deep_research_results USING btree (sd_key)
  ```
- `idx_deep_research_session`
  ```sql
  CREATE INDEX idx_deep_research_session ON public.deep_research_results USING btree (research_session_id)
  ```
- `idx_deep_research_status`
  ```sql
  CREATE INDEX idx_deep_research_status ON public.deep_research_results USING btree (status)
  ```

## Triggers

### set_deep_research_results_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
