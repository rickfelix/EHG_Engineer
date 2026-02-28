---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Database Migration Validation - Two-Phase Approach


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, migration, schema, rls

**Generated**: 2025-10-28T21:47:56.049Z
**Source**: Database (leo_protocol_sections)
**Context Tier**: REFERENCE

---

**Database Migration Validation - Two-Phase Approach (MANDATORY)**:

**Phase 1: Static File Validation** (always runs):
- Migration files exist for SD-ID
- SQL syntax is valid
- Required patterns present (CREATE TABLE, ALTER TABLE)
- Cross-schema foreign keys detected

**Phase 2: Database Verification** (optional, via `--verify-db`):
- Tables mentioned in migration actually exist
- Tables are accessible (RLS policies)
- Seed data was inserted (with `--check-seed-data`)

**Commands**:
```bash
# Basic validation (file-only)
node scripts/validate-migration-files.js <SD-ID>

# Full validation (file + database + seed data)
node scripts/validate-migration-files.js <SD-ID> --verify-db --check-seed-data
```

**Complete Guide**: See `docs/database-migration-validation-guide.md`

---

*This is reference documentation, load on-demand only*
*Generated from: scripts/generate-claude-md-from-db-v3.js*
