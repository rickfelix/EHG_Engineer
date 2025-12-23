# Documentation Information Architecture

## Metadata
- **Category**: Architecture
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: DOCMON (Information Architecture Lead Sub-Agent)
- **Last Updated**: 2025-12-23
- **Tags**: documentation, information-architecture, standards, governance
- **SD Reference**: SD-DOCS-ARCH-001

## Overview

This document defines the information architecture for all documentation in the EHG_Engineer project. It specifies the folder hierarchy, naming conventions, cross-reference system, and navigation patterns that AI agents and human developers must follow when creating or organizing documentation.

## Table of Contents

1. [Folder Hierarchy](#folder-hierarchy)
2. [Naming Conventions](#naming-conventions)
3. [Cross-Reference System](#cross-reference-system)
4. [Index and Navigation Patterns](#index-and-navigation-patterns)
5. [Document Structure Standards](#document-structure-standards)
6. [AI Agent Guidelines](#ai-agent-guidelines)

---

## Folder Hierarchy

### Primary Documentation (Numbered 01-06)

Core documentation organized by topic in logical learning sequence:

```
/docs/
├── 01_architecture/       # System architecture, design decisions
├── 02_api/                # API documentation, endpoints
├── 03_protocols_and_standards/  # LEO Protocol, governance
├── 04_features/           # Feature documentation, user guides
├── 05_testing/            # Testing strategies, QA processes
├── 06_deployment/         # Deployment procedures, infrastructure
```

**Purpose of Each Numbered Directory:**

| Directory | Purpose | Content Types | Audience |
|-----------|---------|---------------|----------|
| `01_architecture/` | System design and technical overview | Architecture diagrams, design decisions, component specifications | Architects, senior engineers |
| `02_api/` | API specifications and usage | Endpoint docs, request/response schemas, authentication | Integration developers |
| `03_protocols_and_standards/` | Governance and process docs | LEO Protocol versions, coding standards, git workflows | All team members |
| `04_features/` | Feature documentation | User guides, feature specs, stage-based documentation | Product managers, developers |
| `05_testing/` | Testing and quality assurance | Test strategies, QA processes, coverage requirements | QA engineers, developers |
| `06_deployment/` | Deployment and operations | Deployment guides, infrastructure docs, runbooks | DevOps, operations |

**When to Add New Numbered Directories:**
- Only for major new documentation categories
- Requires team discussion and approval
- Must represent a distinct knowledge domain
- Next available numbers: 07, 08, 09, etc.

### Supporting Documentation (Non-Numbered)

Utility and cross-cutting documentation organized alphabetically:

```
/docs/
├── agents/                # Agent-specific documentation
├── analysis/              # Issue investigations, assessments
├── approvals/             # Approval documents and decisions
├── archive/               # Historical docs, deprecated content
├── audit/                 # Audit reports and compliance docs
├── checkpoint/            # Project checkpoint documents
├── cli/                   # CLI tools and command documentation
├── database/              # Database schema, RLS policies
├── EHG/                   # EHG application-specific docs
├── EHG_Engineering/       # EHG_Engineer backend API docs
├── examples/              # Code examples, sample implementations
├── explanations/          # Detailed explanations of concepts
├── governance/            # Governance policies and procedures
├── guides/                # How-to guides, tutorials, quick starts
├── handoffs/              # Inter-agent handoff documentation
├── implementation/        # Implementation-specific docs
├── infrastructure/        # Infrastructure documentation
├── issues/                # Tracked issues, bugs, known problems
├── leo/                   # LEO Protocol-specific documentation
├── lessons-learned/       # Retrospectives, post-mortems
├── maintenance/           # Maintenance guides and schedules
├── merge-summaries/       # Git merge summaries
├── migration-reports/     # Migration documentation and reports
├── migrations/            # Migration guides
├── operations/            # Operational procedures, runbooks
├── parking-lot/           # Ideas and items for future consideration
├── patterns/              # Design patterns, best practices
├── pending-protocol-updates/  # Protocol updates under review
├── plans/                 # Project plans and roadmaps
├── product-requirements/  # PRDs for features and SDs
├── recommendations/       # Technical recommendations
├── reference/             # Quick reference, cheat sheets, patterns
├── reports/               # Generated reports, analytics
├── research/              # Research notes, explorations, POCs
├── retrospectives/        # Detailed SD retrospectives
├── runbooks/              # Operational runbooks
├── sds/                   # Strategic Directive documentation
├── stages/                # Stage-specific documentation
├── strategic-directives/  # SD planning and tracking
├── strategic_directives/  # (legacy, use sds/ instead)
├── summaries/             # Status updates, completion reports
├── templates/             # Document templates, boilerplates
├── testing/               # Testing documentation
├── troubleshooting/       # Common problems and solutions
├── uat/                   # User acceptance testing docs
├── user-stories/          # User story documentation
├── validation/            # Validation reports and results
├── vision/                # Vision documents and strategic plans
├── wbs_artefacts/         # Work breakdown structure artifacts
└── workflow/              # Workflow documentation and processes
```

**Key Supporting Directories:**

| Directory | Purpose | When to Use |
|-----------|---------|-------------|
| `guides/` | Step-by-step tutorials | Creating how-to documentation |
| `reference/` | Quick reference materials | Pattern libraries, cheat sheets |
| `retrospectives/` | Post-implementation reviews | After SD completion |
| `summaries/` | Status and completion reports | Project updates, milestones |
| `templates/` | Reusable document templates | Starting new documentation |
| `troubleshooting/` | Problem-solution documentation | Common errors and fixes |

---

## Naming Conventions

### File Naming Pattern

General pattern for all documentation files:

```
{PREFIX}-{IDENTIFIER}-{DESCRIPTION}.md
```

**Examples:**
```
✅ CORRECT:
- api-authentication-guide.md
- guide-getting-started.md
- ref-database-patterns.md
- SD-DOCS-ARCH-001-implementation.md
- retro-SD-A11Y-001.md
- 2025-12-23-weekly-update.md

❌ INCORRECT:
- GettingStarted.md (PascalCase)
- getting_started.md (mixed convention)
- guide.md (not descriptive)
- authentication guide.md (spaces)
```

### Prefix Conventions

Use prefixes to indicate document type:

| Prefix | Meaning | Example | Location |
|--------|---------|---------|----------|
| `api-` | API documentation | `api-endpoints.md` | `02_api/` |
| `guide-` | How-to guide | `guide-setup.md` | `guides/` |
| `ref-` | Quick reference | `ref-shortcuts.md` | `reference/` |
| `retro-` | Retrospective | `retro-SD-XXX-001.md` | `retrospectives/` |
| `arch-` | Architecture doc | `arch-system-overview.md` | `01_architecture/` |
| `test-` | Testing doc | `test-strategy.md` | `05_testing/` |
| `SD-` | Strategic Directive | `SD-DOCS-ARCH-001.md` | `sds/` |
| `PRD-` | Product Requirements | `PRD-FEATURE-001.md` | `product-requirements/` |

### Case Conventions

| Convention | When to Use | Examples |
|------------|-------------|----------|
| **kebab-case** | Most documentation files | `getting-started.md`, `user-guide.md` |
| **SCREAMING_SNAKE_CASE** | Generated files, system files | `CLAUDE_CORE.md`, `README.md` |
| **SD-XXX-YYY-NNN** | Strategic Directives | `SD-DOCS-ARCH-001.md` |
| **PRD-XXX-NNN** | Product Requirements | `PRD-FEATURE-001.md` |
| **YYYY-MM-DD** | Date-based documents | `2025-12-23-status.md` |

### Identifier Conventions

For traceability, include identifiers:

```
✅ WITH IDENTIFIER:
- SD-DOCS-ARCH-001-implementation.md
- retro-SD-A11Y-001.md
- handoff-LEAD-PLAN-2025-001.md

✅ WITH DATE:
- 2025-12-23-weekly-summary.md
- 2025-12-retrospective.md
```

---

## Cross-Reference System

### Markdown Link Format

Always use relative paths for internal documentation links:

```markdown
✅ CORRECT:
- See [Architecture Overview](../01_architecture/system-overview.md)
- Details in [Testing Guide](../05_testing/testing_qa.md)
- Reference [Database Patterns](../reference/database-agent-patterns.md)
- Related: [Parent SD](../../sds/SD-PARENT-001.md)

❌ INCORRECT:
- See architecture.md (no path)
- See /docs/architecture.md (absolute path)
- See https://internal/docs (external link for internal doc)
- See [link](./folder) (link to directory, not file)
```

### Related Documentation Section

Every document MUST include a "Related Documentation" section at the end:

```markdown
## Related Documentation

### Prerequisites
- [Document Title](relative/path/to/doc.md) - Brief description

### Related Guides
- [Document Title](relative/path/to/doc.md) - Brief description

### Reference Materials
- [Document Title](relative/path/to/doc.md) - Brief description

### Next Steps
- [Document Title](relative/path/to/doc.md) - Brief description
```

**Example:**

```markdown
## Related Documentation

### Prerequisites
- [LEO Protocol Overview](../03_protocols_and_standards/LEO_v4.3.3.md) - Core protocol understanding

### Related Guides
- [Documentation Standards](./DOCUMENTATION_STANDARDS.md) - Writing guidelines
- [Directory Structure](./DIRECTORY_STRUCTURE.md) - Folder organization

### Reference Materials
- [Database Patterns](../reference/database-agent-patterns.md) - Database best practices

### Next Steps
- [Creating Documentation](../guides/guide-creating-docs.md) - How to write docs
```

### Cross-Reference Tracking

When creating new documentation:

1. **Search for related docs**: Use `grep -r "keyword" docs/` to find existing documentation
2. **Add bidirectional links**: Link from new doc to related docs AND update related docs to link back
3. **Update indexes**: Add entry to relevant README.md files
4. **Validate links**: Check all links are valid before committing

---

## Index and Navigation Patterns

### README Files

Every directory MUST have a README.md file that serves as an index:

**README.md Structure:**

```markdown
# {Directory Name}

## Purpose
[1-2 sentence description of what this directory contains]

## Contents

### {Category 1}
- [{Document Title}](./{file-name}.md) - Brief description
- [{Document Title}](./{file-name}.md) - Brief description

### {Category 2}
- [{Document Title}](./{file-name}.md) - Brief description

## Quick Links
- [Most Used Doc 1](./{file}.md)
- [Most Used Doc 2](./{file}.md)

## Related Directories
- [`../other-dir/`](../other-dir/) - Description

## Maintenance
**Last Updated**: YYYY-MM-DD
**Maintained By**: {Team/Sub-Agent}
```

**Example README.md:**

```markdown
# Reference Documentation

## Purpose
Quick reference materials, pattern libraries, and cheat sheets for rapid access during development.

## Contents

### Database
- [Database Agent Patterns](./database-agent-patterns.md) - Best practices for database operations
- [Schema Overview](./database-schema-overview.md) - Current database schema reference

### Testing
- [QA Director Guide](./qa-director-guide.md) - Quality assurance patterns
- [E2E Testing Configuration](./e2e-testing-mode-configuration.md) - End-to-end test setup

### Patterns
- [Validation Enforcement](./validation-enforcement.md) - Input validation patterns
- [Component Registry](./component-registry.md) - Component usage patterns

## Quick Links
- [Database Agent Patterns](./database-agent-patterns.md) - Most frequently used
- [QA Director Guide](./qa-director-guide.md) - Quality gate reference

## Related Directories
- [`../guides/`](../guides/) - Step-by-step tutorials
- [`../05_testing/`](../05_testing/) - Comprehensive testing documentation

## Maintenance
**Last Updated**: 2025-12-23
**Maintained By**: DOCMON (Documentation Sub-Agent)
```

### Navigation Hierarchy

**Three-Level Navigation System:**

```
Level 1: /docs/README.md (Master Index)
    ↓
Level 2: /docs/{category}/README.md (Category Index)
    ↓
Level 3: /docs/{category}/{file}.md (Individual Documents)
```

**Entry Points for Users:**

1. **Project Root**: `/README.md` → Overview and quick start
2. **Documentation Hub**: `/docs/README.md` → Master documentation index
3. **Category Index**: `/docs/{category}/README.md` → Specific topic area
4. **Search**: Use `grep`, GitHub search, or documentation search tools

### Table of Contents

Documents over 200 lines MUST include a Table of Contents:

```markdown
## Table of Contents

1. [Section 1](#section-1)
   - [Subsection 1.1](#subsection-11)
   - [Subsection 1.2](#subsection-12)
2. [Section 2](#section-2)
3. [Section 3](#section-3)

---

## Section 1
...
```

---

## Document Structure Standards

### Required Metadata Header

Every documentation file MUST start with this metadata header:

```markdown
# {Document Title}

## Metadata
- **Category**: [Architecture|API|Guide|Protocol|Report|Reference]
- **Status**: [Draft|Review|Approved|Deprecated]
- **Version**: [X.Y.Z using semantic versioning]
- **Author**: [Name or Sub-Agent]
- **Last Updated**: [YYYY-MM-DD]
- **Tags**: [tag1, tag2, tag3]
- **SD Reference**: [SD-XXX-YYY-NNN] (if applicable)

## Overview
[1-3 paragraph description of document purpose and scope]

## Table of Contents
[For docs > 200 lines]
```

### Document Status Lifecycle

| Status | Meaning | Action Required |
|--------|---------|-----------------|
| `Draft` | Work in progress | Do not use for implementation |
| `Review` | Ready for review | Review and provide feedback |
| `Approved` | Final and authoritative | Safe to use for implementation |
| `Deprecated` | Superseded by newer doc | Use replacement document instead |

### Version Control

Use semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR**: Breaking changes, complete rewrites
- **MINOR**: New sections, significant additions
- **PATCH**: Corrections, clarifications, minor updates

**Version History Section (at end of document):**

```markdown
## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.2.0 | 2025-12-23 | DOCMON | Added cross-reference system |
| 1.1.0 | 2025-12-20 | John Doe | Added API examples |
| 1.0.0 | 2025-12-15 | Jane Smith | Initial version |
```

### Required Document Sections

Minimum required sections for all documentation:

```markdown
# Title

## Metadata
[Required metadata header]

## Overview
[Purpose and scope]

## [Content Sections]
[Main content organized logically]

## Related Documentation
[Cross-references to related docs]

## Version History
[Change log]
```

---

## AI Agent Guidelines

### For Documentation Creation

When AI agents create new documentation:

1. **Check for existing docs**: Search for similar or related documentation first
2. **Choose correct location**: Use folder hierarchy rules above
3. **Follow naming conventions**: Use appropriate prefix and kebab-case
4. **Include all required sections**: Metadata, overview, related docs, version history
5. **Add cross-references**: Link to related documentation bidirectionally
6. **Update indexes**: Add entry to relevant README.md files
7. **Validate links**: Ensure all relative paths are correct

### For Documentation Organization

The DOCMON sub-agent performs these duties:

```javascript
// Documentation Sub-Agent Responsibilities
const docmonDuties = {
  // Weekly automated tasks
  audit: "Scan for misplaced documentation files",
  organize: "Move files to correct locations per info architecture",
  index: "Update README.md files with new entries",
  validate: "Check metadata completeness and link validity",
  report: "Generate documentation health metrics",

  // On-demand tasks
  crossReference: "Add bidirectional links between related docs",
  archive: "Move deprecated docs to archive/ with redirects",
  standardize: "Fix naming convention violations",
  cleanup: "Remove duplicate or obsolete documentation"
};
```

### Documentation Health Metrics

Track these KPIs for documentation quality:

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Organization Score | 95%+ | % of docs in correct location |
| Completeness Score | 100% | % with required metadata |
| Freshness Score | 80%+ | % updated in last 90 days |
| Link Health | 100% | % of working cross-references |
| Coverage | 100% | % of features with documentation |
| Index Accuracy | 100% | % of docs listed in README.md |

### Automated Audit Commands

```bash
# Find misplaced documentation
find . -name "*.md" -not -path "./docs/*" -not -path "./node_modules/*" -not -name "README.md" -not -name "CLAUDE*.md"

# Check for missing README.md indexes
for dir in docs/*/; do [ ! -f "$dir/README.md" ] && echo "Missing: $dir/README.md"; done

# Find outdated documents (>90 days)
find docs -name "*.md" -mtime +90

# Check for broken internal links
grep -r "\[.*\](\.\..*\.md)" docs/ | while read line; do
  file=$(echo "$line" | cut -d: -f1)
  link=$(echo "$line" | grep -o "\](\.\..*\.md)" | sed 's/](\(.*\))/\1/')
  dir=$(dirname "$file")
  target="$dir/$link"
  [ ! -f "$target" ] && echo "Broken link in $file: $link"
done

# Find files without metadata headers
grep -L "^## Metadata" docs/**/*.md
```

---

## Related Documentation

### Prerequisites
- [LEO Protocol v4.3.3](../03_protocols_and_standards/LEO_v4.3.3.md) - Core protocol context

### Related Standards
- [Documentation Standards](./DOCUMENTATION_STANDARDS.md) - Writing quality guidelines
- [Directory Structure](./DIRECTORY_STRUCTURE.md) - Current folder organization

### Implementation Guides
- [DOCMON Sub-Agent Guide](../agents/DOCMON-guide.md) - Documentation automation

### Reference Materials
- [Database Patterns](../reference/database-agent-patterns.md) - Database-first patterns

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-23 | DOCMON | Initial information architecture for SD-DOCS-ARCH-001 |

---

*This document is part of SD-DOCS-ARCH-001 under parent SD-DOCS-OVERHAUL-ORCHESTRATOR*
*Maintained by: DOCMON (Information Architecture Lead Sub-Agent)*
*Storage: Both file (/docs/docs-info-architecture.md) and database (leo_protocol_sections)*
