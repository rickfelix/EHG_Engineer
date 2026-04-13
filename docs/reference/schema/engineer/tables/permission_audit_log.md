# permission_audit_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-13T16:20:07.411Z
**Rows**: 1,022
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| session_id | `text` | **NO** | - | Claude Code session identifier (from SESSION_ID env var or generated) |
| tool_name | `text` | **NO** | - | Name of the tool that was evaluated (e.g. Bash, mcp__supabase__apply_migration) |
| rule_code | `text` | **NO** | - | Enforcement rule code that triggered the decision (e.g. BLOCK_APPLY_MIGRATION) |
| rule_description | `text` | YES | - | - |
| outcome | `text` | **NO** | - | Enforcement decision: allow, block, override, or warn |
| context_hash | `text` | YES | - | SHA-256 (truncated to 16 chars) of the tool input JSON for correlation |
| metadata | `jsonb` | YES | `'{}'::jsonb` | Additional context: tool input snippet, rule details, override reason, etc. |

## Constraints

### Primary Key
- `permission_audit_log_pkey`: PRIMARY KEY (id)

### Check Constraints
- `permission_audit_log_outcome_check`: CHECK ((outcome = ANY (ARRAY['allow'::text, 'block'::text, 'override'::text, 'warn'::text])))

## Indexes

- `idx_permission_audit_created`
  ```sql
  CREATE INDEX idx_permission_audit_created ON public.permission_audit_log USING btree (created_at)
  ```
- `idx_permission_audit_outcome`
  ```sql
  CREATE INDEX idx_permission_audit_outcome ON public.permission_audit_log USING btree (outcome)
  ```
- `idx_permission_audit_session`
  ```sql
  CREATE INDEX idx_permission_audit_session ON public.permission_audit_log USING btree (session_id)
  ```
- `permission_audit_log_pkey`
  ```sql
  CREATE UNIQUE INDEX permission_audit_log_pkey ON public.permission_audit_log USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
