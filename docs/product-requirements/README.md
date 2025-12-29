# Product Requirements Documents (PRDs)

> **DATABASE-FIRST (LEO Protocol v4.3.3)**: PRDs are stored in the `product_requirements_v2` table.
> This directory contains legacy documentation only. Query the database for current PRD data.

## Database Source of Truth

```sql
-- Get PRD for a specific SD
SELECT * FROM product_requirements_v2 WHERE sd_id = 'SD-XXX-001';

-- List all PRDs
SELECT id, title, status, sd_id FROM product_requirements_v2;
```

---

*The content below describes legacy file-based PRDs. All new PRDs must be created in the database.*

## Purpose

PRDs define:
- **Feature specifications**: What will be built
- **User stories**: Who needs it and why
- **Acceptance criteria**: Definition of done
- **Technical requirements**: How it will work
- **Success metrics**: How to measure success

## File Naming Convention

```
PRD-SD-{ID}.md
PRD-{FEATURE}-{VERSION}.md
```

**Examples**:
- `PRD-SD-DATA-INTEGRITY-001.md` - PRD for SD-DATA-INTEGRITY-001
- `PRD-VENTURE-MVP-v2.md` - Version 2 of venture MVP PRD

## PRD Structure

### Standard Sections

```markdown
# PRD: {Feature Name}

**SD ID**: SD-{ID}
**PRD ID**: PRD-SD-{ID}
**Created**: YYYY-MM-DD
**Status**: [Draft/Approved/In Development/Complete]

## 1. Overview
[Brief description of feature]

## 2. Problem Statement
[What problem does this solve?]

## 3. Goals & Success Metrics
- Goal 1 → Metric
- Goal 2 → Metric

## 4. User Stories
- As a [role], I want [feature] so that [benefit]

## 5. Requirements

### Functional Requirements
- FR-001: [Requirement]
- FR-002: [Requirement]

### Non-Functional Requirements
- NFR-001: Performance [criteria]
- NFR-002: Security [criteria]

## 6. Technical Approach
[High-level technical design]

## 7. UI/UX Requirements
[User interface specifications]

## 8. API Specifications
[Endpoint definitions if applicable]

## 9. Database Schema
[Table structures if applicable]

## 10. Test Strategy
- Unit tests: [coverage target]
- E2E tests: [scenarios]
- UAT: [acceptance criteria]

## 11. Acceptance Criteria
- [ ] AC-001: [Criterion]
- [ ] AC-002: [Criterion]

## 12. Dependencies
- [External dependencies]
- [Related SDs/PRDs]

## 13. Timeline & Milestones
- Phase 1: [dates]
- Phase 2: [dates]

## 14. Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
```

## PRD Lifecycle

1. **Draft**: Initial PRD creation by PLAN agent
2. **Review**: Validation gates and approval
3. **Approved**: Ready for EXEC implementation
4. **In Development**: EXEC implementing from PRD
5. **Complete**: Implementation finished and validated

## Validation Gates

Before PRD approval:
- [ ] All user stories mapped to requirements
- [ ] Technical approach validated
- [ ] Test strategy defined
- [ ] Database schema reviewed (if applicable)
- [ ] API specs complete (if applicable)
- [ ] Acceptance criteria clear and testable
- [ ] Dependencies identified

## PRD Database Storage

PRDs are also stored in the database (`product_requirements` table):
```sql
SELECT * FROM product_requirements
WHERE sd_id = 'SD-XXX-001';
```

## Creating PRDs

### Via Script (Recommended)
```bash
node scripts/create-prd-from-sd.js SD-XXX-001
```

### Manual Creation
1. Copy template from `/docs/templates/`
2. Fill in all sections
3. Submit for validation
4. Insert into database

## PRD Templates

Available templates:
- `prd-template-standard.md` - General features
- `prd-template-ui.md` - UI-focused features
- `prd-template-api.md` - API development
- `prd-template-database.md` - Database changes

## Relationship to SDs

Every PRD corresponds to a Strategic Directive:

| Document | Created By | Purpose |
|----------|------------|---------|
| Strategic Directive (SD) | LEAD | What to build and why (strategy) |
| Product Requirements (PRD) | PLAN | How to build it (tactics) |

## Related Documentation

- `/docs/strategic-directives/` - Related SDs
- `/docs/templates/` - PRD templates
- `/docs/handoffs/` - PLAN→EXEC handoffs
- `/docs/retrospectives/` - Post-implementation reviews

## Quality Checklist

Before marking PRD as approved:
- [ ] Linked to approved SD
- [ ] All required sections complete
- [ ] User stories are INVEST compliant
- [ ] Acceptance criteria are SMART
- [ ] Technical approach peer reviewed
- [ ] Test strategy covers all scenarios
- [ ] Database schema validated (if applicable)
- [ ] API specs reviewed (if applicable)
- [ ] Stored in database
- [ ] PLAN→EXEC handoff created

---

*Part of LEO Protocol v4.3.3 - PLAN Phase Documentation*
*Updated: 2025-12-29 - Added database-first notice*
