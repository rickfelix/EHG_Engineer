# sd_phase_handoffs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T15:58:55.379Z
**Rows**: 5,041
**RLS**: Enabled (8 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (23 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(50)` | **NO** | - | - |
| from_phase | `character varying(20)` | **NO** | - | - |
| to_phase | `character varying(20)` | **NO** | - | - |
| handoff_type | `character varying(50)` | **NO** | - | - |
| status | `character varying(20)` | **NO** | `'pending_acceptance'::character varying` | - |
| executive_summary | `text` | **NO** | - | Element 1: High-level summary of handoff |
| deliverables_manifest | `text` | **NO** | - | Element 2: Complete list of deliverables |
| key_decisions | `text` | **NO** | - | Element 3: Critical decisions made during phase |
| known_issues | `text` | **NO** | - | Element 4: Issues and risks identified |
| resource_utilization | `text` | **NO** | - | Element 5: Resources used during phase |
| action_items | `text` | **NO** | - | Element 6: Action items for receiving phase |
| completeness_report | `text` | YES | - | Element 7: Completeness assessment |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| rejection_reason | `text` | YES | - | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| accepted_at | `timestamp without time zone` | YES | - | - |
| rejected_at | `timestamp without time zone` | YES | - | - |
| created_by | `character varying(50)` | YES | `'LEO_AGENT'::character varying` | - |
| template_id | `text` | YES | - | Optional handoff template reference for standardized handoffs. Allows handoff system to use predefined templates for consistency. |
| validation_details | `jsonb` | YES | `'{}'::jsonb` | Detailed validation results from handoff verification including sub-agent outputs, gate checks, and quality metrics. |
| validation_score | `integer(32)` | YES | - | Quality score from handoff validation (0-100). Higher scores indicate better handoff quality. |
| validation_passed | `boolean` | YES | - | Boolean indicating whether handoff passed all validation gates. NULL = not yet validated. |

## Constraints

### Primary Key
- `sd_phase_handoffs_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_phase_handoffs_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Unique Constraints
- `sd_phase_handoffs_sd_id_from_phase_to_phase_created_at_key`: UNIQUE (sd_id, from_phase, to_phase, created_at)

### Check Constraints
- `chk_handoff_validation_threshold`: CHECK (((validation_score IS NULL) OR ((status)::text = 'blocked'::text) OR ((validation_score >= 0) AND (validation_score <= 100))))
- `sd_phase_handoffs_from_phase_check`: CHECK (((from_phase)::text = ANY ((ARRAY['LEAD'::character varying, 'PLAN'::character varying, 'EXEC'::character varying])::text[])))
- `sd_phase_handoffs_handoff_type_check`: CHECK (((handoff_type)::text = ANY ((ARRAY['LEAD-TO-PLAN'::character varying, 'PLAN-TO-EXEC'::character varying, 'EXEC-TO-PLAN'::character varying, 'PLAN-TO-LEAD'::character varying])::text[])))
- `sd_phase_handoffs_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending_acceptance'::character varying, 'accepted'::character varying, 'rejected'::character varying, 'blocked'::character varying])::text[])))
- `sd_phase_handoffs_to_phase_check`: CHECK (((to_phase)::text = ANY ((ARRAY['LEAD'::character varying, 'PLAN'::character varying, 'EXEC'::character varying])::text[])))
- `sd_phase_handoffs_validation_score_check`: CHECK (((validation_score >= 0) AND (validation_score <= 100)))
- `validation_details_max_size`: CHECK (((validation_details IS NULL) OR (length((validation_details)::text) <= 102400)))

## Indexes

- `idx_sd_phase_handoffs_blocked`
  ```sql
  CREATE INDEX idx_sd_phase_handoffs_blocked ON public.sd_phase_handoffs USING btree (sd_id, handoff_type) WHERE ((status)::text = 'blocked'::text)
  ```
- `idx_sd_phase_handoffs_created`
  ```sql
  CREATE INDEX idx_sd_phase_handoffs_created ON public.sd_phase_handoffs USING btree (created_at DESC)
  ```
- `idx_sd_phase_handoffs_sd_id`
  ```sql
  CREATE INDEX idx_sd_phase_handoffs_sd_id ON public.sd_phase_handoffs USING btree (sd_id)
  ```
- `idx_sd_phase_handoffs_status`
  ```sql
  CREATE INDEX idx_sd_phase_handoffs_status ON public.sd_phase_handoffs USING btree (status)
  ```
- `idx_sd_phase_handoffs_template`
  ```sql
  CREATE INDEX idx_sd_phase_handoffs_template ON public.sd_phase_handoffs USING btree (template_id) WHERE (template_id IS NOT NULL)
  ```
- `idx_sd_phase_handoffs_type`
  ```sql
  CREATE INDEX idx_sd_phase_handoffs_type ON public.sd_phase_handoffs USING btree (handoff_type)
  ```
- `idx_sd_phase_handoffs_validation_details`
  ```sql
  CREATE INDEX idx_sd_phase_handoffs_validation_details ON public.sd_phase_handoffs USING gin (validation_details) WHERE ((validation_details IS NOT NULL) AND (validation_details <> '{}'::jsonb))
  ```
- `idx_sd_phase_handoffs_validation_status`
  ```sql
  CREATE INDEX idx_sd_phase_handoffs_validation_status ON public.sd_phase_handoffs USING btree (validation_passed, validation_score) WHERE (validation_passed IS NOT NULL)
  ```
- `sd_phase_handoffs_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_phase_handoffs_pkey ON public.sd_phase_handoffs USING btree (id)
  ```
- `sd_phase_handoffs_sd_id_from_phase_to_phase_created_at_key`
  ```sql
  CREATE UNIQUE INDEX sd_phase_handoffs_sd_id_from_phase_to_phase_created_at_key ON public.sd_phase_handoffs USING btree (sd_id, from_phase, to_phase, created_at)
  ```

## RLS Policies

### 1. Allow anon insert sd_phase_handoffs (INSERT)

- **Roles**: {anon}
- **With Check**: `true`

### 2. Allow anon read sd_phase_handoffs (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 3. Allow anon update sd_phase_handoffs (UPDATE)

- **Roles**: {anon}
- **Using**: `true`
- **With Check**: `true`

### 4. Allow authenticated delete sd_phase_handoffs (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 5. Allow authenticated insert sd_phase_handoffs (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 6. Allow authenticated read sd_phase_handoffs (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 7. Allow authenticated update sd_phase_handoffs (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 8. Allow service role all sd_phase_handoffs (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### enforce_handoff_creation

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION enforce_handoff_system()`

### trigger_handoff_accepted_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION auto_update_handoff_accepted_at()`

### trigger_handoff_rejected_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION auto_update_handoff_rejected_at()`

### trigger_protect_migrated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION protect_migrated_handoffs()`

### trigger_sd_progress_recalc

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION auto_recalculate_sd_progress()`

### trigger_verify_deliverables_before_handoff

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION verify_deliverables_before_handoff()`

### trigger_verify_deliverables_before_handoff_insert

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION verify_deliverables_before_handoff()`

### validate_handoff_trigger

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION auto_validate_handoff()`

### validate_handoff_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION auto_validate_handoff()`

## Usage Examples

_Common query patterns for this table:_


```javascript
// Get handoffs for SD
const { data, error } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .eq('sd_id', 'SD-XXX-001')
  .order('created_at', { ascending: false });

// Get specific handoff type
const { data, error } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .eq('sd_id', 'SD-XXX-001')
  .eq('handoff_type', 'exec_to_plan')
  .single();
```
---

[← Back to Schema Overview](../database-schema-overview.md)
