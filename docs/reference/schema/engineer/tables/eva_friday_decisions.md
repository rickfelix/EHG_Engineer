# eva_friday_decisions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-12T21:52:33.070Z
**Rows**: 0
**RLS**: Enabled (0 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| meeting_date | `date` | **NO** | `CURRENT_DATE` | - |
| decision_type | `text` | **NO** | - | Type of decision: kill_sd, approve_proposal, redirect, defer, flag, or custom |
| description | `text` | **NO** | - | - |
| target_entity_type | `text` | YES | - | Entity type affected (sd, proposal, okr, etc.) |
| target_entity_id | `text` | YES | - | Identifier of the affected entity (e.g., SD key or PRD ID) |
| consequences | `jsonb` | YES | - | Array of side-effects: [{type, entity}] |
| confirmed | `boolean` | YES | `false` | Whether the chairman has confirmed this decision |
| confirmed_at | `timestamp with time zone` | YES | - | - |
| executed | `boolean` | YES | `false` | Whether the decision side-effects have been applied |
| executed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_friday_decisions_pkey`: PRIMARY KEY (id)

### Check Constraints
- `eva_friday_decisions_decision_type_check`: CHECK ((decision_type = ANY (ARRAY['kill_sd'::text, 'approve_proposal'::text, 'redirect'::text, 'defer'::text, 'flag'::text, 'custom'::text])))

## Indexes

- `eva_friday_decisions_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_friday_decisions_pkey ON public.eva_friday_decisions USING btree (id)
  ```
- `idx_eva_friday_decisions_consequences`
  ```sql
  CREATE INDEX idx_eva_friday_decisions_consequences ON public.eva_friday_decisions USING gin (consequences)
  ```
- `idx_eva_friday_decisions_meeting_date`
  ```sql
  CREATE INDEX idx_eva_friday_decisions_meeting_date ON public.eva_friday_decisions USING btree (meeting_date)
  ```
- `idx_eva_friday_decisions_target`
  ```sql
  CREATE INDEX idx_eva_friday_decisions_target ON public.eva_friday_decisions USING btree (target_entity_type, target_entity_id)
  ```
- `idx_eva_friday_decisions_type`
  ```sql
  CREATE INDEX idx_eva_friday_decisions_type ON public.eva_friday_decisions USING btree (decision_type)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
