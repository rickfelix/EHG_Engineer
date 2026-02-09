# protocol_constitution Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-09T02:29:22.689Z
**Rows**: 11
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| rule_code | `character varying(50)` | **NO** | - | Unique rule identifier (e.g., CONST-001) |
| rule_text | `text` | **NO** | - | The actual rule text that must be followed |
| category | `character varying(50)` | YES | - | Rule category: safety, governance, audit |
| rationale | `text` | YES | - | Explanation of why this rule exists |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `protocol_constitution_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `protocol_constitution_rule_code_key`: UNIQUE (rule_code)

## Indexes

- `protocol_constitution_pkey`
  ```sql
  CREATE UNIQUE INDEX protocol_constitution_pkey ON public.protocol_constitution USING btree (id)
  ```
- `protocol_constitution_rule_code_key`
  ```sql
  CREATE UNIQUE INDEX protocol_constitution_rule_code_key ON public.protocol_constitution USING btree (rule_code)
  ```

## RLS Policies

### 1. insert_constitution (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. no_delete_constitution (DELETE)

- **Roles**: {public}
- **Using**: `false`

### 3. no_update_constitution (UPDATE)

- **Roles**: {public}
- **Using**: `false`

### 4. select_constitution (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
