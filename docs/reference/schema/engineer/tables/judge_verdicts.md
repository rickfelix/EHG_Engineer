# judge_verdicts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-02T04:15:23.892Z
**Rows**: 1
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (20 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| debate_session_id | `uuid` | **NO** | - | - |
| verdict_type | `text` | **NO** | - | - |
| selected_agent_code | `text` | YES | - | - |
| selected_argument_ids | `ARRAY` | YES | - | - |
| summary | `text` | **NO** | - | - |
| detailed_rationale | `text` | **NO** | - | - |
| constitution_citations | `jsonb` | **NO** | `'[]'::jsonb` | - |
| constitutional_score | `numeric(3,2)` | YES | - | - |
| confidence_score | `numeric(3,2)` | **NO** | - | - |
| escalation_required | `boolean` | **NO** | `false` | - |
| escalation_reason | `text` | YES | - | - |
| human_decision | `text` | YES | - | - |
| human_decision_by | `text` | YES | - | - |
| human_decision_at | `timestamp with time zone` | YES | - | - |
| human_decision_notes | `text` | YES | - | - |
| processing_time_ms | `integer(32)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| rendered_by | `text` | **NO** | `'JUDGE'::text` | - |

## Constraints

### Primary Key
- `judge_verdicts_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `judge_verdicts_debate_session_id_fkey`: debate_session_id → debate_sessions(id)

### Check Constraints
- `judge_verdicts_confidence_score_check`: CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)))
- `judge_verdicts_constitutional_score_check`: CHECK (((constitutional_score >= (0)::numeric) AND (constitutional_score <= (1)::numeric)))
- `judge_verdicts_human_decision_check`: CHECK ((human_decision = ANY (ARRAY['confirmed'::text, 'overridden'::text, 'modified'::text])))
- `judge_verdicts_verdict_type_check`: CHECK ((verdict_type = ANY (ARRAY['recommendation_selected'::text, 'synthesis'::text, 'escalate'::text, 'defer'::text, 'reject_all'::text])))

## Indexes

- `idx_judge_verdicts_confidence`
  ```sql
  CREATE INDEX idx_judge_verdicts_confidence ON public.judge_verdicts USING btree (confidence_score)
  ```
- `idx_judge_verdicts_created_at`
  ```sql
  CREATE INDEX idx_judge_verdicts_created_at ON public.judge_verdicts USING btree (created_at DESC)
  ```
- `idx_judge_verdicts_escalation`
  ```sql
  CREATE INDEX idx_judge_verdicts_escalation ON public.judge_verdicts USING btree (escalation_required) WHERE (escalation_required = true)
  ```
- `idx_judge_verdicts_session`
  ```sql
  CREATE INDEX idx_judge_verdicts_session ON public.judge_verdicts USING btree (debate_session_id)
  ```
- `idx_judge_verdicts_verdict_type`
  ```sql
  CREATE INDEX idx_judge_verdicts_verdict_type ON public.judge_verdicts USING btree (verdict_type)
  ```
- `judge_verdicts_pkey`
  ```sql
  CREATE UNIQUE INDEX judge_verdicts_pkey ON public.judge_verdicts USING btree (id)
  ```

## RLS Policies

### 1. Allow human decision updates (UPDATE)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `((verdict_type = ( SELECT judge_verdicts_1.verdict_type
   FROM judge_verdicts judge_verdicts_1
  WHERE (judge_verdicts_1.id = judge_verdicts_1.id))) AND (detailed_rationale = ( SELECT judge_verdicts_1.detailed_rationale
   FROM judge_verdicts judge_verdicts_1
  WHERE (judge_verdicts_1.id = judge_verdicts_1.id))) AND (confidence_score = ( SELECT judge_verdicts_1.confidence_score
   FROM judge_verdicts judge_verdicts_1
  WHERE (judge_verdicts_1.id = judge_verdicts_1.id))))`

### 2. Allow read access to judge verdicts (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 3. Allow service role to insert verdicts (INSERT)

- **Roles**: {public}
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
