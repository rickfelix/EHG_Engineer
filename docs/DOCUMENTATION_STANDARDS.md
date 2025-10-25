# EHG Documentation Standards & Organization Guide

## 📚 Documentation Sub-Agent Standards

### Sub-Agent Profile
- **Name**: Documentation Sub-Agent
- **Code**: DOCS
- **Backstory**: Technical documentation expert from Stripe, ReadMe, GitBook, and Confluence
- **Mission**: Maintain pristine documentation organization and quality

## 📁 Documentation Structure Standards

### Primary Documentation Hierarchy

**Note**: Updated 2025-10-24 to reflect actual directory structure

```
/mnt/c/_EHG/EHG_Engineer/
├── README.md                       # Project root readme only
├── CLAUDE.md                       # LEO Protocol context router (special)
├── CLAUDE_CORE.md                  # Core protocol implementation
├── CLAUDE_LEAD.md                  # LEAD phase operations
├── CLAUDE_PLAN.md                  # PLAN phase operations
├── CLAUDE_EXEC.md                  # EXEC phase operations
├── docs/                           # ALL other documentation
│   ├── README.md                   # Documentation index
│   ├── DOCUMENTATION_STANDARDS.md  # This file
│   │
│   ├── 01_architecture/            # System architecture docs
│   │   ├── README.md
│   │   ├── system-overview.md
│   │   └── component-diagrams.md
│   │
│   ├── 02_api/                     # API documentation
│   │   ├── README.md
│   │   └── [stage]_[feature].md
│   │
│   ├── 03_protocols_and_standards/ # Protocols like LEO
│   │   ├── README.md
│   │   ├── LEO_v4.2_*.md          # Current protocol (v4.2.x)
│   │   └── leo_git_commit_guidelines_v4.2.0.md
│   │
│   ├── 04_features/                # Feature documentation
│   │   ├── README.md
│   │   ├── [stage]_[feature].md   # Stage-based features
│   │   ├── ai_leadership_agents.md
│   │   ├── mvp_engine.md
│   │   └── [feature-name].md
│   │
│   ├── 05_testing/                 # Testing documentation
│   │   ├── README.md
│   │   ├── testing_qa.md
│   │   └── vision-qa-workflow.md
│   │
│   ├── 06_deployment/              # Deployment docs
│   │   ├── README.md
│   │   └── deployment_ops.md
│   │
│   ├── archive/                    # Archived documentation
│   │   ├── README.md
│   │   ├── protocols/             # Old protocol versions
│   │   │   ├── README.md
│   │   │   └── leo_protocol_v3.*.md, v4.0.md, v4.1.*.md
│   │   └── temp/                  # Temporary holding area
│   │
│   ├── database/                   # Database documentation
│   │   ├── README.md
│   │   ├── schema/
│   │   └── migrations/
│   │
│   ├── guides/                     # How-to guides (unnumbered)
│   │   ├── README.md
│   │   └── [guide-name].md
│   │
│   ├── reference/                  # Quick reference docs (unnumbered)
│   │   ├── database-agent-patterns.md
│   │   ├── validation-enforcement.md
│   │   ├── qa-director-guide.md
│   │   └── [reference-name].md
│   │
│   ├── retrospectives/             # Project retrospectives
│   │   ├── README.md
│   │   └── [SD-ID]-retro.md
│   │
│   └── summaries/                  # Generated summaries
│       ├── README.md
│       ├── implementations/
│       └── sd-sessions/
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

**Updated 2025-10-24 to match actual structure**

| Document Type | Location | Example |
|--------------|----------|---------|
| Project README | `/` | `/README.md` |
| AI Instructions | `/` | `/CLAUDE.md`, `/CLAUDE_CORE.md` |
| Architecture | `/docs/01_architecture/` | `system-overview.md` |
| API Docs | `/docs/02_api/` | `01a_draft_idea.md` |
| Protocols | `/docs/03_protocols_and_standards/` | `LEO_v4.2_HYBRID_SUB_AGENTS.md` |
| Feature Docs | `/docs/04_features/` | `mvp_engine.md`, `01b_idea_generation.md` |
| Test Docs | `/docs/05_testing/` | `testing_qa.md` |
| Deploy Docs | `/docs/06_deployment/` | `deployment_ops.md` |
| How-to Guides | `/docs/guides/` | `[guide-name].md` |
| Quick Reference | `/docs/reference/` | `database-agent-patterns.md` |
| Database Docs | `/docs/database/` | `schema/`, `migrations/` |
| Retrospectives | `/docs/retrospectives/` | `SD-XXX-retro.md` |
| Summaries | `/docs/summaries/` | `implementations/`, `sd-sessions/` |
| Archives | `/docs/archive/` | `protocols/leo_protocol_v3.1.5.md` |

### 4. Cross-References

Use relative paths for internal links:

```markdown
✅ CORRECT:
- See [Architecture Overview](../01_architecture/system-overview.md)
- Details in [Testing Guide](../05_testing/testing_qa.md)
- Reference [Database Patterns](../reference/database-agent-patterns.md)

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

*Documentation Standards Version: 1.1.0*
*Last Updated: 2025-10-24*
*Maintained by: Documentation Sub-Agent (DOCMON)*

**Changelog**:
- **v1.1.0** (2025-10-24): Updated directory structure to match actual implementation
  - Changed numbering: 04_features, 05_testing, 06_deployment (was 04_guides, 05_sub_agents, 06_features, 07_testing, 08_deployment)
  - Added: archive/, database/, guides/, reference/ directories
  - Updated CLAUDE.md references (context router instead of LEO Protocol)
  - Updated location rules table with actual examples
- **v1.0.0** (2025-09-04): Initial standards documentation