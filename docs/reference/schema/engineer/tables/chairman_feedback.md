# chairman_feedback Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-10T04:01:49.496Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (32 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| target_id | `uuid` | **NO** | - | - |
| target_type | `character varying(20)` | **NO** | - | - |
| original_audio_url | `text` | YES | - | - |
| transcript_text | `text` | **NO** | - | - |
| chairman_edited | `text` | YES | - | - |
| audio_length | `integer(32)` | YES | - | - |
| audio_quality | `character varying(10)` | YES | - | - |
| performance_drive_phase | `character varying(20)` | YES | `'strategy'::character varying` | - |
| portfolio_company | `character varying(100)` | YES | - | - |
| cross_company_impact | `ARRAY` | YES | `'{}'::text[]` | - |
| priority_level | `character varying(15)` | YES | `'tactical'::character varying` | - |
| executive_decision | `boolean` | YES | `false` | - |
| for_lead | `text` | YES | - | - |
| for_plan | `text` | YES | - | - |
| for_exec | `text` | YES | - | - |
| for_eva | `text` | YES | - | - |
| dashboard_category | `character varying(50)` | YES | - | - |
| alert_level | `character varying(10)` | YES | `'info'::character varying` | - |
| follow_up_required | `timestamp with time zone` | YES | - | - |
| related_metrics | `ARRAY` | YES | `'{}'::text[]` | - |
| sentiment | `character varying(20)` | YES | - | - |
| action_required | `boolean` | YES | `false` | - |
| processing_status | `character varying(20)` | YES | `'pending'::character varying` | - |
| created_by | `uuid` | YES | - | - |
| company_id | `uuid` | YES | - | - |
| role | `character varying(20)` | YES | `'chairman'::character varying` | - |
| context | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| acknowledged_at | `timestamp with time zone` | YES | - | - |
| processed_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `chairman_feedback_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `chairman_feedback_company_id_fkey`: company_id → companies(id)

### Check Constraints
- `chairman_feedback_alert_level_check`: CHECK (((alert_level)::text = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'critical'::character varying])::text[])))
- `chairman_feedback_audio_quality_check`: CHECK (((audio_quality)::text = ANY ((ARRAY['high'::character varying, 'medium'::character varying, 'low'::character varying])::text[])))
- `chairman_feedback_performance_drive_phase_check`: CHECK (((performance_drive_phase)::text = ANY ((ARRAY['strategy'::character varying, 'goals'::character varying, 'planning'::character varying, 'implementation'::character varying])::text[])))
- `chairman_feedback_priority_level_check`: CHECK (((priority_level)::text = ANY ((ARRAY['strategic'::character varying, 'tactical'::character varying, 'operational'::character varying])::text[])))
- `chairman_feedback_processing_status_check`: CHECK (((processing_status)::text = ANY ((ARRAY['pending'::character varying, 'processed'::character varying, 'archived'::character varying])::text[])))
- `chairman_feedback_target_type_check`: CHECK (((target_type)::text = ANY ((ARRAY['idea'::character varying, 'review'::character varying, 'validation'::character varying, 'portfolio-item'::character varying])::text[])))

## Indexes

- `chairman_feedback_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_feedback_pkey ON public.chairman_feedback USING btree (id)
  ```
- `idx_chairman_feedback_company_id`
  ```sql
  CREATE INDEX idx_chairman_feedback_company_id ON public.chairman_feedback USING btree (company_id)
  ```
- `idx_chairman_feedback_created_at`
  ```sql
  CREATE INDEX idx_chairman_feedback_created_at ON public.chairman_feedback USING btree (created_at DESC)
  ```
- `idx_chairman_feedback_target`
  ```sql
  CREATE INDEX idx_chairman_feedback_target ON public.chairman_feedback USING btree (target_id, target_type)
  ```

## RLS Policies

### 1. Allow authenticated users to delete chairman_feedback (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Allow authenticated users to insert chairman_feedback (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. Allow authenticated users to update chairman_feedback (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 4. authenticated_select_chairman_feedback (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
