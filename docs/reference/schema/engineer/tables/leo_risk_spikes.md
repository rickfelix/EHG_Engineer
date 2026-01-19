# leo_risk_spikes Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-19T00:41:19.984Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| prd_id | `text` | **NO** | - | - |
| risk_title | `text` | **NO** | - | - |
| risk_description | `text` | **NO** | - | - |
| spike_duration_days | `numeric(3,1)` | **NO** | - | - |
| acceptance_criteria | `jsonb` | **NO** | `'[]'::jsonb` | - |
| status | `text` | **NO** | - | - |
| findings | `text` | YES | - | - |
| mitigation_plan | `text` | YES | - | - |
| started_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `leo_risk_spikes_pkey`: PRIMARY KEY (id)

### Check Constraints
- `leo_risk_spikes_spike_duration_days_check`: CHECK (((spike_duration_days > (0)::numeric) AND (spike_duration_days <= (5)::numeric)))
- `leo_risk_spikes_status_check`: CHECK ((status = ANY (ARRAY['identified'::text, 'in_progress'::text, 'completed'::text, 'mitigated'::text, 'accepted'::text])))

## Indexes

- `leo_risk_spikes_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_risk_spikes_pkey ON public.leo_risk_spikes USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_risk_spikes (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_risk_spikes (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
