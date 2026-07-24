# coordination_events Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 288
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| event_type | `text` | **NO** | - | SPLIT_BRAIN | THUNDERING_HERD | REPLY_STARVATION | STUCK_WORKER | CLAIM_HALF_WRITE |
| detected_at | `timestamp with time zone` | **NO** | `now()` | - |
| severity | `text` | **NO** | `'info'::text` | - |
| session_id | `text` | YES | - | - |
| sd_key | `text` | YES | - | - |
| detector_version | `text` | YES | - | Detector bundle version that emitted the row (e.g. COORD_DETECTORS_V2). |
| payload | `jsonb` | **NO** | `'{}'::jsonb` | Detector {reason, evidence} — the matched predicate output. |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `coordination_events_pkey`: PRIMARY KEY (id)

### Check Constraints
- `coordination_events_severity_check`: CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])))

## Indexes

- `coordination_events_pkey`
  ```sql
  CREATE UNIQUE INDEX coordination_events_pkey ON public.coordination_events USING btree (id)
  ```
- `idx_coord_events_severity_detected`
  ```sql
  CREATE INDEX idx_coord_events_severity_detected ON public.coordination_events USING btree (severity, detected_at DESC)
  ```
- `idx_coord_events_type_detected`
  ```sql
  CREATE INDEX idx_coord_events_type_detected ON public.coordination_events USING btree (event_type, detected_at DESC)
  ```

## RLS Policies

### 1. coordination_events_insert_service_role (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 2. coordination_events_select_service_role (SELECT)

- **Roles**: {service_role}
- **Using**: `true`

### 3. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_coordination_events_append_only

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION coordination_events_append_only()`

### trg_coordination_events_append_only

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION coordination_events_append_only()`

---

[← Back to Schema Overview](../database-schema-overview.md)
