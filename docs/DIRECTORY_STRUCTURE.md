# Documentation Directory Structure

This document explains the organization and naming conventions for the `/docs` directory.

## Directory Naming Convention

### Primary Documentation (Numbered 01-06)
Core documentation organized by topic in logical order:

| Directory | Purpose |
|-----------|---------|
| `01_architecture/` | System architecture, design decisions, technical overview |
| `02_api/` | API documentation, endpoints, specifications |
| `03_protocols_and_standards/` | LEO Protocol, standards, governance |
| `04_features/` | Feature documentation, user guides |
| `05_testing/` | Testing strategies, QA processes |
| `06_deployment/` | Deployment procedures, infrastructure |

**Naming**: `0X_category_name/` where X is the sequence number

### Supporting Documentation (Non-numbered)
Utility and cross-cutting documentation:

| Directory | Purpose |
|-----------|---------|
| `analysis/` | Issue investigations, assessments, reviews |
| `archive/` | Historical documents, deprecated content |
| `database/` | Database schema, RLS policies, architecture |
| `EHG/` | EHG application-specific documentation |
| `EHG_Engineering/` | EHG_Engineer backend API and LEO Protocol docs |
| `examples/` | Code examples, sample implementations |
| `guides/` | How-to guides, tutorials, quick starts |
| `handoffs/` | Inter-agent handoff documentation |
| `issues/` | Tracked issues, bugs, known problems |
| `lessons-learned/` | Retrospectives, post-mortems |
| `migrations/` | Migration guides and documentation |
| `operations/` | Operational procedures, runbooks |
| `product-requirements/` | PRDs for features and SDs |
| `reference/` | Quick reference, cheat sheets, patterns |
| `reports/` | Generated reports, analytics |
| `research/` | Research notes, explorations, POCs |
| `retrospectives/` | Detailed implementation retrospectives |
| `summaries/` | Status updates, completion reports |
| `templates/` | Document templates, boilerplates |
| `troubleshooting/` | Common problems and solutions |
| `workflow/` | Workflow documentation and processes |

**Naming**: `category_name/` (descriptive, kebab-case if needed)

## Rationale

### Why Numbered for Primary Categories?
1. **Logical ordering**: Represents information architecture hierarchy
2. **Navigation**: Clear sequence for learning the system
3. **Stability**: Primary categories rarely change

### Why Non-numbered for Supporting?
1. **Flexibility**: Easy to add/remove as needed
2. **Alphabetical**: Natural ordering without forced sequence
3. **Cross-cutting**: Don't fit in linear hierarchy

## Adding New Directories

### For Primary Documentation
Only add numbered directories for major new documentation categories:
1. Propose new category in team discussion
2. Assign next available number (07, 08, etc.)
3. Create directory with README.md
4. Update this document

### For Supporting Documentation
Create freely as needed:
1. Choose descriptive, clear name (kebab-case)
2. Create directory with README.md
3. Update this document
4. Add to `.gitignore` if temporary

## Directory Standards

Every directory MUST have:
- [ ] `README.md` explaining purpose
- [ ] Clear naming (no spaces, lowercase)
- [ ] Documented file naming convention
- [ ] Ownership/maintenance noted

## File Naming Within Directories

### General Pattern
```
{TYPE}_{IDENTIFIER}_{DESCRIPTION}.md
```

### Examples
```
SD-DATA-INTEGRITY-001_COMPLETION_SUMMARY.md
HANDOFF-LEAD-PLAN-2025-001.md
database_migration_guide.md
```

### Conventions
- Use **kebab-case** for multi-word descriptors
- Use **SCREAMING_SNAKE_CASE** for generated files (CLAUDE_CORE.md)
- Include **identifiers** (SD-XXX-001, PRD-XXX-001) for traceability
- Add **dates** (YYYY-MM-DD) for time-based documents

## Navigation

### Entry Points
1. **Root README.md**: Project overview and quick start
2. **docs/README.md**: Documentation index (needs update)
3. **Directory READMEs**: Specific topic guidance

### Finding Documentation
```bash
# List all documentation categories
ls -d docs/*/

# Search for specific topic
grep -r "search term" docs/

# Find recent updates
find docs/ -type f -name "*.md" -mtime -7
```

## Maintenance

### Quarterly Review
- Archive outdated documents
- Update directory READMEs
- Verify file naming consistency
- Check for orphaned files

### When Renaming
1. Update all internal references
2. Add redirect in README if needed
3. Notify team in commit message
4. Document in CHANGELOG.md

---

**Last Updated**: 2025-12-29
**Maintained By**: Documentation Organization Initiative
**Version**: 1.1

*Part of LEO Protocol v4.3.3 - Documentation Organization*
