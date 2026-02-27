# sensemaking_analyses Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-27T21:47:21.866Z
**Rows**: 8
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (25 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| correlation_id | `text` | **NO** | - | - |
| input_type | `text` | **NO** | - | - |
| input_source | `text` | **NO** | - | - |
| input_metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| prompt_template_id | `uuid` | YES | - | - |
| prompt_version | `text` | YES | - | - |
| personas_applied | `ARRAY` | YES | `'{}'::text[]` | - |
| persona_selection_rationale | `text` | YES | - | - |
| overall_confidence | `numeric(3,2)` | YES | - | - |
| confidence_justification | `text` | YES | - | - |
| analysis_result | `jsonb` | YES | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| error_details | `jsonb` | YES | - | - |
| governance_flags | `jsonb` | YES | `'[]'::jsonb` | - |
| kb_entries_used | `ARRAY` | YES | `'{}'::text[]` | - |
| model | `text` | **NO** | `'gemini-2.0-flash'::text` | - |
| latency_ms | `integer(32)` | YES | - | - |
| token_count | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| disposition | `text` | YES | - | - |
| disposition_at | `timestamp with time zone` | YES | - | - |
| disposition_by | `text` | YES | - | - |
| telegram_notification_message_id | `text` | YES | - | - |

## Constraints

### Primary Key
- `sensemaking_analyses_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sensemaking_analyses_prompt_template_id_fkey`: prompt_template_id → prompt_templates(id)

### Check Constraints
- `sensemaking_analyses_disposition_check`: CHECK ((disposition = ANY (ARRAY['keep'::text, 'discard'::text])))
- `sensemaking_analyses_input_type_check`: CHECK ((input_type = ANY (ARRAY['video'::text, 'article'::text, 'structured'::text, 'text'::text])))
- `sensemaking_analyses_overall_confidence_check`: CHECK (((overall_confidence >= (0)::numeric) AND (overall_confidence <= (1)::numeric)))
- `sensemaking_analyses_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'partial'::text, 'failed'::text])))

## Indexes

- `idx_sensemaking_analyses_assist_filter`
  ```sql
  CREATE INDEX idx_sensemaking_analyses_assist_filter ON public.sensemaking_analyses USING btree (status, created_at DESC) WHERE ((disposition IS NULL) OR (disposition = 'keep'::text))
  ```
- `idx_sensemaking_analyses_correlation`
  ```sql
  CREATE INDEX idx_sensemaking_analyses_correlation ON public.sensemaking_analyses USING btree (correlation_id)
  ```
- `idx_sensemaking_analyses_created`
  ```sql
  CREATE INDEX idx_sensemaking_analyses_created ON public.sensemaking_analyses USING btree (created_at DESC)
  ```
- `idx_sensemaking_analyses_disposition`
  ```sql
  CREATE INDEX idx_sensemaking_analyses_disposition ON public.sensemaking_analyses USING btree (disposition) WHERE (disposition IS NOT NULL)
  ```
- `idx_sensemaking_analyses_input_type`
  ```sql
  CREATE INDEX idx_sensemaking_analyses_input_type ON public.sensemaking_analyses USING btree (input_type)
  ```
- `idx_sensemaking_analyses_metadata`
  ```sql
  CREATE INDEX idx_sensemaking_analyses_metadata ON public.sensemaking_analyses USING gin (input_metadata)
  ```
- `idx_sensemaking_analyses_result`
  ```sql
  CREATE INDEX idx_sensemaking_analyses_result ON public.sensemaking_analyses USING gin (analysis_result)
  ```
- `idx_sensemaking_analyses_status`
  ```sql
  CREATE INDEX idx_sensemaking_analyses_status ON public.sensemaking_analyses USING btree (status)
  ```
- `idx_sensemaking_analyses_telegram_msg`
  ```sql
  CREATE INDEX idx_sensemaking_analyses_telegram_msg ON public.sensemaking_analyses USING btree (telegram_notification_message_id) WHERE (telegram_notification_message_id IS NOT NULL)
  ```
- `sensemaking_analyses_pkey`
  ```sql
  CREATE UNIQUE INDEX sensemaking_analyses_pkey ON public.sensemaking_analyses USING btree (id)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
