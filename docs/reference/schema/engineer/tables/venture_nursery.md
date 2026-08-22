# venture_nursery Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 16
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| brief_id | `uuid` | YES | - | - |
| name | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| maturity_level | `text` | **NO** | `'seed'::text` | - |
| trigger_conditions | `jsonb` | YES | `'[]'::jsonb` | - |
| current_score | `numeric(5,2)` | YES | - | - |
| score_history | `jsonb` | YES | `'[]'::jsonb` | - |
| last_evaluated_at | `timestamp with time zone` | YES | - | - |
| next_evaluation_at | `timestamp with time zone` | YES | - | - |
| evaluation_interval_days | `integer(32)` | YES | `30` | - |
| promoted_to_venture_id | `uuid` | YES | - | - |
| promoted_at | `timestamp with time zone` | YES | - | - |
| source_type | `text` | YES | - | - |
| source_ref | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| pbn_verdict | `jsonb` | YES | - | SD-LEO-FEAT-PROVEN-BETTER-NEW-001. The Proven/Better/New gate verdict from THIS ROW's own park (TR-8, corrected post-PLAN): this column is NEVER updated in place after insert — reactivateVenture() does not touch it, and a re-check at unpark writes its fresh verdict to a DIFFERENT destination (a brand-new venture_nursery row on REJECT/TRIM, or the resulting venture's metadata.stage_zero.pbn_verdict on PASS). History therefore survives by immutability, not by an append-only log compensating for an overwrite. nursery_evaluation_log via recordNurseryEvaluation() (TR-5) is still the independently- queryable audit trail — query it for "every verdict this idea has ever received across reactivations", not this column, which only ever answers "what did THIS row score". Shape: {proven:{mechanic,citations,coverage}, better:{hypothesis,friction_point,citations,coverage}, new:{wedge,wedge_count,coverage}, verdict:PASS|REJECT|TRIM, measured_at:ISO-8601 UTC, rule_trace:[], scoring_error:string|null}. coverage is a BOOLEAN (pbn-gate.js resolveBucketCoverage), NOT a fraction or percentage. NULL = never gated (distinct from any verdict). scoring_error is set only when the LLM scorer failed and buckets were forced fail-closed -- a REJECT with scoring_error set is NOT a merit rejection, see the SCORING_FAILED rule_trace entry (post-EXEC-TO-PLAN adversarial review finding). verdict is CHECK-constrained; the rest of the shape is by convention. |

## Constraints

### Primary Key
- `venture_nursery_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_nursery_brief_id_fkey`: brief_id → venture_briefs(id)
- `venture_nursery_promoted_to_venture_id_fkey`: promoted_to_venture_id → ventures(id)

### Check Constraints
- `venture_nursery_maturity_level_check`: CHECK ((maturity_level = ANY (ARRAY['seed'::text, 'sprout'::text, 'ready'::text])))
- `venture_nursery_pbn_verdict_shape_check`: CHECK (((pbn_verdict IS NULL) OR ((jsonb_typeof(pbn_verdict) = 'object'::text) AND (pbn_verdict ? 'verdict'::text) AND ((pbn_verdict ->> 'verdict'::text) = ANY (ARRAY['PASS'::text, 'REJECT'::text, 'TRIM'::text])) AND ((NOT (pbn_verdict ? 'rule_trace'::text)) OR (jsonb_typeof((pbn_verdict -> 'rule_trace'::text)) = 'array'::text)))))
- `venture_nursery_source_type_check`: CHECK ((source_type = ANY (ARRAY['brainstorm'::text, 'todoist'::text, 'youtube'::text, 'competitor_analysis'::text, 'discovery_mode'::text, 'manual'::text])))

## Indexes

- `idx_venture_nursery_brief`
  ```sql
  CREATE INDEX idx_venture_nursery_brief ON public.venture_nursery USING btree (brief_id)
  ```
- `idx_venture_nursery_maturity`
  ```sql
  CREATE INDEX idx_venture_nursery_maturity ON public.venture_nursery USING btree (maturity_level)
  ```
- `idx_venture_nursery_next_eval`
  ```sql
  CREATE INDEX idx_venture_nursery_next_eval ON public.venture_nursery USING btree (next_evaluation_at) WHERE (promoted_to_venture_id IS NULL)
  ```
- `venture_nursery_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_nursery_pkey ON public.venture_nursery USING btree (id)
  ```

## RLS Policies

### 1. venture_nursery_service_all (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
