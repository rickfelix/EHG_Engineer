# opportunity_sources Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T15:02:05.180Z
**Rows**: 4
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| source_type | `character varying(50)` | **NO** | - | - |
| source_name | `character varying(255)` | **NO** | - | - |
| source_url | `text` | YES | - | - |
| configuration | `jsonb` | YES | `'{}'::jsonb` | - |
| is_active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |
| updated_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `opportunity_sources_pkey`: PRIMARY KEY (id)

### Check Constraints
- `opportunity_sources_source_type_check`: CHECK (((source_type)::text = ANY ((ARRAY['manual_entry'::character varying, 'web_scraping'::character varying, 'email_parsing'::character varying, 'api_integration'::character varying, 'bulk_import'::character varying, 'linkedin'::character varying, 'company_website'::character varying, 'referral'::character varying])::text[])))

## Indexes

- `opportunity_sources_pkey`
  ```sql
  CREATE UNIQUE INDEX opportunity_sources_pkey ON public.opportunity_sources USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_sources (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. authenticated_write_sources (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_sources_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
