# Testing and QA Documentation

This directory contains testing strategies, QA workflows, test scenarios, and quality assurance documentation for the EHG Engineer project.

## Metadata
- **Category**: Testing
- **Status**: Approved
- **Last Updated**: 2025-10-24

---

## Directory Contents

### Development Workflows

| File | Description |
|------|-------------|
| `22_iterative_dev_loop.md` | Iterative development loop and testing cycles |
| `25_quality_assurance.md` | Quality assurance standards and processes |
| `testing_qa.md` | General testing and QA guidelines |

### Vision QA Workflows

| File | Description |
|------|-------------|
| `exec-vision-qa-workflow.md` | EXEC phase vision QA workflow integration |

**Related Vision QA Files** (in `04_features/`):
- `lead-vision-qa-workflow.md` - LEAD phase vision QA
- `plan-vision-qa-workflow.md` - PLAN phase vision QA

### Test Scenarios

| File | Description |
|------|-------------|
| `VOICE_FUNCTION_TEST_SCENARIOS.md` | Voice function test scenarios and validation |
| `TESTING_REPORT_STAGES_1_20.md` | Testing report for stages 1-20 |

### UI/UX Testing

| File | Description |
|------|-------------|
| `DIRECTIVE_LAB_UI_IMPROVEMENTS.md` | Directive Lab UI testing and improvements |

---

## Testing Strategy Overview

### Development Phases

The testing documentation is organized by LEO Protocol phases:

1. **LEAD Phase**
   - Vision QA workflow (`04_features/lead-vision-qa-workflow.md`)
   - Strategic validation

2. **PLAN Phase**
   - Vision QA workflow (`04_features/plan-vision-qa-workflow.md`)
   - PRD validation
   - Test strategy planning

3. **EXEC Phase**
   - Vision QA workflow (`exec-vision-qa-workflow.md`)
   - Implementation testing
   - Dual test requirement (unit + E2E)

### Testing Types

**Iterative Development** (`22_iterative_dev_loop.md`)
- Development cycle testing
- Continuous integration testing
- Fast feedback loops

**Quality Assurance** (`25_quality_assurance.md`)
- QA standards
- Quality gates
- Acceptance criteria validation

**Specialized Testing**:
- Voice functions (`VOICE_FUNCTION_TEST_SCENARIOS.md`)
- UI/UX validation (`DIRECTIVE_LAB_UI_IMPROVEMENTS.md`)
- Stage-based testing (`TESTING_REPORT_STAGES_1_20.md`)

---

## Testing Best Practices

### Dual Test Requirement (LEO Protocol v4.2.x)

All features MUST have:
1. **Unit Tests** - Component-level testing
2. **E2E Tests** - End-to-end Playwright tests

See `CLAUDE_EXEC.md` for dual test requirements.

### Playwright Integration

**E2E Testing Framework**:
- Playwright MCP integration
- Visual regression testing
- User journey validation

See `/docs/03_protocols_and_standards/LEO_v4.2_PLAYWRIGHT_TESTING_INTEGRATION.md`

### Test Coverage Requirements

**Minimum Coverage Targets**:
- Unit tests: 80% code coverage
- E2E tests: All critical user journeys
- Visual QA: All public-facing UI components

---

## Related Documentation

### Testing Tools & Frameworks
- `/docs/reference/qa-director-guide.md` - QA Engineering Director v2.0
- `/docs/03_protocols_and_standards/LEO_v4.2_PLAYWRIGHT_TESTING_INTEGRATION.md` - Playwright setup

### Protocol References
- `/CLAUDE_EXEC.md` - EXEC phase testing requirements
- `/CLAUDE_PLAN.md` - PLAN phase test strategy
- `/docs/03_protocols_and_standards/` - Testing protocols

### Feature Testing
- `/docs/04_features/` - Feature-specific test requirements
- `/docs/02_api/` - API testing documentation

---

## Quick Reference

### Running Tests

**Unit Tests**:
```bash
npm run test
npm run test:coverage
```

**E2E Tests** (Playwright):
```bash
npx playwright test
npx playwright test --ui  # Interactive mode
```

**Specific Test File**:
```bash
npx playwright test tests/e2e/feature-name.spec.ts
```

### Test Organization

```
tests/
├── unit/              # Unit tests
│   └── components/    # Component tests
├── e2e/               # E2E tests
│   └── *.spec.ts      # Playwright specs
└── fixtures/          # Test fixtures and data
```

---

## Testing Tiers

### Tier 1: Critical Path Testing
- Authentication flows
- Core venture workflows
- Data integrity operations

### Tier 2: Feature Testing
- New feature validation
- UI component testing
- Integration testing

### Tier 3: Edge Cases
- Error handling
- Performance testing
- Accessibility testing

---

## Navigation

- **Parent**: [Documentation Home](../01_architecture/README.md)
- **Next**: [06 Deployment](../06_deployment/README.md)
- **Previous**: [04 Features](../04_features/README.md)

---

## Contributing

When adding new testing documentation:
1. Follow [DOCUMENTATION_STANDARDS.md](../03_protocols_and_standards/DOCUMENTATION_STANDARDS.md)
2. Include metadata headers
3. Link to related test files
4. Document test scenarios and expected outcomes
5. Update this README with new files

---

**Note**: For comprehensive testing guidelines, see QA Engineering Director v2.0 guide in `/docs/reference/qa-director-guide.md`
