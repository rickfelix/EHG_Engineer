# sd_scope_deliverables Constraint Reference


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-26
- **Tags**: database, api, testing, e2e

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Generated**: 2026-01-26
**Purpose**: Quick reference for valid enum values in sd_scope_deliverables

This document provides an easy-to-read reference for all CHECK constraint values on the `sd_scope_deliverables` table. Use this when inserting or updating records to avoid constraint violations.

---

## deliverable_type

Classification of the deliverable for filtering and reporting.

| Value | Description |
|-------|-------------|
| `database` | Database schema changes, migrations, or seed data |
| `ui_feature` | User interface components or pages |
| `api` | API endpoints or backend services |
| `documentation` | Documentation files, README updates, or guides |
| `configuration` | Configuration files, environment settings |
| `test` | Test files (unit, integration, E2E) |
| `migration` | Database migration scripts |
| `integration` | Third-party integrations or external service connections |
| `other` | Deliverables that don't fit other categories |

**Constraint**: `sd_scope_deliverables_deliverable_type_check`

---

## priority

Determines whether the deliverable blocks SD completion.

| Value | Description |
|-------|-------------|
| `required` | **Must complete** - SD cannot be marked complete until this is done |
| `optional` | **Nice to have** - SD can complete without this, but recommended |
| `nice_to_have` | **Low priority** - Can be deferred to future work |

**Default**: `required`
**Constraint**: `sd_scope_deliverables_priority_check`

---

## completion_status

Current state of the deliverable in the workflow.

| Value | Description |
|-------|-------------|
| `pending` | Not started - awaiting work |
| `in_progress` | Work has begun but not complete |
| `completed` | Successfully finished and verified |
| `skipped` | Intentionally not done (with justification) |
| `blocked` | Cannot proceed due to external dependency |

**Default**: `pending`
**Constraint**: `sd_scope_deliverables_completion_status_check`

---

## verified_by

Agent or sub-agent that verified the deliverable completion. Can be NULL if not yet verified.

### LEO Protocol Agents (Primary)

| Value | Description |
|-------|-------------|
| `LEAD` | Strategic Leadership Agent |
| `PLAN` | Technical Planning Agent |
| `EXEC` | Implementation Agent |
| `EXEC_IMPL` | Implementation execution |

### Sub-Agents (Secondary)

| Value | Description |
|-------|-------------|
| `DATABASE` / `database` / `database-agent` | Database Architecture sub-agent |
| `DATABASE_ARCHITECT` | Database Architecture specialist |
| `DESIGN` / `DESIGN_AGENT` / `DESIGN_REVIEWER` | Design sub-agent |
| `DOCMON` | Documentation Monitor sub-agent |
| `GITHUB` / `GITHUB_ACTIONS` | DevOps/CI sub-agent |
| `LEAD_PRE_APPROVAL` / `LEAD_VALIDATION` | LEAD phase validation |
| `PERFORMANCE` | Performance sub-agent |
| `QA` / `qa` / `QA_DIRECTOR` | Quality Assurance sub-agent |
| `RETRO` | Retrospective sub-agent |
| `RISK` | Risk Assessment sub-agent |
| `SECURITY` | Security sub-agent |
| `STORIES` | User Story sub-agent |
| `TESTING` / `testing` / `TESTING_VALIDATOR` | Testing sub-agent |
| `VALIDATION` / `VALIDATION_GATE` | Validation sub-agent |
| `ARCHITECT` | Architecture sub-agent |
| `devops` | DevOps sub-agent |

### Legacy/Special Values

| Value | Description |
|-------|-------------|
| `SD-CREWAI-ARCHITECTURE-001` | Legacy CrewAI architecture SD |
| `SD-VENTURE-UNIFICATION-001` | Legacy venture unification SD |

**Nullable**: Yes - NULL means not yet verified
**Constraint**: `sd_scope_deliverables_verified_by_check`

---

## Usage Examples

### Insert with Required Fields

```sql
INSERT INTO sd_scope_deliverables (
  sd_id,
  deliverable_type,
  deliverable_name,
  priority,
  completion_status
) VALUES (
  'SD-EXAMPLE-001',
  'api',           -- Must be from deliverable_type list
  'User API endpoint',
  'required',      -- Must be from priority list
  'pending'        -- Must be from completion_status list
);
```

### Update Verified By

```sql
UPDATE sd_scope_deliverables
SET
  verified_by = 'TESTING',  -- Must be from verified_by list or NULL
  verified_at = NOW(),
  completion_status = 'completed'
WHERE id = 'some-uuid';
```

---

## Related Documentation

- [sd_scope_deliverables Table Schema](./sd_scope_deliverables.md) - Full table definition
- [Database Schema Overview](../database-schema-overview.md) - All tables

---

[Back to Schema Overview](../database-schema-overview.md)
