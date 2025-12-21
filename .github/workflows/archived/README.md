# Archived Workflows

**Archived**: 2025-12-21
**Reason**: SD-ARCH-EHG-007 - Unified Frontend Architecture

## Why These Workflows Are Archived

These workflows were designed to test the `src/client/` React frontend that was part of EHG_Engineer.
With SD-ARCH-EHG-007, the architecture changed:

- **EHG** is now the unified frontend (user + admin features at `/admin/*` routes on port 8080)
- **EHG_Engineer** is now backend API only (port 3000)

The `src/client/` directory was removed, making these workflows obsolete.

## Archived Files

| File | Purpose | Replacement |
|------|---------|-------------|
| a11y-check.yml | Accessibility testing for src/client | Use EHG's accessibility tests |
| perf-budget.yml | Bundle size checks for src/client | Use EHG's performance testing |
| visual-regression.yml | Visual tests for src/client | Use EHG's visual regression tests |
| playwright-e2e.yml | E2E testing for src/client React app | Use EHG's Playwright tests |

## If You Need These Tests

All frontend testing should now be done in the EHG repository:
- Path: `/mnt/c/_EHG/EHG/`
- Test commands: See EHG's package.json for test:e2e, test:a11y, etc.
