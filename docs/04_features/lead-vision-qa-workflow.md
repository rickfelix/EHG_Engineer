---
category: feature
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [feature, auto-generated]
---
# LEAD Agent Workflow with Vision QA Integration

## Metadata
- **Category**: Feature
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: testing, feature, guide, protocol

## LEO Protocol v3.1.5.9

### Step 1: Strategic Directive Analysis

When receiving or creating a Strategic Directive, assess Vision QA requirements:

```bash
# Use the decision helper
node scripts/vision-qa-decision.js --analyze "[SD Description]"
```

### Step 2: Vision QA Classification

Based on the Strategic Directive content, classify Vision QA requirement:

| **SD Contains**              | **Vision QA Status** | **Budget Allocation** |
|------------------------------|---------------------|----------------------|
| Payment/Auth UI              | MANDATORY           | $5-10                |
| Customer-facing UI           | REQUIRED            | $2-5                 |
| Accessibility requirements   | MANDATORY           | $3-5                 |
| Internal tools only          | OPTIONAL            | $1-2                 |
| No UI components             | NOT_APPLICABLE      | $0                   |

### Step 3: Communication to PLAN

Include Vision QA requirements in handoff:

```markdown
**To:** PLAN Agent
**From:** LEAD Agent
**Protocol:** LEO Protocol v3.1.5.9 (Vision QA Integration)
**Strategic Directive:** [SD-ID]: [Title]
**Strategic Directive Path:** `docs/strategic_directives/[SD-ID].md`
**Related PRD:** [PRD-ID]
**Related PRD Path:** `docs/product-requirements/[PRD-ID].md`
**Vision QA Status:** [MANDATORY/REQUIRED/RECOMMENDED/OPTIONAL/NOT_APPLICABLE]
**Vision QA Budget:** $[X.XX]

**Vision QA Requirements:** [If applicable]
- Test Type: [Comprehensive/Standard/Basic]
- Priority Areas: [List key UI components]
- Accessibility: [WCAG compliance level if required]
- Viewports: [Desktop/Tablet/Mobile as needed]

**Reference Files Required:**
- `docs/strategic_directives/[SD-ID].md` (Strategic Directive)
- `docs/product-requirements/[PRD-ID].md` (PRD)
- `docs/03_protocols_and_standards/leo-protocol-v3.1.5.md` (Protocol)
- `docs/03_protocols_and_standards/leo_vision_qa_integration.md` (Vision QA Guidelines)
```

### Step 4: Strategic Planning Considerations

When Vision QA is MANDATORY or REQUIRED:
1. Allocate additional time for Vision QA execution
2. Include Vision QA results in success criteria
3. Plan for potential bug remediation cycles
4. Consider consensus testing for critical paths

### Step 5: Quality Gate Integration

Vision QA results affect Strategic Directive completion:
- **Pass Rate < 80%**: SD cannot be marked complete
- **Critical/High bugs present**: Requires remediation
- **Accessibility non-compliance**: Blocks completion

### Decision Tree for LEAD Agent

```
Strategic Directive Assessment
├── Has UI Components?
│   ├── Yes → Check Customer Impact
│   │   ├── Customer-facing → Vision QA REQUIRED
│   │   ├── Payment/Auth → Vision QA MANDATORY
│   │   └── Internal only → Vision QA OPTIONAL
│   └── No → Vision QA NOT_APPLICABLE
└── Has Accessibility Requirements?
    └── Yes → Vision QA MANDATORY
```

### Monitoring and Oversight

LEAD should track Vision QA metrics across Strategic Directives:
- Average pass rates by SD type
- Common bug patterns
- Cost efficiency trends
- Model performance comparison

### Example Scenarios

**Scenario 1: E-commerce Checkout SD**
- Classification: MANDATORY (payment UI)
- Budget: $10
- Consensus testing required
- Accessibility compliance required

**Scenario 2: Internal Dashboard SD**
- Classification: OPTIONAL
- Budget: $1-2
- Single run sufficient
- Basic smoke testing only

**Scenario 3: Customer Portal SD**
- Classification: REQUIRED
- Budget: $5
- Mobile testing required
- Full bug detection needed