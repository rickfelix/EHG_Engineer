# Archived Tests

**Archived**: 2025-12-21
**Reason**: SD-ARCH-EHG-007 - Unified Frontend Architecture

## Why These Tests Are Archived

These tests were designed to test the `src/client/` React frontend that was part of EHG_Engineer.
With SD-ARCH-EHG-007, the architecture changed:

- **EHG** is now the unified frontend (user + admin features at `/admin/*` routes on port 8080)
- **EHG_Engineer** is now backend API only (port 3000)

The `src/client/` directory was removed, making these UI/visual tests obsolete.

## Archived Test Categories

| Category | Files | Replacement |
|----------|-------|-------------|
| Visual Regression | visual/*.js | Use EHG's visual tests |
| Accessibility | a11y.spec.js | Use EHG's accessibility tests |
| Directive Lab UI | test-directive-lab-*.js | DirectiveLab migrated to EHG /admin/* |
| UI Validation | validate-directive-lab-final.js | Use EHG's E2E tests |
| Toggle/Theme | verify-toggle-placement.js | Use EHG's component tests |
| App Review | comprehensive-app-review.js | Manual testing or EHG E2E |

## Valid Test Locations

### EHG_Engineer (Backend API Tests)
- `tests/unit/` - Unit tests for backend services
- `tests/integration/` - Database integration tests
- `tests/e2e/` - API endpoint E2E tests (not UI)
- `tests/uat/` - Backend UAT tests

### EHG (Frontend Tests)
- Path: `/mnt/c/_EHG/EHG/tests/`
- UI tests, visual regression, accessibility

## If You Need to Restore

If these tests need to be restored for any reason:
1. Move files from `tests/archived/` back to their original locations
2. Update port references from 3000/3001 to 8080
3. Update any `src/client/` path references
