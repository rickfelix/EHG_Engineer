# security_audit_events_2026_06 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-23T17:26:00.046Z
**Rows**: null
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| event_type | `character varying(64)` | **NO** | - | - |
| severity | `character varying(16)` | **NO** | - | - |
| taxonomy_class | `character varying(32)` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| venture_name_input | `text` | YES | - | - |
| venture_name_normalized | `text` | YES | - | - |
| colliding_with_venture_id | `uuid` | YES | - | - |
| source_agent | `character varying(64)` | **NO** | - | - |
| source_module_path | `text` | YES | - | - |
| correlation_id | `uuid` | YES | - | - |
| session_id | `uuid` | YES | - | - |
| sd_id | `character varying(50)` | YES | - | - |
| occurred_at | `timestamp with time zone` | **NO** | - | - |
| detected_at | `timestamp with time zone` | **NO** | `now()` | - |
| event_payload | `jsonb` | **NO** | `'{}'::jsonb` | - |
| integrity_hash | `text` | **NO** | - | - |
| pat_pattern_id | `character varying(50)` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `security_audit_events_2026_06_pkey`: PRIMARY KEY (id, occurred_at)

### Foreign Keys
- `fk_sae_venture_id`: venture_id → ventures(id)

### Check Constraints
- `chk_sae_event_type`: CHECK (((event_type)::text = ANY ((ARRAY['nfkd_collision'::character varying, 'port_isol_violation'::character varying, 'capability_suppression'::character varying, 'fail_closed_error'::character varying])::text[])))
- `chk_sae_integrity_hash`: CHECK ((length(integrity_hash) = 64))
- `chk_sae_severity`: CHECK (((severity)::text = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'critical'::character varying, 'tier3'::character varying])::text[])))
- `chk_sae_taxonomy`: CHECK ((((event_type)::text <> 'fail_closed_error'::text) OR ((taxonomy_class)::text = ANY ((ARRAY['permanent'::character varying, 'transient'::character varying])::text[]))))

## Indexes

- `security_audit_events_2026_06_correlation_id_idx`
  ```sql
  CREATE INDEX security_audit_events_2026_06_correlation_id_idx ON public.security_audit_events_2026_06 USING btree (correlation_id) WHERE (correlation_id IS NOT NULL)
  ```
- `security_audit_events_2026_06_event_type_severity_idx`
  ```sql
  CREATE INDEX security_audit_events_2026_06_event_type_severity_idx ON public.security_audit_events_2026_06 USING btree (event_type, severity)
  ```
- `security_audit_events_2026_06_occurred_at_idx`
  ```sql
  CREATE INDEX security_audit_events_2026_06_occurred_at_idx ON public.security_audit_events_2026_06 USING btree (occurred_at DESC)
  ```
- `security_audit_events_2026_06_pat_pattern_id_idx`
  ```sql
  CREATE INDEX security_audit_events_2026_06_pat_pattern_id_idx ON public.security_audit_events_2026_06 USING btree (pat_pattern_id) WHERE (pat_pattern_id IS NOT NULL)
  ```
- `security_audit_events_2026_06_pkey`
  ```sql
  CREATE UNIQUE INDEX security_audit_events_2026_06_pkey ON public.security_audit_events_2026_06 USING btree (id, occurred_at)
  ```
- `security_audit_events_2026_06_venture_id_idx`
  ```sql
  CREATE INDEX security_audit_events_2026_06_venture_id_idx ON public.security_audit_events_2026_06 USING btree (venture_id) WHERE (venture_id IS NOT NULL)
  ```

## Triggers

### trg_sae_immutable_delete

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION security_audit_events_immutable()`

### trg_sae_immutable_update

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION security_audit_events_immutable()`

---

[← Back to Schema Overview](../database-schema-overview.md)
