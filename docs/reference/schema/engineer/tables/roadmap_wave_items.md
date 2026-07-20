# roadmap_wave_items Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-02T14:19:23.450Z (manually amended 2026-07-19 for SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001 — the automated generator, scripts/generate-schema-docs-from-db.js, hung during this SD's /document step; regenerate this file properly next time it's runnable)
**Rows**: 741 (stale — pre-dates this SD's backfill)
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| wave_id | `uuid` | **NO** | - | - |
| source_type | `text` | **NO** | - | Intake source: todoist or youtube. Check constraint enforced. |
| source_id | `uuid` | **NO** | - | - |
| title | `text` | YES | - | - |
| promoted_to_sd_key | `text` | YES | - | SD key (e.g., SD-LEO-FEAT-001) if this item was promoted to a strategic directive. |
| priority_rank | `integer(32)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| item_disposition | `text` | YES | `'pending'::text` | Flow state: pending->selected->brainstormed->promoted (or deferred/dropped at any point) |
| brainstorm_session_id | `uuid` | YES | - | FK to brainstorm_sessions when item has been brainstormed. Null = not yet brainstormed. |
| lane | `text` | YES | - | Sourcing-engine routing lane (mutable; SEPARATE from terminal item_disposition). Vocab: lib/sourcing-engine/lane.js. SD-LEO-INFRA-SOURCING-ENGINE-LEDGER-LANE-COLUMN-001. |
| remainder_state | `text` | YES | - | Stamped (never inferred) plan-of-record classification: promotable_now, gated_on_chairman, in_flight_or_sequence_blocked, satisfied_elsewhere, or void. Written by trg_stamp_plan_of_record_remainder_state on insert/update of item_disposition/lane/promoted_to_sd_key, and by trg_restamp_items_on_sd_cancel whenever a linked SD's status changes. SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001. |
| remainder_state_stamped_at | `timestamp with time zone` | YES | - | When remainder_state was last (re-)stamped. SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001. |
| remainder_state_stamped_by | `text` | YES | - | Always 'stamp_plan_of_record_remainder_state' — the one canonical function that writes this column. SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001. |

## Constraints

### Primary Key
- `roadmap_wave_items_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `roadmap_wave_items_brainstorm_session_id_fkey`: brainstorm_session_id → brainstorm_sessions(id)
- `roadmap_wave_items_wave_id_fkey`: wave_id → roadmap_waves(id)

### Unique Constraints
- `roadmap_wave_items_wave_id_source_type_source_id_key`: UNIQUE (wave_id, source_type, source_id)

### Check Constraints
- `roadmap_wave_items_item_disposition_check`: CHECK ((item_disposition = ANY (ARRAY['pending'::text, 'selected'::text, 'deferred'::text, 'brainstormed'::text, 'promoted'::text, 'dropped'::text])))
- `roadmap_wave_items_lane_check`: CHECK (((lane IS NULL) OR (lane = ANY (ARRAY['belt-ready'::text, 'chairman-gated'::text, 'outcome-gated'::text, 'dedup'::text, 'decline'::text])) OR (lane ~~ 'blocked-on-_%'::text)))
- `roadmap_wave_items_source_type_check`: CHECK ((source_type = ANY (ARRAY['todoist'::text, 'youtube'::text, 'brainstorm'::text, 'adam_direct'::text, 'vdr_gauge'::text])))
- `roadmap_wave_items_remainder_state_check`: CHECK ((remainder_state IS NULL) OR (remainder_state = ANY (ARRAY['promotable_now'::text, 'gated_on_chairman'::text, 'in_flight_or_sequence_blocked'::text, 'satisfied_elsewhere'::text, 'void'::text])))

## Indexes

- `idx_wave_items_promoted`
  ```sql
  CREATE INDEX idx_wave_items_promoted ON public.roadmap_wave_items USING btree (promoted_to_sd_key) WHERE (promoted_to_sd_key IS NOT NULL)
  ```
- `idx_wave_items_source`
  ```sql
  CREATE INDEX idx_wave_items_source ON public.roadmap_wave_items USING btree (source_type, source_id)
  ```
- `idx_wave_items_wave`
  ```sql
  CREATE INDEX idx_wave_items_wave ON public.roadmap_wave_items USING btree (wave_id)
  ```
- `roadmap_wave_items_pkey`
  ```sql
  CREATE UNIQUE INDEX roadmap_wave_items_pkey ON public.roadmap_wave_items USING btree (id)
  ```
- `roadmap_wave_items_wave_id_source_type_source_id_key`
  ```sql
  CREATE UNIQUE INDEX roadmap_wave_items_wave_id_source_type_source_id_key ON public.roadmap_wave_items USING btree (wave_id, source_type, source_id)
  ```

## RLS Policies

### 1. roadmap_wave_items_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. roadmap_wave_items_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_roadmap_wave_items_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_roadmap_wave_items_updated_at()`

### roadmap_wave_items_stamp_remainder

- **Timing**: AFTER INSERT OR UPDATE OF item_disposition, lane, promoted_to_sd_key
- **Action**: `EXECUTE FUNCTION trg_stamp_plan_of_record_remainder_state()`
- SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001. Keeps `remainder_state` current whenever the columns it's derived from change.

## Related Views

### v_plan_of_record_remainder

Approved-wave-only view over this table (joined to `roadmap_waves`), exposing the stamped `remainder_state` and provenance columns. `security_invoker = true`; `REVOKE ALL ... FROM PUBLIC, anon, authenticated` + `GRANT SELECT ... TO service_role` (RLS alone does not restrict it, since both source tables carry a permissive `authenticated SELECT USING (true)` policy). A cross-table trigger, `sd_cancel_restamp_remainder` on `strategic_directives_v2` (`AFTER UPDATE OF status`), re-stamps affected rows whenever a linked SD's status changes in either direction. SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001.

---

[← Back to Schema Overview](../database-schema-overview.md)
