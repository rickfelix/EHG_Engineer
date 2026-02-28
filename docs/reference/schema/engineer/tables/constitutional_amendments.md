# constitutional_amendments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-28T03:30:25.261Z
**Rows**: 1
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| rule_code | `text` | **NO** | - | References which CONST rule is being amended (e.g., CONST-001) |
| original_text | `text` | YES | - | Snapshot of the original rule_text at time of amendment proposal |
| proposed_text | `text` | **NO** | - | The new proposed text for the rule |
| rationale | `text` | **NO** | - | Justification for why the amendment is proposed |
| status | `text` | **NO** | `'draft'::text` | Amendment lifecycle: draft -> active/rejected -> archived |
| proposed_by | `text` | YES | `'chairman'::text` | Who proposed the amendment (default: chairman) |
| approved_by | `text` | YES | - | Who approved the amendment (NULL until approved) |
| version | `integer(32)` | **NO** | `1` | Tracks amendment version number for the same rule_code |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `constitutional_amendments_pkey`: PRIMARY KEY (id)

### Check Constraints
- `constitutional_amendments_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'rejected'::text, 'archived'::text])))

## Indexes

- `constitutional_amendments_pkey`
  ```sql
  CREATE UNIQUE INDEX constitutional_amendments_pkey ON public.constitutional_amendments USING btree (id)
  ```
- `idx_constitutional_amendments_rule_code`
  ```sql
  CREATE INDEX idx_constitutional_amendments_rule_code ON public.constitutional_amendments USING btree (rule_code)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### set_constitutional_amendments_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trigger_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
