# audit_finding_sd_mapping Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-15T13:25:26.330Z
**Rows**: 76
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| audit_file_path | `text` | **NO** | - | - |
| original_issue_id | `character varying(20)` | **NO** | - | - |
| audit_date | `date` | **NO** | - | - |
| source_line_number | `integer(32)` | YES | - | - |
| audit_content_hash | `character varying(64)` | YES | - | - |
| ingested_at | `timestamp with time zone` | YES | `now()` | - |
| ingested_by | `character varying(100)` | YES | - | - |
| verbatim_text | `text` | **NO** | - | - |
| issue_type | `character varying(20)` | **NO** | - | - |
| severity | `character varying(20)` | YES | - | - |
| route_path | `text` | YES | - | - |
| duplicate_of_issue_id | `character varying(20)` | YES | - | - |
| disposition | `USER-DEFINED` | **NO** | `'pending'::audit_disposition` | - |
| disposition_reason | `text` | YES | - | - |
| disposition_by | `character varying(100)` | YES | - | - |
| disposition_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `audit_finding_sd_mapping_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `audit_finding_sd_mapping_audit_file_path_original_issue_id_key`: UNIQUE (audit_file_path, original_issue_id)

## Indexes

- `audit_finding_sd_mapping_audit_file_path_original_issue_id_key`
  ```sql
  CREATE UNIQUE INDEX audit_finding_sd_mapping_audit_file_path_original_issue_id_key ON public.audit_finding_sd_mapping USING btree (audit_file_path, original_issue_id)
  ```
- `audit_finding_sd_mapping_pkey`
  ```sql
  CREATE UNIQUE INDEX audit_finding_sd_mapping_pkey ON public.audit_finding_sd_mapping USING btree (id)
  ```
- `idx_audit_mapping_disposition`
  ```sql
  CREATE INDEX idx_audit_mapping_disposition ON public.audit_finding_sd_mapping USING btree (disposition)
  ```
- `idx_audit_mapping_file`
  ```sql
  CREATE INDEX idx_audit_mapping_file ON public.audit_finding_sd_mapping USING btree (audit_file_path)
  ```
- `idx_audit_mapping_hash`
  ```sql
  CREATE INDEX idx_audit_mapping_hash ON public.audit_finding_sd_mapping USING btree (audit_content_hash)
  ```
- `idx_audit_mapping_issue_type`
  ```sql
  CREATE INDEX idx_audit_mapping_issue_type ON public.audit_finding_sd_mapping USING btree (issue_type)
  ```
- `idx_audit_mapping_severity`
  ```sql
  CREATE INDEX idx_audit_mapping_severity ON public.audit_finding_sd_mapping USING btree (severity)
  ```

## RLS Policies

### 1. Authenticated users can read audit mappings (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Service role has full access to audit mappings (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_audit_mapping_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_audit_mapping_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
