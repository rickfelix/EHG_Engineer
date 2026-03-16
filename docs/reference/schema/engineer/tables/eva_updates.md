# eva_updates Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-16T10:15:33.591Z
**Rows**: N/A (RLS restricted)
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| meeting_date | `date` | **NO** | - | Date of the EVA meeting (unique per day) |
| sections | `jsonb` | YES | `'{}'::jsonb` | JSONB object containing section-level reports and status |
| coordinator | `jsonb` | YES | `'{}'::jsonb` | JSONB object containing coordinator metrics and status |
| decisions | `jsonb` | YES | `'{}'::jsonb` | JSONB object containing decisions made during the meeting |
| chairman_notes | `text` | YES | - | Free-text chairman observations and notes |
| digest | `text` | YES | - | Condensed summary of the meeting for quick reference |
| completed_at | `timestamp with time zone` | YES | - | Timestamp when the meeting update was finalized |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_updates_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `eva_updates_meeting_date_key`: UNIQUE (meeting_date)

## Indexes

- `eva_updates_meeting_date_key`
  ```sql
  CREATE UNIQUE INDEX eva_updates_meeting_date_key ON public.eva_updates USING btree (meeting_date)
  ```
- `eva_updates_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_updates_pkey ON public.eva_updates USING btree (id)
  ```
- `idx_eva_updates_meeting_date`
  ```sql
  CREATE INDEX idx_eva_updates_meeting_date ON public.eva_updates USING btree (meeting_date DESC)
  ```

## RLS Policies

### 1. Service role full access (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_eva_updates_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_eva_updates_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
