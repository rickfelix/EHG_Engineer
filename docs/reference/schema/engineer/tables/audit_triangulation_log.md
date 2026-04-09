# audit_triangulation_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-09T00:36:32.652Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| audit_id | `uuid` | YES | - | - |
| issue_id | `character varying(50)` | **NO** | - | - |
| issue_verbatim | `text` | YES | - | - |
| claude_analysis | `text` | YES | - | - |
| chatgpt_analysis | `text` | YES | - | - |
| antigravity_analysis | `text` | YES | - | - |
| consensus_score | `integer(32)` | YES | - | - |
| consensus_type | `character varying(20)` | YES | - | - |
| final_decision | `text` | YES | - | - |
| triangulated_root_cause | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `audit_triangulation_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `audit_triangulation_log_audit_id_fkey`: audit_id → runtime_audits(id)

### Check Constraints
- `audit_triangulation_log_consensus_score_check`: CHECK (((consensus_score >= 0) AND (consensus_score <= 100)))
- `audit_triangulation_log_consensus_type_check`: CHECK (((consensus_type)::text = ANY ((ARRAY['HIGH'::character varying, 'MEDIUM'::character varying, 'LOW'::character varying, 'DIVERGENT'::character varying])::text[])))

## Indexes

- `audit_triangulation_log_pkey`
  ```sql
  CREATE UNIQUE INDEX audit_triangulation_log_pkey ON public.audit_triangulation_log USING btree (id)
  ```

## RLS Policies

### 1. service_role_insert_audit_triangulation_log (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 2. service_role_select_audit_triangulation_log (SELECT)

- **Roles**: {service_role}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
