# exec_handoff_preparations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-10T03:37:46.398Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (21 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| session_id | `uuid` | **NO** | - | - |
| sd_id | `text` | **NO** | - | - |
| handoff_status | `text` | **NO** | `'preparing'::text` | - |
| implementation_summary | `text` | **NO** | - | - |
| quality_metrics | `jsonb` | YES | `'{}'::jsonb` | - |
| test_results | `jsonb` | YES | `'{}'::jsonb` | - |
| performance_benchmarks | `jsonb` | YES | `'{}'::jsonb` | - |
| security_validation | `jsonb` | YES | `'{}'::jsonb` | - |
| accessibility_compliance | `jsonb` | YES | `'{}'::jsonb` | - |
| demo_url | `text` | YES | - | - |
| documentation_url | `text` | YES | - | - |
| test_report_url | `text` | YES | - | - |
| deliverables_manifest | `ARRAY` | YES | - | - |
| known_issues | `ARRAY` | YES | - | - |
| post_implementation_notes | `text` | YES | - | - |
| prepared_at | `timestamp with time zone` | YES | `now()` | - |
| sent_at | `timestamp with time zone` | YES | - | - |
| response_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `exec_handoff_preparations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `exec_handoff_preparations_sd_id_fkey`: sd_id → strategic_directives_v2(id)
- `exec_handoff_preparations_session_id_fkey`: session_id → exec_implementation_sessions(id)

### Check Constraints
- `exec_handoff_preparations_handoff_status_check`: CHECK ((handoff_status = ANY (ARRAY['preparing'::text, 'ready'::text, 'sent'::text, 'accepted'::text, 'rejected'::text])))

## Indexes

- `exec_handoff_preparations_pkey`
  ```sql
  CREATE UNIQUE INDEX exec_handoff_preparations_pkey ON public.exec_handoff_preparations USING btree (id)
  ```
- `idx_exec_handoff_preparations_session_id`
  ```sql
  CREATE INDEX idx_exec_handoff_preparations_session_id ON public.exec_handoff_preparations USING btree (session_id)
  ```
- `idx_exec_handoff_preparations_status`
  ```sql
  CREATE INDEX idx_exec_handoff_preparations_status ON public.exec_handoff_preparations USING btree (handoff_status)
  ```

## RLS Policies

### 1. exec_handoff_preparations_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. exec_handoff_preparations_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
