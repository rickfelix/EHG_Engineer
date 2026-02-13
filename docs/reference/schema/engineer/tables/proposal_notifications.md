# proposal_notifications Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T20:38:04.433Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| proposal_id | `uuid` | **NO** | - | - |
| notification_type | `character varying(50)` | **NO** | - | - |
| recipient_id | `character varying(100)` | **NO** | - | - |
| recipient_email | `character varying(255)` | YES | - | - |
| recipient_role | `character varying(50)` | YES | - | - |
| subject | `character varying(500)` | **NO** | - | - |
| body | `text` | **NO** | - | - |
| priority | `character varying(20)` | YES | `'normal'::character varying` | - |
| status | `character varying(20)` | YES | `'pending'::character varying` | - |
| sent_at | `timestamp without time zone` | YES | - | - |
| delivered_at | `timestamp without time zone` | YES | - | - |
| failed_at | `timestamp without time zone` | YES | - | - |
| retry_count | `integer(32)` | YES | `0` | - |
| error_message | `text` | YES | - | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| scheduled_for | `timestamp without time zone` | YES | - | - |
| expires_at | `timestamp without time zone` | YES | - | - |

## Constraints

### Primary Key
- `proposal_notifications_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `proposal_notifications_proposal_id_fkey`: proposal_id → governance_proposals(id)

### Check Constraints
- `proposal_notifications_notification_type_check`: CHECK (((notification_type)::text = ANY ((ARRAY['submission'::character varying, 'approval_request'::character varying, 'approval_received'::character varying, 'rejection'::character varying, 'state_change'::character varying, 'stale_warning'::character varying, 'reminder'::character varying, 'escalation'::character varying])::text[])))
- `proposal_notifications_priority_check`: CHECK (((priority)::text = ANY ((ARRAY['urgent'::character varying, 'high'::character varying, 'normal'::character varying, 'low'::character varying])::text[])))
- `proposal_notifications_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'sent'::character varying, 'delivered'::character varying, 'failed'::character varying, 'bounced'::character varying])::text[])))

## Indexes

- `idx_notifications_pending`
  ```sql
  CREATE INDEX idx_notifications_pending ON public.proposal_notifications USING btree (status) WHERE ((status)::text = 'pending'::text)
  ```
- `idx_notifications_scheduled`
  ```sql
  CREATE INDEX idx_notifications_scheduled ON public.proposal_notifications USING btree (scheduled_for) WHERE (scheduled_for IS NOT NULL)
  ```
- `proposal_notifications_pkey`
  ```sql
  CREATE UNIQUE INDEX proposal_notifications_pkey ON public.proposal_notifications USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_proposal_notifications (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_proposal_notifications (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
