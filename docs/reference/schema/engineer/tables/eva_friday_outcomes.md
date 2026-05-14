# eva_friday_outcomes Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-14T01:17:11.945Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| outcome_id | `uuid` | **NO** | `gen_random_uuid()` | - |
| agenda_item_ref | `text` | **NO** | - | Free-form reference to the originating agenda item (no FK by design — agenda items are markdown-rendered, not persisted as their own table). |
| outcome | `text` | **NO** | - | Outcome lifecycle: accepted (acted on) | deferred (revisit later) | rejected (will not pursue) | noted (informational). TEXT+CHECK is used instead of native ENUM to keep value-set evolution transactional (matches project-wide pattern). |
| chairman_feedback | `text` | YES | - | - |
| meeting_date | `date` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| consumed_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `eva_friday_outcomes_pkey`: PRIMARY KEY (outcome_id)

### Check Constraints
- `eva_friday_outcomes_outcome_check`: CHECK ((outcome = ANY (ARRAY['accepted'::text, 'deferred'::text, 'rejected'::text, 'noted'::text])))

## Indexes

- `eva_friday_outcomes_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_friday_outcomes_pkey ON public.eva_friday_outcomes USING btree (outcome_id)
  ```
- `idx_eva_friday_outcomes_unconsumed`
  ```sql
  CREATE INDEX idx_eva_friday_outcomes_unconsumed ON public.eva_friday_outcomes USING btree (meeting_date DESC) WHERE (consumed_at IS NULL)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
