# runtime_audits Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-01T14:20:42.746Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| audit_file_path | `text` | **NO** | - | - |
| audit_date | `date` | **NO** | - | - |
| target_application | `character varying(50)` | YES | `'EHG'::character varying` | - |
| total_findings | `integer(32)` | YES | - | - |
| sd_created_count | `integer(32)` | YES | - | - |
| deferred_count | `integer(32)` | YES | - | - |
| wont_fix_count | `integer(32)` | YES | - | - |
| needs_discovery_count | `integer(32)` | YES | - | - |
| duplicate_count | `integer(32)` | YES | - | - |
| coverage_pct | `numeric(5,2)` | YES | - | - |
| triangulation_consensus_rate | `numeric(5,2)` | YES | - | - |
| verbatim_preservation_rate | `numeric(5,2)` | YES | - | - |
| time_to_triage_minutes | `integer(32)` | YES | - | - |
| time_to_sd_minutes | `integer(32)` | YES | - | - |
| created_by | `character varying(100)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| closed_at | `timestamp with time zone` | YES | - | - |
| status | `character varying(20)` | YES | `'in_progress'::character varying` | - |

## Constraints

### Primary Key
- `runtime_audits_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `runtime_audits_audit_file_path_key`: UNIQUE (audit_file_path)

### Check Constraints
- `runtime_audits_status_check`: CHECK (((status)::text = ANY ((ARRAY['in_progress'::character varying, 'triaged'::character varying, 'sd_created'::character varying, 'retro_complete'::character varying, 'closed'::character varying])::text[])))

## Indexes

- `runtime_audits_audit_file_path_key`
  ```sql
  CREATE UNIQUE INDEX runtime_audits_audit_file_path_key ON public.runtime_audits USING btree (audit_file_path)
  ```
- `runtime_audits_pkey`
  ```sql
  CREATE UNIQUE INDEX runtime_audits_pkey ON public.runtime_audits USING btree (id)
  ```

## RLS Policies

### 1. Allow delete for authenticated (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. runtime_audits_insert (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 3. runtime_audits_select (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 4. runtime_audits_update (UPDATE)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
