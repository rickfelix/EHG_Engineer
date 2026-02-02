/**
 * Template Generator for PRD Validator
 * Generates PRD template files
 */

import fs from 'fs';

/**
 * Generate a PRD template
 * @param {string} outputPath - Path to save template
 * @returns {string} Generated template content
 */
function generateTemplate(outputPath) {
  const template = `# Product Requirements Document: PRD-XXX

## Document Information

- **PRD ID**: PRD-XXX
- **Related SD**: SD-XXX
- **Version**: 1.0.0
- **Status**: Draft
- **Created**: ${new Date().toISOString().split('T')[0]}
- **Author**: [Your Name/Role]
- **Last Updated**: ${new Date().toISOString().split('T')[0]}

## Executive Summary

[Provide a concise overview of the product/feature, its purpose, and expected impact]

## Problem Statement

[Clearly describe the problem this product/feature addresses]
- What is the current situation?
- What are the pain points?
- Who is affected?
- What is the impact of not solving this?

## Objectives

[List the key objectives this PRD aims to achieve]
- Primary Objective: [Main goal]
- Secondary Objectives:
  - [Additional goal 1]
  - [Additional goal 2]

## Scope

### In Scope
- [Feature/functionality included]
- [Feature/functionality included]

### Out of Scope
- [Feature/functionality excluded]
- [Feature/functionality excluded]

## User Personas

### Primary Users
- **Persona Name**: [Description]
  - Goals: [What they want to achieve]
  - Pain Points: [Current frustrations]
  - Technical Proficiency: [Low/Medium/High]

### Secondary Users
- **Persona Name**: [Description]

## User Stories

### Epic: [Epic Name]

#### US-001: [User Story Title]
**As a** [user type]
**I want** [feature/capability]
**So that** [benefit/value]

**Acceptance Criteria:**
- [ ] Given [context], When [action], Then [outcome]
- [ ] Given [context], When [action], Then [outcome]

**Priority**: P0/P1/P2
**Estimated Effort**: S/M/L/XL

## Functional Requirements

### FR-001: [Requirement Name]
**Description**: [Detailed description]
**Priority**: Must Have / Should Have / Could Have / Won't Have
**Dependencies**: [List any dependencies]

### FR-002: [Requirement Name]
**Description**: [Detailed description]

## Non-Functional Requirements

### NFR-001: Performance
- Page load time < 2 seconds
- API response time < 200ms for 95% of requests
- Support 1000 concurrent users

### NFR-002: Security
- All data encrypted in transit (TLS 1.3)
- Authentication via OAuth 2.0
- Role-based access control (RBAC)

### NFR-003: Accessibility
- WCAG 2.1 AA compliance
- Keyboard navigation support
- Screen reader compatibility

## Technical Requirements

### Architecture
[Describe technical architecture, components, services]

### Technology Stack
- Frontend: [Technologies]
- Backend: [Technologies]
- Database: [Technologies]
- Infrastructure: [Technologies]

### API Specifications
[List key APIs, endpoints, data formats]

### Data Model
[Describe key entities, relationships, schemas]

## Vision QA Requirements

**Status**: REQUIRED/RECOMMENDED/OPTIONAL

**Test Goals**:
- [ ] All UI components render correctly across browsers
- [ ] Forms validate and submit properly
- [ ] Responsive design works on all viewports
- [ ] Accessibility standards met

**Configuration**:
\`\`\`json
{
  "appId": "APP-XXX",
  "maxIterations": 30,
  "costLimit": 2.00,
  "viewports": ["desktop", "tablet", "mobile"],
  "checkAccessibility": true,
  "consensusRuns": 1
}
\`\`\`

## Testing Strategy

### Unit Testing
- Coverage target: 80%
- Key components to test: [List]

### Integration Testing
- API contract testing
- Database integration tests

### E2E Testing
- Critical user flows
- Vision QA automated testing

### Performance Testing
- Load testing scenarios
- Stress testing thresholds

## Success Criteria

### Quantitative Metrics
- [ ] [Metric with specific target]
- [ ] [Metric with specific target]

### Qualitative Metrics
- [ ] User satisfaction score > X
- [ ] Usability testing success rate > Y%

## Acceptance Criteria

### Definition of Done
- [ ] All functional requirements implemented
- [ ] All tests passing (unit, integration, E2E)
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Vision QA validation passed
- [ ] Performance benchmarks met
- [ ] Security review completed
- [ ] Accessibility audit passed

## Dependencies

### Internal Dependencies
- [Team/System]: [What is needed]

### External Dependencies
- [Service/API]: [What is needed]

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| [Risk description] | Low/Med/High | Low/Med/High | [Mitigation strategy] |

## Timeline and Milestones

| Milestone | Target Date | Deliverables |
|-----------|------------|--------------|
| Design Complete | YYYY-MM-DD | Mockups, Design System Updates |
| Alpha Release | YYYY-MM-DD | Core Features |
| Beta Release | YYYY-MM-DD | All Features, Testing |
| GA Release | YYYY-MM-DD | Production Ready |

## Rollout Plan

### Phase 1: Internal Testing
- Target: Internal team
- Duration: X weeks
- Success Criteria: [Metrics]

### Phase 2: Beta Users
- Target: X% of users
- Duration: X weeks
- Success Criteria: [Metrics]

### Phase 3: General Availability
- Target: All users
- Success Criteria: [Metrics]

## Integration & Operationalization

> **Completeness Hints**: All 5 subsections below are **REQUIRED for feature/bugfix SDs**.
> For infrastructure SDs, incomplete sections generate warnings. Documentation SDs may skip this section.
> Reference: CLAUDE_PLAN.md "Integration & Operationalization Rubric"

### 1. Consumers & User Journeys
**Who/what will consume this functionality?**
- List the primary consumers (users, systems, other features)
- Describe user journeys that depend on this feature
- Example: "Dashboard component fetches venture list via useVentures hook"

| Consumer | Type | Journey/Use Case |
|----------|------|------------------|
| [Consumer name] | User/System/Feature | [How they use it] |
| [Consumer name] | User/System/Feature | [How they use it] |

### 2. Upstream/Downstream Dependencies
**What systems does this depend on? What depends on this?**
- List external systems, APIs, or services
- Specify direction (upstream = we call them, downstream = they call us)
- Document failure modes and fallbacks
- Example: "Upstream: Supabase Auth (fails → show login redirect)"

| Dependency | Direction | Failure Mode | Fallback |
|------------|-----------|--------------|----------|
| [System name] | Upstream/Downstream | [What happens if it fails] | [How we handle it] |

### 3. Data Contracts & Schema
**What data structures are created or modified?**
- List new tables, columns, or schema changes
- Document API contracts (request/response shapes)
- Reference existing schema if extending
- Example: "New column: ventures.risk_score (integer, nullable)"

| Contract | Type | Schema Reference |
|----------|------|------------------|
| [Table/API name] | Database/API/Event | [Link to schema or inline definition] |

### 4. Runtime Configuration & Environments
**What configuration is needed at runtime?**
- List environment variables, feature flags, or config values
- Specify defaults and per-environment overrides
- Document deployment sequence dependencies
- Example: "FEATURE_NEW_DASHBOARD=true (default: false in prod)"

| Config Key | Environment | Default | Description |
|------------|-------------|---------|-------------|
| [ENV_VAR_NAME] | dev/staging/prod | [default value] | [What it controls] |

### 5. Observability, Rollout & Rollback
**How will we monitor and safely deploy this?**
- Define key metrics and alerts
- Describe rollout strategy (canary, blue-green, feature flag)
- Document rollback procedure
- Example: "Alert if error rate > 1% within 5 minutes of deploy"

**Metrics to Monitor:**
- [Metric name]: [Expected range/threshold]

**Rollout Strategy:**
- [Phase 1]: [Target audience and success criteria]
- [Phase 2]: [Expansion criteria]

**Rollback Plan:**
- Trigger: [What condition triggers rollback]
- Steps: [How to rollback]
- Verification: [How to confirm rollback succeeded]

## Appendices

### A. Mockups/Wireframes
[Links or embedded images]

### B. Research Data
[User research, market analysis, competitive analysis]

### C. Technical Specifications
[Detailed technical documentation links]

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | YYYY-MM-DD | [Name] | Initial draft |
`;

  fs.writeFileSync(outputPath, template);
  console.log(`PRD template generated: ${outputPath}`);
  return template;
}

export { generateTemplate };
