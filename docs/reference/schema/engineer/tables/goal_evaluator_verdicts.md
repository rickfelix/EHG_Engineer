# goal_evaluator_verdicts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `uuid` | YES | - | - |
| sd_key | `text` | YES | - | - |
| prompt | `text` | **NO** | - | - |
| prompt_hash | `text` | **NO** | - | - |
| verdict | `text` | **NO** | - | - |
| votes | `jsonb` | **NO** | `'[]'::jsonb` | - |
| confidence | `numeric(5,4)` | YES | - | - |
| vocab_version | `text` | **NO** | - | - |
| schema_version | `text` | **NO** | - | - |
| validator_name | `text` | **NO** | `'goal_evaluator'::text` | - |
| correlation_id | `uuid` | YES | `gen_random_uuid()` | - |
| audit_log_id | `uuid` | YES | - | - |
| smoke_test_passed_at | `timestamp with time zone` | YES | - | - |
| runtime_observed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `goal_evaluator_verdicts_pkey`: PRIMARY KEY (id)

### Check Constraints
- `goal_evaluator_verdicts_verdict_check`: CHECK ((verdict = ANY (ARRAY['PASS'::text, 'UNANIMITY_FAIL'::text, 'CONTRACT_MALFORMED'::text, 'CONTRACT_MISSING'::text])))

## Indexes

- `goal_evaluator_verdicts_pkey`
  ```sql
  CREATE UNIQUE INDEX goal_evaluator_verdicts_pkey ON public.goal_evaluator_verdicts USING btree (id)
  ```
- `idx_goal_evaluator_verdicts_correlation`
  ```sql
  CREATE INDEX idx_goal_evaluator_verdicts_correlation ON public.goal_evaluator_verdicts USING btree (correlation_id)
  ```
- `idx_goal_evaluator_verdicts_created`
  ```sql
  CREATE INDEX idx_goal_evaluator_verdicts_created ON public.goal_evaluator_verdicts USING btree (created_at DESC)
  ```
- `idx_goal_evaluator_verdicts_prompt_hash`
  ```sql
  CREATE INDEX idx_goal_evaluator_verdicts_prompt_hash ON public.goal_evaluator_verdicts USING btree (prompt_hash)
  ```
- `idx_goal_evaluator_verdicts_sd_key`
  ```sql
  CREATE INDEX idx_goal_evaluator_verdicts_sd_key ON public.goal_evaluator_verdicts USING btree (sd_key)
  ```

## RLS Policies

### 1. goal_evaluator_verdicts_read_all (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
