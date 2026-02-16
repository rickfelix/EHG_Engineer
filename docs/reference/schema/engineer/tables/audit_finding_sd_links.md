# audit_finding_sd_links Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-16T20:17:30.369Z
**Rows**: 87
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (5 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| mapping_id | `uuid` | **NO** | - | - |
| sd_id | `character varying(50)` | **NO** | - | - |
| link_type | `character varying(20)` | **NO** | `'primary'::character varying` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `audit_finding_sd_links_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `audit_finding_sd_links_mapping_id_fkey`: mapping_id → audit_finding_sd_mapping(id)

### Unique Constraints
- `audit_finding_sd_links_mapping_id_sd_id_key`: UNIQUE (mapping_id, sd_id)

## Indexes

- `audit_finding_sd_links_mapping_id_sd_id_key`
  ```sql
  CREATE UNIQUE INDEX audit_finding_sd_links_mapping_id_sd_id_key ON public.audit_finding_sd_links USING btree (mapping_id, sd_id)
  ```
- `audit_finding_sd_links_pkey`
  ```sql
  CREATE UNIQUE INDEX audit_finding_sd_links_pkey ON public.audit_finding_sd_links USING btree (id)
  ```
- `idx_sd_links_mapping`
  ```sql
  CREATE INDEX idx_sd_links_mapping ON public.audit_finding_sd_links USING btree (mapping_id)
  ```
- `idx_sd_links_sd`
  ```sql
  CREATE INDEX idx_sd_links_sd ON public.audit_finding_sd_links USING btree (sd_id)
  ```
- `idx_sd_links_type`
  ```sql
  CREATE INDEX idx_sd_links_type ON public.audit_finding_sd_links USING btree (link_type)
  ```

## RLS Policies

### 1. Authenticated users can read audit links (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Service role has full access to audit links (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
