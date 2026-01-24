# vertical_complexity_multipliers Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-24T02:31:56.951Z
**Rows**: 5
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| vertical_category | `character varying(50)` | **NO** | - | Industry vertical identifier (healthcare, fintech, edtech, logistics, other) |
| complexity_multiplier | `numeric(4,2)` | **NO** | `1.0` | Multiplier for estimating complexity based on vertical (1.0-2.0 range) |
| risk_adjustment_factor | `numeric(4,2)` | **NO** | `1.0` | Multiplier for risk assessment (1.0-2.0 range) |
| min_market_validation_confidence | `numeric(4,2)` | **NO** | `0.70` | Minimum confidence threshold for market validation (0.0-1.0) |
| health_threshold_green | `numeric(4,2)` | **NO** | `0.75` | Health score threshold for "green" status (0.0-1.0) |
| health_threshold_yellow | `numeric(4,2)` | **NO** | `0.50` | Health score threshold for "yellow" status (0.0-1.0) |
| description | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `vertical_complexity_multipliers_pkey`: PRIMARY KEY (vertical_category)

## Indexes

- `vertical_complexity_multipliers_pkey`
  ```sql
  CREATE UNIQUE INDEX vertical_complexity_multipliers_pkey ON public.vertical_complexity_multipliers USING btree (vertical_category)
  ```

## RLS Policies

### 1. authenticated_read_vertical_complexity_multipliers (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_vertical_complexity_multipliers (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
