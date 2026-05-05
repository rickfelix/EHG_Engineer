# scan_results Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-05T10:51:41.350Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (22 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| target_url | `text` | **NO** | - | - |
| scan_status | `USER-DEFINED` | **NO** | `'queued'::scan_status` | - |
| pages_scanned | `integer(32)` | **NO** | `0` | - |
| scan_depth_limit | `integer(32)` | **NO** | `10` | - |
| retry_count | `integer(32)` | **NO** | `0` | - |
| scan_version | `integer(32)` | **NO** | `1` | - |
| first_party_cookies | `jsonb` | **NO** | `'[]'::jsonb` | First-party cookies detected during scan. Envelope: {v:1, payload:[{name, domain, ...}]}. |
| third_party_cookies | `jsonb` | **NO** | `'[]'::jsonb` | Third-party cookies detected during scan. Envelope: {v:1, payload:[{name, domain, vendor, ...}]}. |
| external_scripts | `jsonb` | **NO** | `'[]'::jsonb` | External scripts loaded by target site. Envelope: {v:1, payload:[{src, host, type, ...}]}. |
| form_endpoints | `jsonb` | **NO** | `'[]'::jsonb` | Form submission endpoints discovered during scan. Envelope: {v:1, payload:[{action, method, fields, ...}]}. |
| scan_options | `jsonb` | **NO** | `'{}'::jsonb` | Per-scan configuration (user_agent, robots_txt_respected, follow_redirects). Envelope: {v:1, ...}. |
| scan_summary | `jsonb` | YES | - | Aggregated scan results summary for UI display. Envelope: {v:1, payload:{...}}. Nullable until scan completes. |
| scan_started_at | `timestamp with time zone` | YES | - | - |
| scan_completed_at | `timestamp with time zone` | YES | - | - |
| error_message | `text` | YES | - | - |
| error_details | `jsonb` | YES | - | - |
| request_id | `uuid` | YES | - | - |
| requested_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `scan_results_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `scan_results_requested_by_fkey`: requested_by → users(id)
- `scan_results_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `chk_scan_results_completed_after_started`: CHECK (((scan_completed_at IS NULL) OR (scan_started_at IS NULL) OR (scan_completed_at >= scan_started_at)))
- `chk_scan_results_failed_has_error`: CHECK (((scan_status <> 'failed'::scan_status) OR (error_message IS NOT NULL)))
- `chk_scan_results_pages_nonneg`: CHECK (((pages_scanned >= 0) AND (retry_count >= 0) AND (scan_depth_limit > 0)))
- `chk_scan_results_url_nonblank`: CHECK ((length(TRIM(BOTH FROM target_url)) > 0))
- `chk_scan_results_url_scheme`: CHECK ((target_url ~* '^https?://'::text))

## Indexes

- `idx_scan_results_active`
  ```sql
  CREATE INDEX idx_scan_results_active ON public.scan_results USING btree (venture_id, scan_status) WHERE (scan_status = ANY (ARRAY['queued'::scan_status, 'running'::scan_status]))
  ```
- `idx_scan_results_url_history`
  ```sql
  CREATE INDEX idx_scan_results_url_history ON public.scan_results USING btree (target_url text_pattern_ops, created_at DESC)
  ```
- `idx_scan_results_venture_created`
  ```sql
  CREATE INDEX idx_scan_results_venture_created ON public.scan_results USING btree (venture_id, created_at DESC)
  ```
- `scan_results_pkey`
  ```sql
  CREATE UNIQUE INDEX scan_results_pkey ON public.scan_results USING btree (id)
  ```

## RLS Policies

### 1. scan_results_authenticated_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = scan_results.venture_id) AND ((v.created_by = auth.uid()) OR (v.created_by IS NULL)))))`

### 2. scan_results_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = scan_results.venture_id) AND ((v.created_by = auth.uid()) OR (v.created_by IS NULL)))))`

### 3. scan_results_authenticated_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = scan_results.venture_id) AND ((v.created_by = auth.uid()) OR (v.created_by IS NULL)))))`
- **With Check**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = scan_results.venture_id) AND ((v.created_by = auth.uid()) OR (v.created_by IS NULL)))))`

### 4. scan_results_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
