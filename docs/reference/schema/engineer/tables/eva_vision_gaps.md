# eva_vision_gaps Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-20T19:58:57.591Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| vision_score_id | `uuid` | YES | - | - |
| sd_id | `text` | **NO** | - | - |
| dimension_key | `text` | **NO** | - | - |
| dimension_name | `text` | YES | - | - |
| dimension_score | `numeric(5,2)` | **NO** | - | - |
| gap_description | `text` | YES | - | - |
| severity | `text` | **NO** | `'medium'::text` | - |
| status | `text` | **NO** | `'open'::text` | - |
| corrective_sd_id | `text` | YES | - | - |
| accepted_at | `timestamp with time zone` | YES | - | - |
| accepted_by | `text` | YES | - | - |
| acceptance_rationale | `text` | YES | - | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| resolved_by | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_vision_gaps_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_vision_gaps_vision_score_id_fkey`: vision_score_id → eva_vision_scores(id)

### Check Constraints
- `eva_vision_gaps_severity_check`: CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])))
- `eva_vision_gaps_status_check`: CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text, 'wont_fix'::text, 'accepted'::text])))

## Indexes

- `eva_vision_gaps_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_vision_gaps_pkey ON public.eva_vision_gaps USING btree (id)
  ```
- `idx_eva_vision_gaps_dimension_key`
  ```sql
  CREATE INDEX idx_eva_vision_gaps_dimension_key ON public.eva_vision_gaps USING btree (dimension_key)
  ```
- `idx_eva_vision_gaps_sd_id`
  ```sql
  CREATE INDEX idx_eva_vision_gaps_sd_id ON public.eva_vision_gaps USING btree (sd_id)
  ```
- `idx_eva_vision_gaps_status`
  ```sql
  CREATE INDEX idx_eva_vision_gaps_status ON public.eva_vision_gaps USING btree (status) WHERE (status <> ALL (ARRAY['resolved'::text, 'closed'::text]))
  ```
- `idx_eva_vision_gaps_vision_score_id`
  ```sql
  CREATE INDEX idx_eva_vision_gaps_vision_score_id ON public.eva_vision_gaps USING btree (vision_score_id)
  ```

## RLS Policies

### 1. eva_vision_gaps_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. eva_vision_gaps_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
