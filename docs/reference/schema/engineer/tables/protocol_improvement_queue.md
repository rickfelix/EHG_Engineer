# protocol_improvement_queue Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-31T20:56:09.379Z
**Rows**: 63
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (25 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| source_retro_id | `uuid` | YES | - | - |
| source_type | `text` | **NO** | - | - |
| improvement_type | `text` | **NO** | - | - |
| target_table | `text` | **NO** | - | - |
| target_operation | `text` | **NO** | - | - |
| target_key | `text` | YES | - | - |
| payload | `jsonb` | **NO** | - | - |
| target_phase | `text` | YES | - | - |
| description | `text` | **NO** | - | - |
| evidence_count | `integer(32)` | **NO** | `1` | Number of times this improvement pattern has been observed. Incremented when similar improvements are consolidated. |
| status | `text` | **NO** | `'PENDING'::text` | - |
| auto_applicable | `boolean` | YES | `false` | Whether this improvement can be auto-applied. True only for low-risk changes like adding checklist items. |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| reviewed_at | `timestamp with time zone` | YES | - | - |
| reviewed_by | `text` | YES | - | - |
| applied_at | `timestamp with time zone` | YES | - | - |
| effectiveness_score | `integer(32)` | YES | - | Post-application effectiveness score (0-100). Measured by reduction in related issue patterns after application. |
| assigned_sd_id | `character varying(50)` | YES | - | SD that will implement this improvement. Set by /learn command when user approves. |
| assignment_date | `timestamp with time zone` | YES | - | When improvement was assigned to an SD via /learn. |
| risk_tier | `character varying(20)` | YES | `'GOVERNED'::character varying` | Risk classification: IMMUTABLE (never changes), GOVERNED (human approval), AUTO (can auto-apply if criteria met) |
| effectiveness_measured_at | `timestamp with time zone` | YES | - | When effectiveness was measured after applying improvement |
| baseline_metric | `jsonb` | YES | - | Metric values before improvement was applied |
| post_metric | `jsonb` | YES | - | Metric values after improvement was applied |
| rollback_reason | `text` | YES | - | If improvement was rolled back, the reason why |

## Constraints

### Primary Key
- `protocol_improvement_queue_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `protocol_improvement_queue_assigned_sd_id_fkey`: assigned_sd_id → strategic_directives_v2(id)
- `protocol_improvement_queue_source_retro_id_fkey`: source_retro_id → retrospectives(id)

### Check Constraints
- `must_have_db_target`: CHECK (((target_table IS NOT NULL) AND (payload IS NOT NULL)))
- `protocol_improvement_queue_effectiveness_score_check`: CHECK (((effectiveness_score >= 0) AND (effectiveness_score <= 100)))
- `protocol_improvement_queue_improvement_type_check`: CHECK ((improvement_type = ANY (ARRAY['VALIDATION_RULE'::text, 'CHECKLIST_ITEM'::text, 'SKILL_UPDATE'::text, 'PROTOCOL_SECTION'::text, 'SUB_AGENT_CONFIG'::text])))
- `protocol_improvement_queue_risk_tier_check`: CHECK (((risk_tier)::text = ANY ((ARRAY['IMMUTABLE'::character varying, 'GOVERNED'::character varying, 'AUTO'::character varying])::text[])))
- `protocol_improvement_queue_source_type_check`: CHECK ((source_type = ANY (ARRAY['LEAD_TO_PLAN'::text, 'PLAN_TO_EXEC'::text, 'SD_COMPLETION'::text])))
- `protocol_improvement_queue_status_check`: CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'SD_CREATED'::text, 'APPLIED'::text, 'REJECTED'::text, 'SUPERSEDED'::text])))
- `protocol_improvement_queue_target_operation_check`: CHECK ((target_operation = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'UPSERT'::text])))
- `protocol_improvement_queue_target_phase_check`: CHECK ((target_phase = ANY (ARRAY['LEAD'::text, 'PLAN'::text, 'EXEC'::text, 'ALL'::text])))
- `reviewed_fields_complete`: CHECK (((status = 'PENDING'::text) OR (status = 'SD_CREATED'::text) OR ((reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL))))

## Indexes

- `idx_protocol_queue_assigned_sd`
  ```sql
  CREATE INDEX idx_protocol_queue_assigned_sd ON public.protocol_improvement_queue USING btree (assigned_sd_id) WHERE (assigned_sd_id IS NOT NULL)
  ```
- `idx_protocol_queue_evidence`
  ```sql
  CREATE INDEX idx_protocol_queue_evidence ON public.protocol_improvement_queue USING btree (evidence_count DESC)
  ```
- `idx_protocol_queue_phase`
  ```sql
  CREATE INDEX idx_protocol_queue_phase ON public.protocol_improvement_queue USING btree (target_phase)
  ```
- `idx_protocol_queue_source`
  ```sql
  CREATE INDEX idx_protocol_queue_source ON public.protocol_improvement_queue USING btree (source_retro_id)
  ```
- `idx_protocol_queue_status`
  ```sql
  CREATE INDEX idx_protocol_queue_status ON public.protocol_improvement_queue USING btree (status)
  ```
- `idx_protocol_queue_target`
  ```sql
  CREATE INDEX idx_protocol_queue_target ON public.protocol_improvement_queue USING btree (target_table)
  ```
- `idx_protocol_queue_type`
  ```sql
  CREATE INDEX idx_protocol_queue_type ON public.protocol_improvement_queue USING btree (improvement_type)
  ```
- `protocol_improvement_queue_pkey`
  ```sql
  CREATE UNIQUE INDEX protocol_improvement_queue_pkey ON public.protocol_improvement_queue USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_protocol_queue (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. protocol_improvement_queue_anon_denied (ALL)

- **Roles**: {anon}
- **Using**: `false`
- **With Check**: `false`

### 3. protocol_improvement_queue_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. protocol_improvement_queue_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 5. service_role_all_protocol_queue (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_protocol_improvement_audit

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION trigger_protocol_improvement_audit()`

### trg_protocol_improvement_audit

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION trigger_protocol_improvement_audit()`

---

[← Back to Schema Overview](../database-schema-overview.md)
