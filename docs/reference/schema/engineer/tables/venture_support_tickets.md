# venture_support_tickets Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-01T20:27:50.592Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | Owning venture. Nullable: an unresolvable/unattributed ticket still escalates and is persisted here (venture_id=NULL) for human triage, rather than being silently dropped -- but is NEVER auto-resolved without one. |
| ticket_id | `text` | **NO** | - | Caller-supplied ticket identifier from the intake channel (unique per venture). |
| channel | `text` | **NO** | - | Intake channel the ticket arrived on (e.g. email, webhook) -- used to resolve the per-venture rail address. |
| subject | `text` | YES | - | - |
| body | `text` | **NO** | - | - |
| customer_ref | `text` | YES | - | - |
| category | `text` | **NO** | - | - |
| severity | `text` | **NO** | `'low'::text` | - |
| routing_decision | `text` | YES | - | - |
| status | `text` | **NO** | `'open'::text` | - |
| resolution_notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_support_tickets_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_support_tickets_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_support_tickets_ticket_id_venture_unique`: UNIQUE (venture_id, ticket_id)

### Check Constraints
- `venture_support_tickets_severity_check`: CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))
- `venture_support_tickets_status_check`: CHECK ((status = ANY (ARRAY['open'::text, 'auto_resolved'::text, 'escalated'::text, 'resolved'::text, 'closed'::text])))

## Indexes

- `idx_venture_support_tickets_status`
  ```sql
  CREATE INDEX idx_venture_support_tickets_status ON public.venture_support_tickets USING btree (status) WHERE (status = ANY (ARRAY['open'::text, 'escalated'::text]))
  ```
- `idx_venture_support_tickets_unattributed_ticket_id_unique`
  ```sql
  CREATE UNIQUE INDEX idx_venture_support_tickets_unattributed_ticket_id_unique ON public.venture_support_tickets USING btree (ticket_id) WHERE (venture_id IS NULL)
  ```
- `idx_venture_support_tickets_venture_created`
  ```sql
  CREATE INDEX idx_venture_support_tickets_venture_created ON public.venture_support_tickets USING btree (venture_id, created_at DESC)
  ```
- `venture_support_tickets_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_support_tickets_pkey ON public.venture_support_tickets USING btree (id)
  ```
- `venture_support_tickets_ticket_id_venture_unique`
  ```sql
  CREATE UNIQUE INDEX venture_support_tickets_ticket_id_venture_unique ON public.venture_support_tickets USING btree (venture_id, ticket_id)
  ```

## RLS Policies

### 1. venture_support_tickets_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
