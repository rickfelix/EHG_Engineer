# documentation_inventory Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-02T05:32:45.383Z
**Rows**: 398
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| file_path | `text` | **NO** | - | - |
| file_name | `text` | **NO** | - | - |
| file_type | `text` | YES | - | - |
| file_size | `integer(32)` | YES | - | - |
| doc_category | `text` | YES | - | - |
| related_sd_id | `text` | YES | - | - |
| related_agent | `text` | YES | - | - |
| last_modified | `timestamp with time zone` | YES | - | - |
| content_hash | `text` | YES | - | - |
| is_database_first | `boolean` | YES | `false` | - |
| should_be_in_database | `boolean` | YES | `false` | - |
| documentation_complete | `boolean` | YES | `false` | - |
| last_reviewed | `timestamp with time zone` | YES | - | - |
| review_required | `boolean` | YES | `false` | - |
| status | `text` | YES | `'ACTIVE'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `documentation_inventory_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `documentation_inventory_related_sd_id_fkey`: related_sd_id → strategic_directives_v2(id)

### Unique Constraints
- `documentation_inventory_file_path_key`: UNIQUE (file_path)

### Check Constraints
- `documentation_inventory_doc_category_check`: CHECK ((doc_category = ANY (ARRAY['STRATEGIC'::text, 'TECHNICAL'::text, 'OPERATIONAL'::text, 'REFERENCE'::text, 'TUTORIAL'::text, 'API'::text, 'ARCHITECTURE'::text, 'RETROSPECTIVE'::text, 'HANDOFF'::text, 'PRD'::text, 'UNKNOWN'::text])))
- `documentation_inventory_related_agent_check`: CHECK ((related_agent = ANY (ARRAY['LEAD'::text, 'PLAN'::text, 'EXEC'::text, 'ALL'::text, NULL::text])))
- `documentation_inventory_status_check`: CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'ARCHIVED'::text, 'DEPRECATED'::text, 'VIOLATION'::text])))

## Indexes

- `documentation_inventory_file_path_key`
  ```sql
  CREATE UNIQUE INDEX documentation_inventory_file_path_key ON public.documentation_inventory USING btree (file_path)
  ```
- `documentation_inventory_pkey`
  ```sql
  CREATE UNIQUE INDEX documentation_inventory_pkey ON public.documentation_inventory USING btree (id)
  ```
- `idx_doc_inventory_category`
  ```sql
  CREATE INDEX idx_doc_inventory_category ON public.documentation_inventory USING btree (doc_category)
  ```
- `idx_doc_inventory_sd_id`
  ```sql
  CREATE INDEX idx_doc_inventory_sd_id ON public.documentation_inventory USING btree (related_sd_id)
  ```
- `idx_doc_inventory_status`
  ```sql
  CREATE INDEX idx_doc_inventory_status ON public.documentation_inventory USING btree (status)
  ```
- `idx_doc_inventory_violations`
  ```sql
  CREATE INDEX idx_doc_inventory_violations ON public.documentation_inventory USING btree (should_be_in_database)
  ```

## RLS Policies

### 1. authenticated_read_documentation_inventory (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_documentation_inventory (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### tr_detect_violations

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION detect_documentation_violations()`

### tr_detect_violations

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION detect_documentation_violations()`

### tr_doc_inventory_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_doc_monitor_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
