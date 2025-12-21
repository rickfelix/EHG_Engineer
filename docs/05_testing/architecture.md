# Multi-Application Testing Architecture

> **ARCHITECTURE UPDATE (SD-ARCH-EHG-007)**: EHG is now the **unified frontend** (user + admin via `/admin` routes). EHG_Engineer is **backend API only**. Both share the consolidated database (`dedlbzhpgkmetvhbkyzq`).

## Overview

The EHG ecosystem consists of a **unified frontend (EHG)** and **backend API (EHG_Engineer)** with coordinated test suites sharing the consolidated database. Understanding this architecture is critical for accurate test execution and coverage reporting.

## Applications

### 1. EHG_Engineer (Backend API + LEO Protocol Engine)

**Purpose**: Backend REST API and LEO Protocol execution engine (no standalone UI)

**Location**: `/mnt/c/_EHG/EHG_Engineer/`

**Test Configuration**:
- **Test Directory**: `/mnt/c/_EHG/EHG_Engineer/tests/`
- **Test Framework**: Vitest + Jest
- **Coverage Target**: 50% minimum for API and LEO Protocol features
- **Test Types**: Unit tests, integration tests for LEO Protocol, API tests
- **Run Command**: `npm run test` (from EHG_Engineer directory)

**What We Test**:
- REST API endpoints (`/api/sd`, `/api/prd`, etc.)
- LEO Protocol workflow execution
- Database operations (Supabase: dedlbzhpgkmetvhbkyzq)
- Sub-agent and skill execution

**GitHub**: https://github.com/rickfelix/EHG_Engineer.git

---

### 2. EHG (Unified Frontend - User + Admin)

**Purpose**: Unified frontend with user features AND admin dashboard at `/admin/*` routes

**Location**: `/mnt/c/_EHG/EHG/`

**Test Configuration**:
- **Test Directory**: `/mnt/c/_EHG/EHG/tests/`
- **Test Framework**: Vitest (unit), Playwright (E2E)
- **Coverage Targets**:
  - Unit: 50% minimum
  - E2E: Comprehensive user flow coverage
  - A11y: WCAG 2.1 AA compliance

**Test Structure**:
```
tests/
├── unit/              # Vitest unit tests
├── integration/       # Integration tests
├── e2e/              # Playwright E2E tests (extensive)
├── a11y/             # Accessibility tests
├── security/         # Security tests
└── performance/      # Performance tests
```

**Run Commands**:
- `npm run test:unit` - Unit tests with coverage
- `npm run test:integration` - Integration tests
- `npm run test:e2e` - Playwright E2E tests
- `npm run test:a11y` - Accessibility tests

**What We Test**:
- User-facing features (ventures, dashboard)
- Admin features at `/admin/*` routes (SD management, PRDs, backlog)
- Business logic and services
- User experience flows
- Authentication and security
- Database operations (Supabase: dedlbzhpgkmetvhbkyzq - CONSOLIDATED)

**GitHub**: https://github.com/rickfelix/ehg.git

---

## Critical Context Switching Rules

### Before Running ANY Tests

1. **Read SD Description** - Which layer is the SD targeting?
   - SD mentions "backend API", "LEO Protocol scripts", "REST endpoints" → EHG_Engineer
   - SD mentions "UI", "user features", "admin dashboard", "/admin routes" → EHG

2. **Navigate to Correct Directory**:
   ```bash
   # For EHG_Engineer API/backend tests:
   cd /mnt/c/_EHG/EHG_Engineer && npm run test

   # For EHG unified frontend tests:
   cd /mnt/c/_EHG/EHG && npm run test:unit
   ```

3. **Verify Test Location**:
   - ✅ **Right**: Tests execute, coverage report generated
   - ❌ **Wrong**: "No tests found" error

### Coverage Reporting

**Coverage metrics are INDEPENDENT** - report separately:

- **EHG_Engineer Coverage**: Backend API and LEO Protocol engine
- **EHG Coverage**: Unified frontend (user + admin features)

**DO NOT** combine coverage metrics across applications!

---

## Common Mistakes to Avoid

| ❌ Mistake | ✅ Correct Approach |
|-----------|-------------------|
| Assuming test location based on current directory | Always verify target application from SD context |
| Running tests in wrong application directory | Navigate to correct app before test execution |
| Combining coverage metrics across applications | Report coverage per application separately |
| Claiming "zero test coverage" without checking both apps | Verify test suite in correct application first |
| Looking for admin UI tests in EHG_Engineer | Admin UI is in EHG at `/admin/*` routes |
| Looking for API tests in EHG | Backend API tests are in EHG_Engineer |

---

## Sub-Agent Context: QA Engineering Director

When QA sub-agent is triggered:

1. **Determine target application** from SD context
2. **Navigate to correct test directory**
3. **Run appropriate test suite** for that application
4. **Report coverage** for that application only
5. **Document test location** in handoffs

### Example Workflow

```bash
# Step 1: Identify target from SD
# SD-QUALITY-001 mentions "EHG application business logic"
# Target: /mnt/c/_EHG/EHG/

# Step 2: Navigate
cd /mnt/c/_EHG/EHG

# Step 3: Run appropriate tests
npm run test:unit

# Step 4: Report coverage
# "EHG application unit test coverage: 12% (4 test files, 528 source files)"
```

---

## Real-World Example: SD-QUALITY-001 Learning

### Original Claim
"362,538 LOC with only 6 test files (0.001% coverage)"

### Investigation Revealed
- **EHG application** has **63 test files** (not 6!)
- Extensive E2E tests (Playwright)
- Extensive integration tests
- Comprehensive accessibility tests (a11y)
- Security and performance tests

### Actual Gap
- Only **4 unit test files** in `tests/unit/`
- **528 source files** in `src/`
- **Unit test coverage gap** for business logic

### Corrected Scope
"Unit test coverage gap in EHG application business logic"

### Lesson Learned
**Always verify test suite in correct application before making claims about coverage!**

---

## Testing Infrastructure by Application

### EHG_Engineer

**Vitest Configuration** (`vitest.config.js`):
- Coverage provider: v8
- Environment: node
- Test files: `tests/**/*.{test,spec}.{js,ts}`

**Jest Configuration** (`jest.config.cjs`):
- Preset: ESM support
- Coverage provider: v8
- Test environment: node

### EHG

**Vitest Configuration** (`vitest.config.ts`):
```typescript
{
  coverage: {
    provider: 'v8',
    thresholds: {
      global: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80
      }
    }
  }
}
```

**Playwright Configuration** (`playwright.config.ts`):
- Multiple test projects (chromium, firefox, webkit)
- Screenshot on failure
- Trace on first retry
- Base URL: http://localhost:3000

---

## Quick Reference Commands

```bash
# EHG_Engineer Tests
cd /mnt/c/_EHG/EHG_Engineer
npm run test                    # All tests
npm run test:coverage           # With coverage

# EHG Application Tests
cd /mnt/c/_EHG/EHG
npm run test:unit               # Unit tests
npm run test:integration        # Integration tests
npm run test:e2e                # E2E tests (Playwright)
npm run test:a11y               # Accessibility tests
npm run test:coverage           # All with coverage

# Count test files
find ./tests -name "*.test.*" -o -name "*.spec.*" | wc -l
```

---

## Database Context

Both applications share the consolidated Supabase database (SD-ARCH-EHG-007):

| Application | Database Project ID | Purpose |
|------------|---------------------|---------|
| **EHG** | dedlbzhpgkmetvhbkyzq | Unified frontend (user + admin) |
| **EHG_Engineer** | dedlbzhpgkmetvhbkyzq | Backend API + LEO Protocol |

---

## Summary

**Key Takeaway**: EHG ecosystem has a **unified frontend (EHG)** and **backend API (EHG_Engineer)** sharing the consolidated database. Identify target layer from SD context before running tests or reporting coverage.

**When in doubt**:
1. Check SD description for application layer (UI vs API)
2. Navigate to correct directory
3. Verify test location before execution
4. Report coverage per application separately

---

**Document Version**: 1.0
**Created**: 2025-10-02
**Source**: SD-QUALITY-001 root cause analysis
**Related**: CLAUDE.md Multi-Application Testing Architecture section
