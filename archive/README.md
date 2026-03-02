# Archive Directory Catalogue

Files superseded by newer implementations or applied migrations.

## migrations/legacy/ (26 files)

SQL migration files that have been applied to the database and are retained for reference.

| File | Purpose |
|------|---------|
| 001_add_status_field_to_sdip_submissions.sql | Add status tracking to SDIP submissions |
| 001_initial_schema.sql | Initial database schema creation |
| 002_onboarding_progress.sql | Onboarding progress tracking tables |
| 003_analytics_events.sql | Analytics event logging tables |
| 007_sdip_database_improvements.sql | SDIP schema improvements |
| 008_ui_validation_schema.sql | UI validation tables |
| 009_create_learning_tables.sql | Pattern learning tables |
| 014_leo_gap_remediation.sql | LEO gap analysis tables |
| 015_leo_gap_remediation_polish.sql | LEO gap analysis refinements |
| 2025-01-17-prod-hardening.sql | Production hardening migration |
| add_message_bus_tables.sql | Message bus infrastructure |
| add_user_stories_table.sql | User stories table |
| cleanup_empty_handoff_executions.sql | Data cleanup migration |
| create_leo_handoff_executions.sql | Handoff execution tracking |
| fix-rollback-*.sql (4 files) | Various rollback scripts |
| migrate_to_sdv2.sql | Migration to strategic_directives_v2 |
| remaining files | Additional schema evolution migrations |

## migrations/manual_review/ (1 file)

| File | Purpose |
|------|---------|
| manifest.json | Migration review tracking manifest |

## scripts/user-story-generators/ (32 files)

Historical user story generation scripts for specific SDs. Superseded by unified PRD and story generation process (`scripts/add-prd-to-database.js`).

All files follow the pattern: `add-user-stories-sd-{sd-name}.js`

Categories:
- **Foundation v3** (8 files): SD-FOUNDATION-V3-001 through 008
- **Hardening** (3 files): SD-HARDENING-V1-001 through 003
- **Vision v2** (2 files): SD-VISION-V2-001, 002
- **QA Stages** (2 files): SD-QA-STAGES-001, 002
- **Stage Architecture** (2 files): SD-STAGE-ARCHITECTURE-001, 002
- **Other SDs** (15 files): Baseline sync, doc excellence, E2E selectors, etc.

## Total: 59 files

---
*Catalogued: 2026-02-16 | SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-B*
