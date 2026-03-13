# Vision: Venture Data Architecture Improvements

## Executive Summary
The EHG venture management system has grown to 73+ tables dependent on the central `ventures` entity, but lacks standard lifecycle management patterns. Deleting, archiving, or resetting venture data requires bespoke scripts with deep knowledge of every FK relationship. This vision establishes a systematic approach to venture data lifecycle management: consistent FK constraint policies, a hybrid soft-delete/cold-storage archive pattern, automated development teardown/seed utilities, and schema health monitoring.

The goal is to make venture lifecycle operations (create, archive, restore, purge) first-class capabilities rather than ad-hoc scripts, while establishing a reusable pattern for other central entities (companies, portfolios).

## Problem Statement
When attempting to delete 7 test ventures from the database, we discovered that no standard utility existed. A custom 150-line script was required, which had to handle 73+ child tables in the correct FK ordering. The script was immediately blocked by an unanticipated RESTRICT constraint on `chairman_decisions`. Multiple tables referenced in migrations were missing from the live schema cache. There is no way to soft-delete or archive a venture, no audit trail of deletions, and no safe way to manage test data in development.

**Who is affected:**
- Developers working with test data (blocked by manual cleanup)
- The LEO protocol (FK surprises during SD execution)
- EVA's venture management (no archive/restore capability)
- Chairman dashboard (no way to "park" or archive ventures)

**Current impact:** Every venture lifecycle operation beyond creation is a manual, risky, undocumented process.

## Personas

### Developer (Primary)
- **Goals:** Quickly create and tear down test ventures, run reliable E2E tests
- **Mindset:** Wants `npm run` commands that just work, hates discovering FK constraints at runtime
- **Key Activities:** Running integration tests, seeding test data, cleaning up after test runs

### LEO Orchestrator
- **Goals:** Execute SDs against ventures without FK constraint surprises
- **Mindset:** Expects database operations to be predictable and well-documented
- **Key Activities:** Creating venture-linked SDs, managing venture metadata, phase transitions

### Chairman (via EVA)
- **Goals:** Archive ventures that are paused/killed, restore if reconsidered, purge after retention period
- **Mindset:** Expects governance decisions to be preserved even when ventures are archived
- **Key Activities:** Venture lifecycle decisions, portfolio management, audit review

## Information Architecture

### Data Layer Structure
```
ventures (central entity)
├── Data Tables (CASCADE on delete)
│   ├── venture_stage_transitions
│   ├── venture_documents
│   ├── venture_financial_contract
│   ├── venture_phase_budgets
│   ├── venture_token_budgets/ledger
│   ├── marketing_*, channel_*, distribution_*
│   ├── naming_suggestions, naming_favorites
│   ├── competitors, financial_models
│   └── ... (50+ tables)
├── Governance Tables (RESTRICT on delete)
│   ├── chairman_decisions
│   ├── chairman_directives
│   ├── governance_decisions
│   ├── compliance_gate_events
│   ├── risk_escalation_log
│   └── risk_gate_passage_log
├── EVA Tables (CASCADE or SET NULL)
│   ├── eva_ventures
│   ├── eva_vision_documents
│   ├── eva_architecture_plans
│   ├── eva_interactions
│   └── eva_orchestration_events
└── SD Tables (SET NULL on delete)
    ├── strategic_directives_v2
    ├── sd_phase_handoffs
    ├── sd_proposals
    └── product_requirements_v2
```

### View Layer
- `v_active_ventures` — ventures WHERE deleted_at IS NULL AND status != 'archived'
- `v_archived_ventures` — ventures WHERE status = 'archived' AND deleted_at IS NULL
- `v_deleted_ventures` — ventures WHERE deleted_at IS NOT NULL (soft-deleted, awaiting cold storage)

### CLI Commands
- `npm run venture:teardown` — delete ventures and all child data (dev only)
- `npm run venture:archive <id>` — soft-delete a venture (sets deleted_at)
- `npm run venture:restore <id>` — restore a soft-deleted venture
- `npm run venture:purge` — move soft-deleted ventures older than N days to cold storage
- `npm run db:fk-audit` — compare migration FK definitions vs live constraints

## Key Decision Points

1. **CASCADE vs RESTRICT classification** — Each of the 73 child tables must be classified as CASCADE (data), RESTRICT (governance), or SET NULL (cross-references). This classification is the critical gate before any migration.

2. **View vs query modification** — Adding soft-delete requires either: (a) a view layer that filters deleted records, or (b) modifying every query to add `WHERE deleted_at IS NULL`. The view approach is strongly preferred for maintainability.

3. **Cold storage trigger** — When should soft-deleted ventures move to archive tables? Options: scheduled job (daily/weekly), manual trigger, or retention-based (after N days). Retention-based with configurable threshold is recommended.

4. **Governance table handling on archive** — Governance tables (chairman_decisions, etc.) should NOT be deleted or archived when a venture is archived. They represent permanent audit records. The FK should RESTRICT delete but allow the venture to be soft-deleted (since soft-delete doesn't trigger FK cascades).

## Integration Patterns

### EVA Integration
- `eva_ventures` links to `ventures` — archive should SET NULL on `eva_ventures.venture_id` or soft-delete the EVA venture record
- Vision and architecture documents remain discoverable even after venture archive (they have independent value)

### LEO Protocol Integration
- `strategic_directives_v2.venture_id` should SET NULL on archive (SDs remain in history)
- `sd_phase_handoffs.venture_id` should SET NULL (handoff records preserved)

### Chairman Dashboard Integration
- Archived ventures appear in a separate "Archived" section
- Chairman can trigger archive, restore, or purge from the UI
- All governance decisions for archived ventures remain visible in audit views

## Evolution Plan

### Phase 1: Foundation (Immediate)
- FK audit script: compare migration definitions vs live DB constraints
- Dev teardown utility: `npm run venture:teardown` (based on deletion script)
- Deliverable: Audit report classifying all 73 tables + working teardown command

### Phase 2: Soft-Delete (Short-term)
- Add `deleted_at` column to `ventures` table
- Create `v_active_ventures` view
- Update RLS policies to use the view
- Deliverable: `npm run venture:archive <id>` and `npm run venture:restore <id>`

### Phase 3: Selective FK Migration (Medium-term)
- Apply CASCADE/RESTRICT/SET NULL per table based on Phase 1 audit
- Migration runs in batches (10-15 tables per migration) to limit blast radius
- Deliverable: Consistent FK constraint policies across all 73 tables

### Phase 4: Cold Storage (Long-term)
- Create archive tables (mirrored schemas)
- Build scheduled purge job with configurable retention
- Add monitoring and alerting for archive job health
- Deliverable: `npm run venture:purge` + automated cold storage pipeline

## Out of Scope
- Multi-tenant data isolation (ventures are single-tenant today)
- GDPR right-to-erasure compliance (separate concern, separate SD)
- Archive table query interface (cold storage is for compliance, not active querying)
- Other entity lifecycle (companies, portfolios) — pattern documented but not implemented here

## UI/UX Wireframes
N/A — this is a backend/infrastructure improvement. Chairman dashboard integration for archive/restore actions would be a separate SD building on this foundation.

## Success Criteria
1. `npm run venture:teardown` deletes all ventures and child data in <10 seconds with zero FK errors
2. FK audit report covers 100% of tables referencing ventures, classifying each as CASCADE/RESTRICT/SET NULL
3. Soft-deleted ventures are invisible to all application queries without modifying existing SELECT statements
4. Archived ventures can be restored to full functionality with a single command
5. Cold storage migration handles all 73+ child tables automatically without manual intervention
6. Zero governance/audit data loss during any lifecycle operation
7. Pattern is documented well enough to replicate for companies and portfolios in <1 day each
