# sd_type_change_audit Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-25T00:34:15.838Z
**Rows**: 26
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (20 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(100)` | **NO** | - | - |
| sd_legacy_id | `character varying(100)` | YES | - | - |
| from_type | `character varying(50)` | **NO** | - | - |
| to_type | `character varying(50)` | **NO** | - | - |
| risk_score | `integer(32)` | YES | - | - |
| risk_level | `character varying(20)` | YES | - | - |
| risk_factors | `jsonb` | YES | `'[]'::jsonb` | - |
| blocked | `boolean` | YES | `false` | - |
| approval_required | `boolean` | YES | `false` | - |
| approved_by | `character varying(100)` | YES | - | - |
| approved_at | `timestamp with time zone` | YES | - | - |
| rejection_reason | `text` | YES | - | - |
| sd_phase | `character varying(50)` | YES | - | - |
| sd_status | `character varying(50)` | YES | - | - |
| user_story_count | `integer(32)` | YES | `0` | - |
| deliverable_count | `integer(32)` | YES | `0` | - |
| completed_deliverables | `integer(32)` | YES | `0` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `character varying(100)` | YES | `'SYSTEM'::character varying` | - |

## Constraints

### Primary Key
- `sd_type_change_audit_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_type_change_audit_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `sd_type_change_audit_risk_level_check`: CHECK (((risk_level)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying, 'CRITICAL'::character varying])::text[])))
- `sd_type_change_audit_risk_score_check`: CHECK (((risk_score >= 0) AND (risk_score <= 100)))

## Indexes

- `idx_sd_type_change_audit_blocked`
  ```sql
  CREATE INDEX idx_sd_type_change_audit_blocked ON public.sd_type_change_audit USING btree (blocked)
  ```
- `idx_sd_type_change_audit_risk_level`
  ```sql
  CREATE INDEX idx_sd_type_change_audit_risk_level ON public.sd_type_change_audit USING btree (risk_level)
  ```
- `idx_sd_type_change_audit_sd_id`
  ```sql
  CREATE INDEX idx_sd_type_change_audit_sd_id ON public.sd_type_change_audit USING btree (sd_id)
  ```
- `sd_type_change_audit_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_type_change_audit_pkey ON public.sd_type_change_audit USING btree (id)
  ```

## RLS Policies

### 1. Allow select for anon (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_insert_sd_type_change_audit (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. authenticated_select_sd_type_change_audit (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
