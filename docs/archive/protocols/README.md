# Archived Protocol Versions

This directory contains archived LEO Protocol versions that are no longer active but preserved for historical reference.

## Metadata
- **Category**: archive
- **Status**: archived
- **Last Updated**: 2025-10-24
- **Archived By**: Documentation audit cleanup

---

## Why These Protocols Are Archived

These protocol versions have been superseded by **LEO Protocol v4.3.3**. They are preserved for:
- Historical reference
- Understanding protocol evolution
- Migration path documentation
- Troubleshooting legacy implementations

**Current Active Protocol**: LEO Protocol v4.3.3 (see `/CLAUDE.md` for auto-generated context router)

---

## Archived Versions

### v3.x Series (Legacy)

| File | Version | Size | Date | Notes |
|------|---------|------|------|-------|
| `leo-protocol-v3.1.5.md` | v3.1.5 | 83KB | 2024 | Large file, early protocol |
| `leo-protocol-v3.1.6-improvements.md` | v3.1.6 | - | 2024 | Improvements over v3.1.5 |
| `leo-protocol-v3.3.0-boundary-context-skills.md` | v3.3.0 | - | 2024 | Introduced boundary context and skills |

**Migration Path**: v3.x → v4.0 → v4.1 → v4.2

### v4.0 Series (Superseded)

| File | Version | Size | Date | Notes |
|------|---------|------|------|-------|
| `leo-protocol-v4.0.md` | v4.0 | - | 2024 | First v4.x release |

**Migration Path**: v4.0 → v4.1 → v4.2

### v4.1 Series (Superseded)

| File | Version | Size | Date | Notes |
|------|---------|------|------|-------|
| `leo-protocol-v4.1.md` | v4.1 | 25KB | 2024-2025 | Major v4.1 release |
| `leo-protocol-v4.1.1-update.md` | v4.1.1 | - | 2025 | Minor updates to v4.1 |
| `leo-protocol-v4.1.2-database-first.md` | v4.1.2 | - | 2025 | Database-first patterns |

**Migration Path**: v4.1.x → v4.2

---

## Key Changes from Archived Versions to v4.2

### v3.x → v4.2 Major Changes
- Complete protocol restructure
- Sub-agent architecture introduced
- Database-first patterns
- Hybrid execution model
- Playwright testing integration

### v4.0 → v4.2 Major Changes
- Enhanced sub-agent orchestration
- LEO Protocol context router (CLAUDE.md)
- Database agent first-responder patterns
- Improved testing requirements
- Git commit guidelines standardization

### v4.1 → v4.2 Major Changes
- Hybrid sub-agent architecture
- Playwright MCP integration
- Enhanced context management
- Improved documentation structure
- Database agent anti-pattern documentation

---

## Accessing Archived Content

### Reading Archived Protocols

**From command line**:
```bash
# View archived protocol
cat /mnt/c/_EHG/EHG_Engineer/docs/archive/protocols/leo-protocol-v3.1.5.md

# Search within archived protocols
grep -r "keyword" /mnt/c/_EHG/EHG_Engineer/docs/archive/protocols/
```

**From code editor**:
Navigate to `/docs/archive/protocols/` directory

### When to Reference Archived Protocols

**DO Reference** when:
- Understanding historical context of decisions
- Migrating legacy code written against old protocols
- Documenting protocol evolution
- Researching specific feature origins

**DON'T Reference** when:
- Implementing new features (use v4.2.x)
- Writing new documentation (use v4.2.x)
- Training new team members (use v4.2.x)

---

## Current Active Protocols

**Location**: `/docs/03_protocols_and_standards/`

**Key Files**:
- `leo-v4.2-hybrid-sub-agents.md` - Hybrid sub-agent architecture
- `leo-v4.2-playwright-testing-integration.md` - Playwright integration
- `leo-git-commit-guidelines-v4.2.0.md` - Git commit standards

**Context Router**: `/CLAUDE.md` - Smart context loading system

**Core Protocol**: `/CLAUDE_CORE.md`, `/CLAUDE_LEAD.md`, `/CLAUDE_PLAN.md`, `/CLAUDE_EXEC.md`

---

## Deprecation Timeline

| Version | Release Date | Deprecated Date | Archived Date | Status |
|---------|-------------|-----------------|---------------|--------|
| v3.1.5 | Q2 2024 | Q4 2024 | 2025-10-24 | Archived |
| v3.1.6 | Q2 2024 | Q4 2024 | 2025-10-24 | Archived |
| v3.3.0 | Q3 2024 | Q4 2024 | 2025-10-24 | Archived |
| v4.0 | Q3 2024 | Q1 2025 | 2025-10-24 | Archived |
| v4.1 | Q4 2024 | Q4 2025 | 2025-10-24 | Archived |
| v4.1.1 | Q1 2025 | Q4 2025 | 2025-10-24 | Archived |
| v4.1.2 | Q1 2025 | Q4 2025 | 2025-10-24 | Archived |
| v4.2.x | Q2 2025 | Q4 2025 | 2025-12-29 | Archived |
| **v4.3.3** | **Q4 2025** | **Active** | **-** | **Current** |

---

## Archive Maintenance

### Retention Policy
- Archived protocols retained indefinitely
- No modifications to archived files
- Documentation-only archive (no code)

### File Organization
```
docs/archive/
└── protocols/
    ├── README.md (this file)
    ├── leo-protocol-v3.1.5.md
    ├── leo-protocol-v3.1.6-improvements.md
    ├── leo-protocol-v3.3.0-boundary-context-skills.md
    ├── leo-protocol-v4.0.md
    ├── leo-protocol-v4.1.md
    ├── leo-protocol-v4.1.1-update.md
    └── leo-protocol-v4.1.2-database-first.md
```

---

## Questions?

**For current protocol questions**: See `/docs/03_protocols_and_standards/README.md`

**For historical context**: Reference the archived files in this directory

**For migration guidance**: Contact the development team or review `/CLAUDE.md`

---

## Navigation

- **Parent**: [Archive Home](../README.md)
- **Active Protocols**: [03 Protocols & Standards](../../03_protocols_and_standards/README.md)
- **Documentation Home**: [Docs Home](../../01_architecture/README.md)

---

**Last Archive Update**: 2025-10-24
**Files Archived**: 7 protocol versions (v3.1.5 through v4.1.2)
**Reason**: Documentation audit cleanup - superseded by v4.3.3
**Current Protocol**: v4.3.3 (auto-generated from database)

## Files

- [Leo Protocol V3.1.5](leo-protocol-v3.1.5.md)
- [Leo Protocol V3.1.6 Improvements](leo-protocol-v3.1.6-improvements.md)
- [Leo Protocol V3.3.0 Boundary Context Skills](leo-protocol-v3.3.0-boundary-context-skills.md)
- [Leo Protocol V4.0](leo-protocol-v4.0.md)
- [Leo Protocol V4.1.1 Update](leo-protocol-v4.1.1-update.md)
- [Leo Protocol V4.1.2 Database First](leo-protocol-v4.1.2-database-first.md)
- [Leo Protocol V4.1](leo-protocol-v4.1.md)
