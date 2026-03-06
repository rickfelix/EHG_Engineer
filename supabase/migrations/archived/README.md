# Archived Migrations

Migration files that have been triaged as ARCHIVE — the file is preserved for reference but the table/objects were intentionally not created in the live database.

## SD-MAN-INFRA-TRIAGE-APPLY-UNAPPLIED-001 (2026-03-06)

### 20260302_governance_guardrail_db_enforcement.sql
- **Decision**: ARCHIVE
- **Rationale**: The `guardrail_enforcement_log` audit table has 0 active code references. The governance triggers and constraints defined in this file are already applied through the companion migration `20260302_governance_guardrail_triggers.sql`. Only the audit log table was missing, and no code writes to or reads from it.
- **Original SD**: SD-LEO-GEN-ENFORCE-GOVERNANCE-GUARDRAILS-001
