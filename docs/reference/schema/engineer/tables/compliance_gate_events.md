# compliance_gate_events Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T15:58:55.379Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| venture_id | `uuid` | **NO** | - | - |
| stage_id | `integer(32)` | **NO** | `20` | - |
| archetype | `character varying(50)` | **NO** | - | - |
| checklist_version | `integer(32)` | **NO** | - | - |
| event_type | `character varying(30)` | **NO** | - | - |
| outcome | `character varying(10)` | YES | - | - |
| missing_required_count | `integer(32)` | YES | - | - |
| missing_required_items | `jsonb` | YES | - | - |
| time_to_compliance_seconds | `integer(32)` | YES | - | - |
| first_activity_at | `timestamp with time zone` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `compliance_gate_events_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `compliance_gate_events_created_by_fkey`: created_by → users(id)
- `compliance_gate_events_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `compliance_gate_events_event_type_check`: CHECK (((event_type)::text = ANY ((ARRAY['gate_evaluated'::character varying, 'gate_passed'::character varying, 'checklist_activity'::character varying])::text[])))
- `compliance_gate_events_outcome_check`: CHECK (((outcome)::text = ANY ((ARRAY['PASS'::character varying, 'FAIL'::character varying])::text[])))

## Indexes

- `compliance_gate_events_pkey`
  ```sql
  CREATE UNIQUE INDEX compliance_gate_events_pkey ON public.compliance_gate_events USING btree (id)
  ```
- `idx_compliance_events_archetype_date`
  ```sql
  CREATE INDEX idx_compliance_events_archetype_date ON public.compliance_gate_events USING btree (archetype, created_at)
  ```
- `idx_compliance_events_type`
  ```sql
  CREATE INDEX idx_compliance_events_type ON public.compliance_gate_events USING btree (event_type)
  ```
- `idx_compliance_events_venture`
  ```sql
  CREATE INDEX idx_compliance_events_venture ON public.compliance_gate_events USING btree (venture_id)
  ```

## RLS Policies

### 1. Compliance gate events insertable by functions (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 2. Compliance gate events viewable by venture owner (SELECT)

- **Roles**: {authenticated}
- **Using**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = compliance_gate_events.venture_id) AND (v.created_by = auth.uid()))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
