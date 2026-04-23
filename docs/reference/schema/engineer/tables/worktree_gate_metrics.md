# worktree_gate_metrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-23T10:28:51.042Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_key | `text` | **NO** | - | - |
| session_id | `text` | YES | - | - |
| gate_name | `text` | **NO** | - | - |
| operation | `text` | **NO** | - | - |
| result | `text` | **NO** | - | - |
| worktree_path | `text` | YES | - | - |
| expected_worktree | `text` | YES | - | - |
| actual_cwd | `text` | YES | - | - |
| duration_ms | `integer(32)` | YES | - | - |
| error_message | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `worktree_gate_metrics_pkey`: PRIMARY KEY (id)

### Check Constraints
- `worktree_gate_metrics_result_check`: CHECK ((result = ANY (ARRAY['pass'::text, 'fail'::text, 'skip'::text, 'error'::text])))

## Indexes

- `idx_worktree_gate_metrics_created_at`
  ```sql
  CREATE INDEX idx_worktree_gate_metrics_created_at ON public.worktree_gate_metrics USING btree (created_at)
  ```
- `idx_worktree_gate_metrics_sd_key`
  ```sql
  CREATE INDEX idx_worktree_gate_metrics_sd_key ON public.worktree_gate_metrics USING btree (sd_key)
  ```
- `worktree_gate_metrics_pkey`
  ```sql
  CREATE UNIQUE INDEX worktree_gate_metrics_pkey ON public.worktree_gate_metrics USING btree (id)
  ```

## RLS Policies

### 1. Authenticated can read worktree_gate_metrics (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Service role can insert worktree_gate_metrics (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
