# Archived PRD Scripts (Legacy)

**Archived**: 2026-01-23
**SD**: SD-LEO-INFRA-PRD-CREATION-CONSOLIDATION-001
**Reason**: Consolidated to single canonical PRD creation method

## Why These Were Archived

These scripts were part of a **template-based PRD creation approach** that produced PRDs with TODO placeholders instead of derived content. The approach had several issues:

1. **TODO Placeholders**: Template-based scripts produced PRDs with `[TODO: ...]` content
2. **Two Codepaths**: Confusion about which method to use (template vs modular)
3. **No SD Derivation**: Template didn't extract content from SD fields
4. **Manual Editing Required**: Users had to manually fill in PRD details

## Canonical Method (Use This Instead)

```bash
node scripts/add-prd-to-database.js <SD-ID> [PRD-Title]
```

The canonical method (`scripts/add-prd-to-database.js`) provides:
- **LLM-based content generation** (no TODOs)
- **SD field derivation** (functional requirements from strategic_objectives)
- **Sub-agent orchestration** (DESIGN, DATABASE, SECURITY, RISK)
- **Persona ingestion** (stakeholder-aware content)
- **Component recommendations** (semantic UI matching)

## Archived Files (This Directory)

| File | Original Location | Purpose |
|------|-------------------|---------|
| `generate-prd-script.js` | `scripts/` | Created template-based PRD scripts |
| `prd-script-template.js` | `templates/` | Static template with TODO placeholders |
| `add-prd-to-database-refactored.js` | `scripts/` | Old version (confusing name - actually older than modular version) |

The `create-prd-*.js` scripts in this directory are outputs from the template-based approach.

## Related Changes

- `scripts/modules/handoff/executors/lead-to-plan/prd-generation.js` updated to call canonical method
- LEAD-TO-PLAN handoff now creates PRDs with LLM-generated content directly

## Do Not Restore

These scripts should **NOT** be restored. If you need PRD creation functionality, use the canonical method:

```bash
# Via CLI
node scripts/add-prd-to-database.js SD-XXX-001

# Via LEAD-TO-PLAN handoff (automatic)
node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001
```
