# fleet_liveness_estimates Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-23T19:41:40.179Z
**Rows**: 1,364
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | Surrogate PK for the observation. |
| session_id | `text` | **NO** | - | FK -> claude_sessions.session_id (TEXT, UNIQUE). ON DELETE CASCADE so pruning a session also prunes its estimates. |
| observed_at | `timestamp with time zone` | **NO** | `now()` | Wall-clock time of the observation. Drives the 5-minute calibration window. |
| heartbeat_age_sec | `integer(32)` | **NO** | - | Seconds since the session last heartbeated at observation time. Input feature. |
| pid_alive | `boolean` | **NO** | - | Whether the claimed PID was alive at observation time. Input feature. |
| port_open | `boolean` | **NO** | - | Whether the claimed session port was open at observation time. Input feature. |
| phase | `text` | **NO** | - | LEO phase the session reported (LEAD/PLAN/EXEC/etc). Input feature. |
| scope_bucket | `text` | **NO** | - | Coarse scope bucket for the work in-flight. Input feature for the MC model. |
| p_alive | `numeric(5,4)` | **NO** | - | Posterior point estimate of P(session is alive). 4 decimal precision. |
| p_alive_ci_low | `numeric(5,4)` | **NO** | - | Lower bound of the credible interval on p_alive. Enforced <= p_alive. |
| p_alive_ci_high | `numeric(5,4)` | **NO** | - | Upper bound of the credible interval on p_alive. Enforced >= p_alive. |
| mc_samples | `integer(32)` | **NO** | - | Number of Monte Carlo samples that produced this estimate. |
| actual_liveness_t5 | `boolean` | YES | - | Ground truth -- was the session actually alive 5 minutes after observed_at? Back-filled by the calibration loop. NULL until back-fill runs. This is the ONLY column permitted to be UPDATEd post-insert -- all others are immutable. |
| created_at | `timestamp with time zone` | **NO** | `now()` | Row creation timestamp. Distinct from observed_at so clock-skewed inserts are traceable. |

## Constraints

### Primary Key
- `fleet_liveness_estimates_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `fleet_liveness_estimates_session_id_fkey`: session_id → claude_sessions(session_id)

### Check Constraints
- `fleet_liveness_ci_high_range`: CHECK (((p_alive_ci_high >= (0)::numeric) AND (p_alive_ci_high <= (1)::numeric)))
- `fleet_liveness_ci_low_range`: CHECK (((p_alive_ci_low >= (0)::numeric) AND (p_alive_ci_low <= (1)::numeric)))
- `fleet_liveness_ci_ordering`: CHECK (((p_alive_ci_low <= p_alive) AND (p_alive <= p_alive_ci_high)))
- `fleet_liveness_heartbeat_age_nonneg`: CHECK ((heartbeat_age_sec >= 0))
- `fleet_liveness_mc_samples_nonneg`: CHECK ((mc_samples >= 0))
- `fleet_liveness_p_alive_range`: CHECK (((p_alive >= (0)::numeric) AND (p_alive <= (1)::numeric)))

## Indexes

- `fleet_liveness_estimates_pkey`
  ```sql
  CREATE UNIQUE INDEX fleet_liveness_estimates_pkey ON public.fleet_liveness_estimates USING btree (id)
  ```
- `idx_fleet_liveness_observed_at`
  ```sql
  CREATE INDEX idx_fleet_liveness_observed_at ON public.fleet_liveness_estimates USING btree (observed_at DESC)
  ```
- `idx_fleet_liveness_pending_backfill`
  ```sql
  CREATE INDEX idx_fleet_liveness_pending_backfill ON public.fleet_liveness_estimates USING btree (observed_at) WHERE (actual_liveness_t5 IS NULL)
  ```
- `idx_fleet_liveness_session`
  ```sql
  CREATE INDEX idx_fleet_liveness_session ON public.fleet_liveness_estimates USING btree (session_id, observed_at DESC)
  ```

## RLS Policies

### 1. authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
