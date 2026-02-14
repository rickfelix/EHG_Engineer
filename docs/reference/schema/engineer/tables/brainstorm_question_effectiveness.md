# brainstorm_question_effectiveness Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T18:28:22.998Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| domain | `text` | **NO** | - | - |
| question_id | `text` | **NO** | - | - |
| effectiveness_score | `numeric(5,3)` | YES | `0.5` | - |
| total_sessions | `integer(32)` | YES | `0` | - |
| answered_count | `integer(32)` | YES | `0` | - |
| skipped_count | `integer(32)` | YES | `0` | - |
| avg_answer_length | `numeric(8,1)` | YES | `0` | - |
| led_to_action_count | `integer(32)` | YES | `0` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `brainstorm_question_effectiveness_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `brainstorm_question_effectiveness_domain_question_id_key`: UNIQUE (domain, question_id)

### Check Constraints
- `brainstorm_question_effectiveness_effectiveness_score_check`: CHECK (((effectiveness_score >= (0)::numeric) AND (effectiveness_score <= (1)::numeric)))

## Indexes

- `brainstorm_question_effectiveness_domain_question_id_key`
  ```sql
  CREATE UNIQUE INDEX brainstorm_question_effectiveness_domain_question_id_key ON public.brainstorm_question_effectiveness USING btree (domain, question_id)
  ```
- `brainstorm_question_effectiveness_pkey`
  ```sql
  CREATE UNIQUE INDEX brainstorm_question_effectiveness_pkey ON public.brainstorm_question_effectiveness USING btree (id)
  ```
- `idx_brainstorm_q_effectiveness_domain`
  ```sql
  CREATE INDEX idx_brainstorm_q_effectiveness_domain ON public.brainstorm_question_effectiveness USING btree (domain)
  ```
- `idx_brainstorm_q_effectiveness_score`
  ```sql
  CREATE INDEX idx_brainstorm_q_effectiveness_score ON public.brainstorm_question_effectiveness USING btree (effectiveness_score DESC)
  ```
- `idx_brainstorm_q_effectiveness_skip_rate`
  ```sql
  CREATE INDEX idx_brainstorm_q_effectiveness_skip_rate ON public.brainstorm_question_effectiveness USING btree ((
CASE
    WHEN (total_sessions > 0) THEN ((skipped_count)::numeric / (total_sessions)::numeric)
    ELSE (0)::numeric
END) DESC)
  ```

## RLS Policies

### 1. manage_brainstorm_q_effectiveness (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. select_brainstorm_q_effectiveness (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trg_brainstorm_q_effectiveness_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_brainstorm_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
