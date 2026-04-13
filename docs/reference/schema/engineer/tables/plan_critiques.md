# plan_critiques Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-13T15:18:40.578Z
**Rows**: 38
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | - |
| prd_id | `text` | **NO** | - | - |
| findings | `jsonb` | **NO** | `'[]'::jsonb` | Array of {severity, category, message, location, suggested_fix} |
| overall_severity | `text` | **NO** | - | block|warn|note|pass — Phase 1 advisory does not act on block |
| override_reason | `text` | YES | - | Phase 2 reserved: chairman override rationale when block was bypassed |
| override_by | `text` | YES | - | - |
| model_used | `text` | YES | - | - |
| token_usage | `jsonb` | YES | - | LLM token usage for cost tracking: {input_tokens, output_tokens} |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `plan_critiques_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `plan_critiques_prd_id_fkey`: prd_id → product_requirements_v2(id)
- `plan_critiques_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `plan_critiques_overall_severity_check`: CHECK ((overall_severity = ANY (ARRAY['block'::text, 'warn'::text, 'note'::text, 'pass'::text])))

## Indexes

- `idx_plan_critiques_created_at`
  ```sql
  CREATE INDEX idx_plan_critiques_created_at ON public.plan_critiques USING brin (created_at)
  ```
- `idx_plan_critiques_sd_id`
  ```sql
  CREATE INDEX idx_plan_critiques_sd_id ON public.plan_critiques USING btree (sd_id)
  ```
- `idx_plan_critiques_severity`
  ```sql
  CREATE INDEX idx_plan_critiques_severity ON public.plan_critiques USING btree (overall_severity)
  ```
- `plan_critiques_pkey`
  ```sql
  CREATE UNIQUE INDEX plan_critiques_pkey ON public.plan_critiques USING btree (id)
  ```

## RLS Policies

### 1. plan_critiques_select_authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. plan_critiques_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
