---
description: Force TESTING sub-agent analysis for QA and testing
argument-hint: [describe what needs testing]
---

# 🧪 LEO TESTING Sub-Agent Analysis

**Testing Context:** $ARGUMENTS

## TESTING Sub-Agent Strategy:

### 1. Test Coverage Analysis
- Current coverage percentage
- Uncovered code paths
- Critical paths needing tests
- Edge cases to consider

### 2. Test Types Needed
- **Unit Tests**: Individual functions/components
- **Integration Tests**: Module interactions
- **E2E Tests**: User workflows
- **Performance Tests**: Load/stress testing
- **Accessibility Tests**: WCAG compliance

### 3. Test Implementation
```javascript
// Example test structure
describe('[Feature]', () => {
  it('should [expected behavior]', () => {
    // Arrange
    // Act
    // Assert
  });
});
```

### 4. Testing Tools
- Jest for unit tests
- React Testing Library for components
- Playwright/Cypress for E2E
- Coverage reports
- Mock data strategies

### 5. Specific Test Cases
Based on the issue:
- Happy path scenarios
- Error handling
- Boundary conditions
- User interaction flows
- State management tests

## Test Plan:
1. **Immediate**: Quick smoke tests
2. **Short-term**: Comprehensive unit tests
3. **Long-term**: Full E2E test suite

## Quality Metrics:
- Code coverage target: >80%
- Test execution time: <5 minutes
- Flakiness rate: <1%
- Bug escape rate tracking

## Regression Prevention:
- Tests for this specific issue
- Related functionality tests
- Automated test runs
- Pre-commit hooks

Provide specific test cases with example code and expected assertions.