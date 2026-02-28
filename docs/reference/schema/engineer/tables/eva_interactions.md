---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# eva_interactions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-28T03:49:53.877Z
**Rows**: 897
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| decision_type | `text` | **NO** | - | Category of the decision being made |
| chairman_action | `text` | YES | - | What the chairman decided (NULL if pending or system-only) |
| gate_score | `numeric` | YES | - | Score from gate evaluation (0-100) |
| confidence_score | `numeric` | YES | - | System confidence in its recommendation (0-100) |
| sd_id | `character varying(50)` | YES | - | FK to strategic_directives_v2(id) - VARCHAR(50), not UUID |
| venture_id | `uuid` | YES | - | - |
| session_id | `text` | YES | - | - |
| parent_interaction_id | `uuid` | YES | - | Self-referential FK for decision chains |
| interaction_type | `text` | **NO** | - | Categorization for analytics grouping |
| context | `jsonb` | YES | `'{}'::jsonb` | Extensible context data for the interaction |
| recommendation | `jsonb` | YES | `'{}'::jsonb` | System recommendation details |
| outcome_details | `jsonb` | YES | `'{}'::jsonb` | Outcome after chairman action |
| metadata | `jsonb` | YES | `'{}'::jsonb` | Arbitrary metadata for extensibility |
| input_context | `jsonb` | YES | `'{}'::jsonb` | Input context snapshot for ML training |
| output_decision | `jsonb` | YES | `'{}'::jsonb` | Output decision snapshot for ML training |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_interactions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_interactions_parent_interaction_id_fkey`: parent_interaction_id → eva_interactions(id)
- `eva_interactions_sd_id_fkey`: sd_id → strategic_directives_v2(id)
- `eva_interactions_session_id_fkey`: session_id → claude_sessions(session_id)
- `eva_interactions_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `eva_interactions_chairman_action_check`: CHECK ((chairman_action = ANY (ARRAY['accepted'::text, 'modified'::text, 'rejected'::text, 'deferred'::text, 'escalated'::text])))
- `eva_interactions_confidence_score_check`: CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (100)::numeric)))
- `eva_interactions_context_check`: CHECK ((jsonb_typeof(context) = 'object'::text))
- `eva_interactions_decision_type_check`: CHECK ((decision_type = ANY (ARRAY['gate_event'::text, 'recommendation'::text, 'directive_decision'::text, 'venture_stage_transition'::text, 'kill_gate'::text, 'resource_allocation'::text, 'priority_override'::text, 'scope_change'::text, 'risk_escalation'::text])))
- `eva_interactions_gate_score_check`: CHECK (((gate_score >= (0)::numeric) AND (gate_score <= (100)::numeric)))
- `eva_interactions_interaction_type_check`: CHECK ((interaction_type = ANY (ARRAY['handoff_gate'::text, 'quality_assessment'::text, 'sd_creation'::text, 'pattern_detection'::text, 'learning_decision'::text])))
- `eva_interactions_metadata_check`: CHECK ((jsonb_typeof(metadata) = 'object'::text))

## Indexes

- `eva_interactions_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_interactions_pkey ON public.eva_interactions USING btree (id)
  ```
- `idx_eva_interactions_created_at`
  ```sql
  CREATE INDEX idx_eva_interactions_created_at ON public.eva_interactions USING btree (created_at)
  ```
- `idx_eva_interactions_decision_type`
  ```sql
  CREATE INDEX idx_eva_interactions_decision_type ON public.eva_interactions USING btree (decision_type)
  ```
- `idx_eva_interactions_interaction_type`
  ```sql
  CREATE INDEX idx_eva_interactions_interaction_type ON public.eva_interactions USING btree (interaction_type)
  ```
- `idx_eva_interactions_sd_id`
  ```sql
  CREATE INDEX idx_eva_interactions_sd_id ON public.eva_interactions USING btree (sd_id)
  ```
- `idx_eva_interactions_venture_id`
  ```sql
  CREATE INDEX idx_eva_interactions_venture_id ON public.eva_interactions USING btree (venture_id)
  ```

## Triggers

### update_eva_interactions_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
