# venture_stages Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-06-03T20:43:46.054Z
**Rows**: 26
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (21 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| stage_number | `integer(32)` | **NO** | - | - |
| stage_name | `text` | **NO** | - | - |
| stage_key | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| phase_number | `integer(32)` | **NO** | - | - |
| phase_name | `text` | **NO** | - | - |
| chunk | `text` | **NO** | - | - |
| gate_type | `text` | **NO** | `'none'::text` | - |
| review_mode | `text` | **NO** | `'auto'::text` | - |
| work_type | `text` | **NO** | - | - |
| sd_required | `boolean` | **NO** | `false` | TRUE means a per-venture Strategic Directive is generated for this stage. This is genuinely true ONLY for S19=BUILD (the lifecycle-sd-bridge build tree). The column is VESTIGIAL/INFORMATIONAL: no runtime code branches on this boolean — all behavioral classification keys off work_type instead (work_type='sd_required' is the authoritative signal; the monitor's SD_REQUIRED guard and assertSdRequiredStagesMatchCanonical read work_type, not this boolean). Historically loosely coupled (S14/S15 are work_type='artifact_only' yet were sd_required=true). SD-LEO-INFRA-CONFIG-HONESTY-RECONCILE-001. |
| sd_suffix | `text` | YES | - | Vestigial naming label (e.g. BRAND/MARKETING/BUILD) intended as an SD-key suffix. Has NO runtime reader — get_sd_required_stages() exposes it but is never called from application code. Informational/historical only. SD-LEO-INFRA-CONFIG-HONESTY-RECONCILE-001. |
| advisory_enabled | `boolean` | **NO** | `false` | - |
| depends_on | `ARRAY` | **NO** | `'{}'::integer[]` | - |
| required_artifacts | `ARRAY` | **NO** | `'{}'::text[]` | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| component_path | `text` | YES | - | New app-only column. NULL until backfilled by Child D. |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| gate_label | `text` | YES | - | App-only: human-readable gate caption mirrored into ehg venture-workflow.ts gateLabel (9 gate stages). Backend does not read this. SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-D. |
| app_description | `text` | YES | - | App-only: frontend stage description mirrored into ehg venture-workflow.ts description. Distinct from venture_stages.description (the backend-read column). SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-D. |

## Constraints

### Primary Key
- `venture_stages_pkey`: PRIMARY KEY (stage_number)

### Unique Constraints
- `venture_stages_stage_key_key`: UNIQUE (stage_key)

### Check Constraints
- `venture_stages_canonical_rule_check`: CHECK (canonical_rule(work_type, gate_type))
- `venture_stages_gate_type_check`: CHECK ((gate_type = ANY (ARRAY['none'::text, 'kill'::text, 'promotion'::text])))
- `venture_stages_review_mode_check`: CHECK ((review_mode = ANY (ARRAY['auto'::text, 'review'::text, 'manual'::text])))
- `venture_stages_work_type_check`: CHECK ((work_type = ANY (ARRAY['artifact_only'::text, 'automated_check'::text, 'decision_gate'::text, 'sd_required'::text])))

## Indexes

- `venture_stages_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_stages_pkey ON public.venture_stages USING btree (stage_number)
  ```
- `venture_stages_stage_key_key`
  ```sql
  CREATE UNIQUE INDEX venture_stages_stage_key_key ON public.venture_stages USING btree (stage_key)
  ```

## RLS Policies

### 1. deny_write_venture_stages (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `false`

### 2. select_venture_stages (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trg_venture_stages_audit

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION fn_venture_stages_audit_trigger()`

### trg_venture_stages_set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
