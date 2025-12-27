# sd_baseline_issues Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-12-27T22:36:33.744Z
**Rows**: 5
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (32 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| issue_key | `character varying(30)` | **NO** | - | Unique identifier in format BL-{CAT}-{NNN} (e.g., BL-SEC-001) |
| hash_signature | `text` | YES | - | MD5 hash of file_path|line_number|description for deduplication |
| category | `character varying(50)` | **NO** | - | Issue category matching sub-agent domain |
| sub_agent_code | `character varying(20)` | **NO** | - | Sub-agent that detected this issue (SECURITY, TESTING, etc.) |
| severity | `character varying(20)` | **NO** | - | Issue severity: critical issues block LEAD gate after 30 days |
| file_path | `text` | YES | - | - |
| line_number | `integer(32)` | YES | - | - |
| description | `text` | **NO** | - | - |
| evidence_snapshot | `jsonb` | YES | `'{}'::jsonb` | - |
| discovered_at | `timestamp with time zone` | **NO** | `now()` | - |
| discovered_by_sd_id | `text` | YES | - | SD that first detected this issue |
| last_seen_at | `timestamp with time zone` | YES | `now()` | - |
| last_seen_sd_id | `text` | YES | - | Most recent SD to encounter this issue |
| occurrence_count | `integer(32)` | YES | `1` | Number of times this issue has been detected across SDs |
| affected_sd_ids | `ARRAY` | YES | `'{}'::text[]` | Array of SDs that were blocked or affected by this issue |
| owner_sd_id | `text` | YES | - | SD responsible for remediation (LEAD assignment) |
| remediation_sd_id | `text` | YES | - | SD actively working on fixing this issue |
| remediation_priority | `character varying(20)` | YES | - | - |
| due_date | `date` | YES | - | - |
| status | `character varying(20)` | YES | `'open'::character varying` | Lifecycle: open → acknowledged → in_progress → resolved/wont_fix |
| resolved_at | `timestamp with time zone` | YES | - | - |
| wont_fix_justification | `text` | YES | - | Required justification (≥50 chars) when accepting risk |
| wont_fix_approved_by | `text` | YES | - | - |
| wont_fix_approved_at | `timestamp with time zone` | YES | - | - |
| wont_fix_expires_at | `timestamp with time zone` | YES | - | Wont-fix decisions expire after 1 year for re-evaluation |
| risk_accepted_by | `text` | YES | - | - |
| related_pattern_id | `character varying(20)` | YES | - | - |
| related_issue_key | `character varying(30)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `sd_baseline_issues_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_baseline_issues_discovered_by_sd_id_fkey`: discovered_by_sd_id → strategic_directives_v2(id)
- `sd_baseline_issues_last_seen_sd_id_fkey`: last_seen_sd_id → strategic_directives_v2(id)
- `sd_baseline_issues_owner_sd_id_fkey`: owner_sd_id → strategic_directives_v2(id)
- `sd_baseline_issues_remediation_sd_id_fkey`: remediation_sd_id → strategic_directives_v2(id)

### Unique Constraints
- `sd_baseline_issues_hash_signature_key`: UNIQUE (hash_signature)
- `sd_baseline_issues_issue_key_key`: UNIQUE (issue_key)

### Check Constraints
- `false_positive_requires_reason`: CHECK ((((status)::text <> 'false_positive'::text) OR ((evidence_snapshot ->> 'false_positive_reason'::text) IS NOT NULL)))
- `sd_baseline_issues_category_check`: CHECK (((category)::text = ANY ((ARRAY['security'::character varying, 'testing'::character varying, 'performance'::character varying, 'database'::character varying, 'documentation'::character varying, 'accessibility'::character varying, 'code_quality'::character varying, 'dependency'::character varying, 'infrastructure'::character varying])::text[])))
- `sd_baseline_issues_remediation_priority_check`: CHECK (((remediation_priority)::text = ANY ((ARRAY['critical'::character varying, 'high'::character varying, 'medium'::character varying, 'low'::character varying, 'none'::character varying])::text[])))
- `sd_baseline_issues_severity_check`: CHECK (((severity)::text = ANY ((ARRAY['critical'::character varying, 'high'::character varying, 'medium'::character varying, 'low'::character varying])::text[])))
- `sd_baseline_issues_status_check`: CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'acknowledged'::character varying, 'in_progress'::character varying, 'resolved'::character varying, 'wont_fix'::character varying, 'false_positive'::character varying])::text[])))
- `wont_fix_requires_approval`: CHECK ((((status)::text <> 'wont_fix'::text) OR ((wont_fix_justification IS NOT NULL) AND (length(wont_fix_justification) >= 50) AND (wont_fix_approved_by IS NOT NULL))))

## Indexes

- `idx_baseline_issues_category`
  ```sql
  CREATE INDEX idx_baseline_issues_category ON public.sd_baseline_issues USING btree (category)
  ```
- `idx_baseline_issues_discovered_by`
  ```sql
  CREATE INDEX idx_baseline_issues_discovered_by ON public.sd_baseline_issues USING btree (discovered_by_sd_id)
  ```
- `idx_baseline_issues_file_path`
  ```sql
  CREATE INDEX idx_baseline_issues_file_path ON public.sd_baseline_issues USING btree (file_path)
  ```
- `idx_baseline_issues_hash`
  ```sql
  CREATE INDEX idx_baseline_issues_hash ON public.sd_baseline_issues USING btree (hash_signature)
  ```
- `idx_baseline_issues_open_critical`
  ```sql
  CREATE INDEX idx_baseline_issues_open_critical ON public.sd_baseline_issues USING btree (severity, created_at) WHERE ((status)::text = 'open'::text)
  ```
- `idx_baseline_issues_owner`
  ```sql
  CREATE INDEX idx_baseline_issues_owner ON public.sd_baseline_issues USING btree (owner_sd_id)
  ```
- `idx_baseline_issues_remediation`
  ```sql
  CREATE INDEX idx_baseline_issues_remediation ON public.sd_baseline_issues USING btree (remediation_sd_id)
  ```
- `idx_baseline_issues_severity`
  ```sql
  CREATE INDEX idx_baseline_issues_severity ON public.sd_baseline_issues USING btree (severity)
  ```
- `idx_baseline_issues_stale`
  ```sql
  CREATE INDEX idx_baseline_issues_stale ON public.sd_baseline_issues USING btree (created_at, severity) WHERE ((status)::text = 'open'::text)
  ```
- `idx_baseline_issues_status`
  ```sql
  CREATE INDEX idx_baseline_issues_status ON public.sd_baseline_issues USING btree (status)
  ```
- `idx_baseline_issues_sub_agent`
  ```sql
  CREATE INDEX idx_baseline_issues_sub_agent ON public.sd_baseline_issues USING btree (sub_agent_code)
  ```
- `sd_baseline_issues_hash_signature_key`
  ```sql
  CREATE UNIQUE INDEX sd_baseline_issues_hash_signature_key ON public.sd_baseline_issues USING btree (hash_signature)
  ```
- `sd_baseline_issues_issue_key_key`
  ```sql
  CREATE UNIQUE INDEX sd_baseline_issues_issue_key_key ON public.sd_baseline_issues USING btree (issue_key)
  ```
- `sd_baseline_issues_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_baseline_issues_pkey ON public.sd_baseline_issues USING btree (id)
  ```

## RLS Policies

### 1. authenticated_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 2. authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. authenticated_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 4. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_generate_baseline_hash

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION generate_baseline_hash_signature()`

### trigger_set_wont_fix_expiration

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION set_wont_fix_expiration()`

### trigger_set_wont_fix_expiration

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION set_wont_fix_expiration()`

### trigger_update_baseline_issues_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_baseline_issues_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
