# sd_proposals Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-15T13:25:26.330Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (28 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| target_application | `text` | YES | - | - |
| title | `character varying(200)` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| proposed_scope | `jsonb` | **NO** | `'{}'::jsonb` | - |
| evidence_data | `jsonb` | YES | `'{}'::jsonb` | - |
| trigger_type | `character varying(40)` | **NO** | - | - |
| trigger_source_id | `text` | YES | - | - |
| trigger_event_type | `character varying(60)` | YES | - | - |
| trigger_trace_id | `uuid` | YES | - | - |
| correlation_id | `uuid` | YES | - | - |
| created_by | `text` | **NO** | `'manual'::text` | - |
| confidence_score | `numeric(3,2)` | **NO** | - | - |
| impact_score | `numeric(3,2)` | **NO** | - | - |
| urgency_level | `character varying(20)` | **NO** | `'medium'::character varying` | - |
| dedupe_key | `text` | **NO** | - | - |
| status | `character varying(20)` | **NO** | `'pending'::character varying` | - |
| seen_at | `timestamp with time zone` | YES | - | - |
| approved_at | `timestamp with time zone` | YES | - | - |
| dismissed_at | `timestamp with time zone` | YES | - | - |
| snoozed_until | `timestamp with time zone` | YES | - | - |
| dismissal_reason | `character varying(30)` | YES | - | - |
| created_sd_id | `text` | YES | - | - |
| linked_alert_id | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| expires_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `sd_proposals_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_proposals_created_sd_id_fkey`: created_sd_id → strategic_directives_v2(id)
- `sd_proposals_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `check_dismissal_reason`: CHECK (((dismissal_reason IS NULL) OR ((dismissal_reason)::text = ANY ((ARRAY['not_relevant'::character varying, 'wrong_timing'::character varying, 'duplicate'::character varying, 'too_small'::character varying, 'too_large'::character varying, 'already_fixed'::character varying, 'other'::character varying])::text[]))))
- `check_status`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'seen'::character varying, 'approved'::character varying, 'dismissed'::character varying, 'snoozed'::character varying, 'expired'::character varying])::text[])))
- `check_trigger_type`: CHECK (((trigger_type)::text = ANY ((ARRAY['retrospective_pattern'::character varying, 'code_health'::character varying, 'dependency_update'::character varying, 'manual'::character varying])::text[])))
- `check_urgency_level`: CHECK (((urgency_level)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'critical'::character varying])::text[])))
- `sd_proposals_confidence_score_check`: CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)))
- `sd_proposals_impact_score_check`: CHECK (((impact_score >= (0)::numeric) AND (impact_score <= (1)::numeric)))

## Indexes

- `idx_sd_proposals_dedupe_active`
  ```sql
  CREATE UNIQUE INDEX idx_sd_proposals_dedupe_active ON public.sd_proposals USING btree (dedupe_key) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'seen'::character varying, 'snoozed'::character varying])::text[]))
  ```
- `idx_sd_proposals_expires`
  ```sql
  CREATE INDEX idx_sd_proposals_expires ON public.sd_proposals USING btree (expires_at) WHERE (((status)::text = ANY ((ARRAY['pending'::character varying, 'seen'::character varying, 'snoozed'::character varying])::text[])) AND (expires_at IS NOT NULL))
  ```
- `idx_sd_proposals_pending`
  ```sql
  CREATE INDEX idx_sd_proposals_pending ON public.sd_proposals USING btree (status, urgency_level DESC, created_at DESC) WHERE ((status)::text = 'pending'::text)
  ```
- `idx_sd_proposals_trigger`
  ```sql
  CREATE INDEX idx_sd_proposals_trigger ON public.sd_proposals USING btree (trigger_type, created_at DESC)
  ```
- `idx_sd_proposals_venture`
  ```sql
  CREATE INDEX idx_sd_proposals_venture ON public.sd_proposals USING btree (venture_id, status, created_at DESC) WHERE (venture_id IS NOT NULL)
  ```
- `sd_proposals_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_proposals_pkey ON public.sd_proposals USING btree (id)
  ```

## RLS Policies

### 1. sd_proposals_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`

### 2. sd_proposals_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 3. sd_proposals_update_lifecycle (UPDATE)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`
- **With Check**: `fn_is_chairman()`

## Triggers

### trg_set_proposal_expiration

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION fn_set_proposal_expiration()`

### trg_set_proposal_expiration

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION fn_set_proposal_expiration()`

---

[← Back to Schema Overview](../database-schema-overview.md)
