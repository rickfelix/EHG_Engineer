# periodic_process_registry Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 230
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| process_key | `text` | **NO** | - | - |
| display_name | `text` | **NO** | - | - |
| owner | `text` | **NO** | - | REQUIRED owner-agent for this process (SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-A). Interim value coordinator-fleet flows through the reassignment worklist (scripts/backfill-registry-owners.mjs). Sibling -B routes OVERDUE escalations owner-first. |
| process_type | `text` | **NO** | - | - |
| expected_interval_seconds | `integer(32)` | **NO** | - | - |
| grace_multiplier | `numeric` | **NO** | `3` | - |
| liveness_source | `text` | **NO** | - | Where the watcher resolves last-fired from at watch-time: claude_sessions_heartbeat
(role-session loops -- resolve via liveness_source_ref against claude_sessions),
eva_scheduler_heartbeat (resolve via liveness_source_ref.instance_id against
eva_scheduler_heartbeat.last_poll_at), or self_stamped (this row's own
last_fired_at, written only by lib/periodic-liveness/stamp-last-fired.js). |
| liveness_source_ref | `jsonb` | **NO** | `'{}'::jsonb` | - |
| session_bound | `boolean` | **NO** | `false` | - |
| currently_expected_active | `boolean` | **NO** | `true` | False = intentionally stood-down (session_bound loop deliberately not running
right now); the watcher skips staleness evaluation entirely for such rows,
rendering INTENTIONALLY_DOWN rather than a false OVERDUE/UNVERIFIED flag. |
| last_fired_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| last_state | `text` | YES | - | The state (OK/OVERDUE/UNVERIFIED/INTENTIONALLY_DOWN) observed on the watcher's most recent
evaluation of this row. Used to detect a genuine transition INTO OVERDUE (per-episode dedup) --
NOT a fixed-forever "has this ever been flagged" check, which was a real bug caught by
adversarial review on this SD's own PR (#5562). |
| consecutive_miss_count | `integer(32)` | YES | - | Consecutive-OVERDUE-tick counter for ladder escalation (SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-B FR-3). NULL/0 = no active escalation episode. Reset to 0 on recovery to OK. Incremented only via periodic_registry_increment_consecutive_miss() for atomicity. |
| last_state_changed_at | `timestamp with time zone` | YES | - | Timestamp of the most recent GENUINE last_state transition (previous last_state !=
new state), written by scripts/periodic-liveness-watcher.mjs. NOT bumped on a
same-state reaffirming cycle -- mirrors the last_state column's own per-episode
dedup discipline (PR #5562). Used by FR-5 to measure ">7 continuous days
UNVERIFIED" without conflating it with updated_at (bumped every cycle
unconditionally). |

## Constraints

### Primary Key
- `periodic_process_registry_pkey`: PRIMARY KEY (process_key)

### Check Constraints
- `periodic_process_registry_expected_interval_seconds_check`: CHECK ((expected_interval_seconds > 0))
- `periodic_process_registry_grace_multiplier_check`: CHECK ((grace_multiplier > (0)::numeric))
- `periodic_process_registry_liveness_source_check`: CHECK ((liveness_source = ANY (ARRAY['claude_sessions_heartbeat'::text, 'eva_scheduler_heartbeat'::text, 'self_stamped'::text, 'github_actions_api'::text])))
- `periodic_process_registry_process_type_check`: CHECK ((process_type = ANY (ARRAY['role_session'::text, 'scheduler_round'::text, 'standalone_cron'::text, 'worker_class'::text])))

## Indexes

- `idx_periodic_process_registry_type`
  ```sql
  CREATE INDEX idx_periodic_process_registry_type ON public.periodic_process_registry USING btree (process_type)
  ```
- `periodic_process_registry_pkey`
  ```sql
  CREATE UNIQUE INDEX periodic_process_registry_pkey ON public.periodic_process_registry USING btree (process_key)
  ```

## RLS Policies

### 1. periodic_process_registry_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
