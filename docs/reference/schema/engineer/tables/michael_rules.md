# michael_rules Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 42
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| domain | `text` | **NO** | - | - |
| rule_key | `text` | **NO** | - | - |
| rule_text | `text` | **NO** | - | - |
| rule_json | `jsonb` | YES | - | - |
| status | `text` | **NO** | `'active'::text` | - |
| supersedes | `uuid` | YES | - | - |
| provenance | `jsonb` | **NO** | - | - |
| auto_apply | `boolean` | **NO** | `false` | - |
| auto_apply_since | `timestamp with time zone` | YES | - | - |
| auto_apply_verb | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `michael_rules_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `michael_rules_supersedes_fkey`: supersedes → michael_rules(id)

### Check Constraints
- `michael_rules_auto_apply_verb_check`: CHECK ((auto_apply_verb = ANY (ARRAY['label'::text, 'archive'::text, 'reschedule'::text])))
- `michael_rules_check`: CHECK (((auto_apply = false) OR ((auto_apply_verb IS NOT NULL) AND (auto_apply_since IS NOT NULL))))
- `michael_rules_check1`: CHECK (((auto_apply = false) OR (((provenance -> 'verifier'::text) ->> 'subject_hash'::text) IS NOT NULL)))
- `michael_rules_domain_check`: CHECK ((domain = ANY (ARRAY['gmail'::text, 'todoist'::text, 'calendar'::text, 'tasks'::text, 'body'::text, 'brief'::text, 'capture'::text, 'youtube'::text])))
- `michael_rules_provenance_check`: CHECK ((jsonb_typeof(provenance) = 'object'::text))
- `michael_rules_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text])))

## Indexes

- `michael_rules_active_domain_key_uniq`
  ```sql
  CREATE UNIQUE INDEX michael_rules_active_domain_key_uniq ON public.michael_rules USING btree (domain, rule_key) WHERE (status = 'active'::text)
  ```
- `michael_rules_pkey`
  ```sql
  CREATE UNIQUE INDEX michael_rules_pkey ON public.michael_rules USING btree (id)
  ```
- `michael_rules_supersedes_idx`
  ```sql
  CREATE INDEX michael_rules_supersedes_idx ON public.michael_rules USING btree (supersedes)
  ```

## RLS Policies

### 1. michael_rules_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### michael_rules_set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION michael_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
