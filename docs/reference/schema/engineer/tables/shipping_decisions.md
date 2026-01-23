# shipping_decisions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T14:55:13.865Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (21 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | - |
| handoff_type | `text` | **NO** | - | - |
| decision_type | `text` | **NO** | - | - |
| decision | `text` | **NO** | - | - |
| confidence | `text` | **NO** | - | - |
| confidence_score | `integer(32)` | YES | - | - |
| reasoning | `text` | **NO** | - | - |
| context_snapshot | `jsonb` | **NO** | `'{}'::jsonb` | - |
| executed_at | `timestamp with time zone` | YES | - | - |
| execution_result | `jsonb` | YES | - | - |
| execution_duration_ms | `integer(32)` | YES | - | - |
| escalated_to_human | `boolean` | YES | `false` | - |
| human_decision | `text` | YES | - | - |
| human_decision_at | `timestamp with time zone` | YES | - | - |
| human_notes | `text` | YES | - | - |
| model | `text` | YES | `'gpt-5.2'::text` | - |
| tokens_used | `jsonb` | YES | - | - |
| cost_usd | `numeric(10,6)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `shipping_decisions_pkey`: PRIMARY KEY (id)

### Check Constraints
- `shipping_decisions_confidence_check`: CHECK ((confidence = ANY (ARRAY['HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))
- `shipping_decisions_confidence_score_check`: CHECK (((confidence_score >= 0) AND (confidence_score <= 100)))
- `shipping_decisions_decision_check`: CHECK ((decision = ANY (ARRAY['PROCEED'::text, 'ESCALATE'::text, 'DEFER'::text])))
- `shipping_decisions_decision_type_check`: CHECK ((decision_type = ANY (ARRAY['PR_CREATION'::text, 'PR_MERGE'::text, 'BRANCH_CLEANUP'::text])))
- `shipping_decisions_handoff_type_check`: CHECK ((handoff_type = ANY (ARRAY['EXEC-TO-PLAN'::text, 'LEAD-FINAL-APPROVAL'::text])))

## Indexes

- `idx_shipping_decisions_confidence`
  ```sql
  CREATE INDEX idx_shipping_decisions_confidence ON public.shipping_decisions USING btree (confidence)
  ```
- `idx_shipping_decisions_sd`
  ```sql
  CREATE INDEX idx_shipping_decisions_sd ON public.shipping_decisions USING btree (sd_id)
  ```
- `idx_shipping_decisions_time`
  ```sql
  CREATE INDEX idx_shipping_decisions_time ON public.shipping_decisions USING btree (created_at DESC)
  ```
- `idx_shipping_decisions_type`
  ```sql
  CREATE INDEX idx_shipping_decisions_type ON public.shipping_decisions USING btree (decision_type)
  ```
- `shipping_decisions_pkey`
  ```sql
  CREATE UNIQUE INDEX shipping_decisions_pkey ON public.shipping_decisions USING btree (id)
  ```

## RLS Policies

### 1. Allow all for service role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. Allow read for authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
