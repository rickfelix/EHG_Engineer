# conversion_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 667
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (20 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| source_pool | `text` | **NO** | - | - |
| source_id | `text` | **NO** | - | - |
| source_external_id | `text` | YES | - | - |
| title | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| normalized_priority | `text` | YES | - | - |
| intake_status | `text` | **NO** | `'registered'::text` | - |
| disposition | `text` | YES | - | - |
| triage_verdict | `text` | YES | - | - |
| dedup_match_sd_key | `text` | YES | - | - |
| dedup_score | `numeric(4,3)` | YES | - | - |
| dismiss_reason | `text` | YES | - | - |
| linked_sd_key | `text` | YES | - | - |
| promoted_proposal_path | `text` | YES | - | - |
| triaged_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| target_rung | `text` | YES | - | - |
| lane | `text` | YES | - | Sourcing-engine routing lane (mutable; SEPARATE from terminal disposition). Vocab: lib/sourcing-engine/lane.js. SD-LEO-INFRA-SOURCING-ENGINE-LEDGER-LANE-COLUMN-001. |

## Constraints

### Primary Key
- `conversion_ledger_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `conversion_ledger_source_pool_source_id_key`: UNIQUE (source_pool, source_id)

### Check Constraints
- `conversion_ledger_disposition_check`: CHECK (((disposition IS NULL) OR (disposition = ANY (ARRAY['built'::text, 'already_covered'::text, 'duplicate'::text, 'declined'::text, 'deferred_to_rung'::text, 'converted'::text, 'dismissed'::text, 'merged_duplicate'::text, 'deferred'::text]))))
- `conversion_ledger_intake_status_check`: CHECK ((intake_status = ANY (ARRAY['registered'::text, 'triaged'::text])))
- `conversion_ledger_lane_check`: CHECK (((lane IS NULL) OR (lane = ANY (ARRAY['belt-ready'::text, 'chairman-gated'::text, 'outcome-gated'::text, 'dedup'::text, 'decline'::text])) OR (lane ~~ 'blocked-on-_%'::text)))
- `conversion_ledger_normalized_priority_check`: CHECK ((normalized_priority = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])))
- `conversion_ledger_source_pool_check`: CHECK ((source_pool = ANY (ARRAY['eva_consultant_rec'::text, 'sd_proposal'::text, 'prd_payload_file'::text, 'todoist_todo'::text, 'youtube_playlist'::text, 'ehg_folder'::text, 'estate_corpus'::text])))
- `conversion_ledger_target_rung_check`: CHECK (((target_rung IS NULL) OR (target_rung = ANY (ARRAY['v2'::text, 'v3'::text]))))

## Indexes

- `conversion_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX conversion_ledger_pkey ON public.conversion_ledger USING btree (id)
  ```
- `conversion_ledger_source_pool_source_id_key`
  ```sql
  CREATE UNIQUE INDEX conversion_ledger_source_pool_source_id_key ON public.conversion_ledger USING btree (source_pool, source_id)
  ```
- `idx_conversion_ledger_backlog`
  ```sql
  CREATE INDEX idx_conversion_ledger_backlog ON public.conversion_ledger USING btree (created_at) WHERE (disposition IS NULL)
  ```
- `idx_conversion_ledger_disposition`
  ```sql
  CREATE INDEX idx_conversion_ledger_disposition ON public.conversion_ledger USING btree (disposition)
  ```
- `idx_conversion_ledger_source_pool`
  ```sql
  CREATE INDEX idx_conversion_ledger_source_pool ON public.conversion_ledger USING btree (source_pool)
  ```

## RLS Policies

### 1. conversion_ledger_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. conversion_ledger_service (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
