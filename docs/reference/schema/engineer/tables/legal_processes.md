# legal_processes Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| process_type | `text` | **NO** | - | Type of legal process being tracked |
| venture_id | `uuid` | YES | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| blocking_reason | `text` | YES | - | - |
| blocked_at | `timestamp with time zone` | YES | - | - |
| title | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| checklist_items | `jsonb` | YES | `'[]'::jsonb` | JSONB array of checklist steps with completion status |
| documents | `jsonb` | YES | `'[]'::jsonb` | JSONB array of associated documents with URLs |
| external_references | `jsonb` | YES | `'{}'::jsonb` | External filing numbers, confirmation codes, etc. |
| started_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | YES | - | - |
| updated_by | `text` | YES | - | - |

## Constraints

### Primary Key
- `legal_processes_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `legal_processes_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `legal_processes_process_type_check`: CHECK ((process_type = ANY (ARRAY['llc_formation'::text, 'series_creation'::text, 'banking_setup'::text, 'ein_application'::text, 'registered_agent_setup'::text, 'operating_agreement'::text, 'compliance_filing'::text])))
- `legal_processes_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'blocked'::text, 'completed'::text, 'cancelled'::text])))

## Indexes

- `idx_legal_processes_status`
  ```sql
  CREATE INDEX idx_legal_processes_status ON public.legal_processes USING btree (status)
  ```
- `idx_legal_processes_type`
  ```sql
  CREATE INDEX idx_legal_processes_type ON public.legal_processes USING btree (process_type)
  ```
- `idx_legal_processes_venture`
  ```sql
  CREATE INDEX idx_legal_processes_venture ON public.legal_processes USING btree (venture_id)
  ```
- `legal_processes_pkey`
  ```sql
  CREATE UNIQUE INDEX legal_processes_pkey ON public.legal_processes USING btree (id)
  ```

## RLS Policies

### 1. legal_processes_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. legal_processes_service_role (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`

## Triggers

### legal_processes_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_legal_processes_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
