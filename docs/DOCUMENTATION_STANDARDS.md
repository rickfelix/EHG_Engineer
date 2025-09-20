# EHG Documentation Standards & Organization Guide

## 📚 Documentation Sub-Agent Standards

### Sub-Agent Profile
- **Name**: Documentation Sub-Agent
- **Code**: DOCS
- **Backstory**: Technical documentation expert from Stripe, ReadMe, GitBook, and Confluence
- **Mission**: Maintain pristine documentation organization and quality

## 📁 Documentation Structure Standards

### Primary Documentation Hierarchy

```
/mnt/c/_EHG/EHG_Engineer/
├── README.md                       # Project root readme only
├── CLAUDE.md                       # AI assistant instructions (special)
├── CLAUDE-LEO.md                   # LEO Protocol instructions (special)
├── docs/                           # ALL other documentation
│   ├── README.md                   # Documentation index
│   ├── DOCUMENTATION_STANDARDS.md  # This file
│   │
│   ├── 01_architecture/            # System architecture docs
│   │   ├── README.md
│   │   ├── system-overview.md
│   │   ├── component-diagrams.md
│   │   └── data-flow.md
│   │
│   ├── 02_api/                     # API documentation
│   │   ├── README.md
│   │   ├── rest-api.md
│   │   ├── websocket-api.md
│   │   └── graphql-schema.md
│   │
│   ├── 03_protocols_and_standards/ # Protocols like LEO
│   │   ├── README.md
│   │   ├── leo_protocol_*.md
│   │   └── coding_standards.md
│   │
│   ├── 04_guides/                  # How-to guides
│   │   ├── README.md
│   │   ├── getting-started.md
│   │   ├── deployment.md
│   │   └── troubleshooting.md
│   │
│   ├── 05_sub_agents/              # Sub-agent documentation
│   │   ├── README.md
│   │   ├── testing-debugging/
│   │   ├── security/
│   │   ├── performance/
│   │   └── documentation/
│   │
│   ├── 06_features/                # Feature documentation
│   │   ├── README.md
│   │   ├── directive-lab/
│   │   ├── dashboard/
│   │   └── realtime-voice/
│   │
│   ├── 07_testing/                 # Testing documentation
│   │   ├── README.md
│   │   ├── unit-testing.md
│   │   ├── e2e-testing.md
│   │   └── playwright-guide.md
│   │
│   ├── 08_deployment/              # Deployment docs
│   │   ├── README.md
│   │   ├── docker.md
│   │   ├── kubernetes.md
│   │   └── ci-cd.md
│   │
│   ├── 09_retrospectives/          # Project retrospectives
│   │   ├── README.md
│   │   └── [date]-[topic].md
│   │
│   └── 10_reports/                 # Generated reports
│       ├── README.md
│       ├── performance/
│       ├── security/
│       └── audits/
```

## 📋 Documentation Rules

### 1. File Naming Conventions

```
✅ CORRECT:
- getting-started.md (kebab-case)
- leo_protocol_v4.1.md (underscores for versions)
- API_REFERENCE.md (UPPERCASE for major references)
- 2025-09-04-retrospective.md (dated files)

❌ INCORRECT:
- GettingStarted.md (PascalCase)
- getting_started.md (mixed conventions)
- gettingstarted.md (no separation)
```

### 2. Document Headers

Every markdown file MUST start with:

```markdown
# Document Title

## Metadata
- **Category**: [Architecture|API|Guide|Protocol|Report]
- **Status**: [Draft|Review|Approved|Deprecated]
- **Version**: [1.0.0]
- **Author**: [Name or Sub-Agent]
- **Last Updated**: [YYYY-MM-DD]
- **Tags**: [tag1, tag2, tag3]

## Overview
[Brief description of document purpose]

## Table of Contents
[Auto-generated or manual TOC]
```

### 3. Location Rules

| Document Type | Location | Example |
|--------------|----------|---------|
| Project README | `/` | `/README.md` |
| AI Instructions | `/` | `/CLAUDE.md` |
| Architecture | `/docs/01_architecture/` | `system-overview.md` |
| API Docs | `/docs/02_api/` | `rest-api.md` |
| Protocols | `/docs/03_protocols_and_standards/` | `leo_protocol_v4.md` |
| How-to Guides | `/docs/04_guides/` | `deployment.md` |
| Sub-Agent Docs | `/docs/05_sub_agents/[agent]/` | `testing-debugging/README.md` |
| Feature Docs | `/docs/06_features/[feature]/` | `directive-lab/overview.md` |
| Test Docs | `/docs/07_testing/` | `playwright-guide.md` |
| Deploy Docs | `/docs/08_deployment/` | `docker.md` |
| Retrospectives | `/docs/09_retrospectives/` | `2025-09-04-testing.md` |
| Reports | `/docs/10_reports/[type]/` | `performance/2025-09-04.md` |

### 4. Cross-References

Use relative paths for internal links:

```markdown
✅ CORRECT:
- See [Architecture Overview](../01_architecture/system-overview.md)
- Details in [Testing Guide](../07_testing/unit-testing.md)

❌ INCORRECT:
- See architecture.md (no path)
- See /docs/architecture.md (absolute path)
- See https://... (external link for internal doc)
```

### 5. Version Control

- Use semantic versioning in metadata
- Keep version history at document bottom
- Archive old versions in `/docs/archive/[year]/`

### 6. Quality Standards

#### Required Elements
- [ ] Clear title and purpose
- [ ] Metadata header
- [ ] Table of contents (for docs > 200 lines)
- [ ] Code examples with language tags
- [ ] Cross-references to related docs
- [ ] Version history

#### Writing Style
- **Voice**: Technical but approachable
- **Tense**: Present tense for current state
- **Person**: Second person for guides ("you"), third for references
- **Length**: Aim for 500-2000 words per document
- **Examples**: At least one code example per major concept

## 🤖 Documentation Sub-Agent Responsibilities

### 1. Organization Duties

```javascript
class DocumentationSubAgent {
  responsibilities = {
    audit: "Scan for misplaced documentation",
    organize: "Move files to correct locations",
    index: "Maintain documentation indexes",
    validate: "Check document standards compliance",
    report: "Generate documentation health reports"
  };
}
```

### 2. Automatic Actions

The Documentation sub-agent should:

1. **Weekly Audit**: Scan entire codebase for misplaced docs
2. **Auto-Organize**: Move documents to correct directories
3. **Index Updates**: Keep all README indexes current
4. **Link Validation**: Check for broken cross-references
5. **Standards Check**: Validate headers and metadata
6. **Report Generation**: Create documentation health reports

### 3. Documentation Health Metrics

Track these KPIs:
- **Organization Score**: % of docs in correct location
- **Completeness Score**: % with required metadata
- **Freshness Score**: % updated in last 90 days
- **Link Health**: % of working cross-references
- **Coverage**: % of features documented

## 🔍 Audit Checklist

### For Documentation Sub-Agent

```bash
# Find misplaced documentation
find . -name "*.md" -not -path "./docs/*" -not -path "./node_modules/*"

# Check for missing indexes
for dir in docs/*/; do
  [ ! -f "$dir/README.md" ] && echo "Missing index: $dir"
done

# Find outdated documents (>90 days)
find docs -name "*.md" -mtime +90

# Check for broken links
grep -r "\[.*\](" docs/ | grep -v http | validate_links

# Generate report
generate_doc_health_report > docs/10_reports/documentation/$(date +%Y-%m-%d).md
```

## 📊 Migration Plan

### Phase 1: Immediate Actions
1. Create directory structure
2. Move critical documentation
3. Update CLAUDE.md with doc locations

### Phase 2: Organization (Week 1)
1. Audit all existing documentation
2. Move to correct locations
3. Create missing indexes

### Phase 3: Standardization (Week 2)
1. Add metadata headers
2. Fix cross-references
3. Validate all documents

### Phase 4: Automation (Week 3)
1. Implement Documentation sub-agent
2. Set up automated audits
3. Create health dashboards

## 🚨 Prohibited Locations

NEVER place documentation in:
- `/src/` - Code only
- `/lib/` - Libraries only
- `/scripts/` - Executable scripts only
- `/tests/` - Test files only
- `/public/` - Public assets only
- Root directory (except README, CLAUDE files)

## 📝 Templates

### New Feature Documentation

```markdown
# Feature: [Name]

## Metadata
- **Category**: Feature
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: [Your Name]
- **Last Updated**: [Date]
- **Tags**: [feature, component, ui]

## Overview
[What this feature does]

## User Stories
[Who needs this and why]

## Technical Implementation
[How it works]

## API Reference
[Endpoints and methods]

## Configuration
[Settings and options]

## Examples
[Code examples]

## Troubleshooting
[Common issues]

## Related Documentation
- [Link 1]
- [Link 2]
```

## 🎯 Success Criteria

Documentation is considered "healthy" when:
- ✅ 95% of docs in correct locations
- ✅ 100% have required metadata
- ✅ 80% updated within 90 days
- ✅ 0 broken cross-references
- ✅ All features have documentation
- ✅ Weekly audit reports show improvement

## 🔄 Continuous Improvement

The Documentation sub-agent should:
1. Learn common misplacement patterns
2. Suggest structure improvements
3. Auto-generate documentation stubs
4. Track documentation debt
5. Prioritize documentation needs

---

*Documentation Standards Version: 1.0.0*
*Last Updated: 2025-09-04*
*Maintained by: Documentation Sub-Agent*