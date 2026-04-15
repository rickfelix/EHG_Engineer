# eva_friday_meeting_agenda Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-15T15:49:47.783Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| generated_at | `timestamp with time zone` | YES | `now()` | - |
| week_start | `date` | **NO** | - | - |
| week_end | `date` | **NO** | - | - |
| agenda_data | `jsonb` | **NO** | `'{}'::jsonb` | - |
| status | `text` | YES | `'generated'::text` | - |
| reviewed_by | `text` | YES | - | - |
| reviewed_at | `timestamp with time zone` | YES | - | - |
| notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_friday_meeting_agenda_pkey`: PRIMARY KEY (id)

### Check Constraints
- `eva_friday_meeting_agenda_status_check`: CHECK ((status = ANY (ARRAY['generated'::text, 'reviewed'::text, 'actioned'::text, 'skipped'::text])))

## Indexes

- `eva_friday_meeting_agenda_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_friday_meeting_agenda_pkey ON public.eva_friday_meeting_agenda USING btree (id)
  ```
- `idx_eva_friday_agenda_week`
  ```sql
  CREATE INDEX idx_eva_friday_agenda_week ON public.eva_friday_meeting_agenda USING btree (week_start)
  ```

## RLS Policies

### 1. Authenticated can read eva_friday_meeting_agenda (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Authenticated can update eva_friday_meeting_agenda (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 3. Service role can manage eva_friday_meeting_agenda (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
