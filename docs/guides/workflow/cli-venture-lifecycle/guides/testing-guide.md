
## Table of Contents

- [Test Architecture Overview](#test-architecture-overview)
- [Unit Tests](#unit-tests)
  - [Location and Framework](#location-and-framework)
  - [Dependency Injection Pattern](#dependency-injection-pattern)
  - [Test Categories](#test-categories)
  - [Mock Construction Patterns](#mock-construction-patterns)
  - [Running Unit Tests](#running-unit-tests)
- [Stage Template Tests](#stage-template-tests)
  - [Per-Template Validation](#per-template-validation)
  - [Template Test Pattern](#template-test-pattern)
- [Integration Tests](#integration-tests)
  - [Setup Requirements](#setup-requirements)
  - [Test Categories](#test-categories)
  - [Test Data Management](#test-data-management)
  - [Running Integration Tests](#running-integration-tests)
- [UAT Tests](#uat-tests)
  - [Framework and Location](#framework-and-location)
  - [Prerequisites](#prerequisites)
  - [Test Scenarios](#test-scenarios)
  - [Running UAT Tests](#running-uat-tests)
- [Test Coverage Strategy](#test-coverage-strategy)
  - [What to Cover](#what-to-cover)
  - [What NOT to Test](#what-not-to-test)
- [Debugging Test Failures](#debugging-test-failures)
  - [Common Vitest Issues](#common-vitest-issues)
  - [Common Integration Test Issues](#common-integration-test-issues)
  - [Common Playwright Issues](#common-playwright-issues)
- [Related Documentation](#related-documentation)

---
Category: Guide
Status: Approved
Version: 1.0.0
Author: DOCMON Sub-Agent
Last Updated: 2026-02-08
Tags: [cli-venture-lifecycle, eva, guide]
Related SDs: [SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001]
---

# Testing Guide

This guide covers testing strategies, patterns, and execution for the Eva
Orchestrator CLI Venture Lifecycle system. Tests span unit, integration,
and UAT layers.

## Test Architecture Overview

```
+-----------------------------------------------------------+
|                    Test Pyramid                             |
|                                                           |
|                      /\                                    |
|                     /  \       UAT / E2E                   |
|                    / Pw \      Playwright (tests/uat/)     |
|                   /------\                                 |
|                  /        \    Integration                  |
|                 / Vitest+DB \  Real Supabase connection     |
|                /------------\                              |
|               /              \ Unit                        |
|              / Vitest (mocks) \ Dependency injection       |
|             /------------------\                           |
+-----------------------------------------------------------+

Test Locations:
  Unit:        lib/eva/__tests__/eva-orchestrator.test.js
  Templates:   lib/eva/stage-templates/__tests__/
  Integration: lib/eva/__tests__/integration/
  UAT:         tests/uat/eva.spec.js
  Validation:  lib/eva/stage-templates/validation.js
```

## Unit Tests

### Location and Framework

- **File**: `lib/eva/__tests__/eva-orchestrator.test.js`
- **Framework**: Vitest
- **Pattern**: Dependency injection (no `vi.mock()` module-level mocking)

### Dependency Injection Pattern

The Eva Orchestrator is designed for testability through constructor injection.
All external dependencies are passed in, not imported directly. This eliminates
the need for module mocking and makes tests deterministic.

Injected dependencies in tests:

| Dependency | Test Double | Purpose |
|------------|-------------|---------|
| `db` | Mock Supabase client | Simulate database reads/writes |
| `llmClient` | Mock LLM client | Return predetermined stage outputs |
| `stageTemplates` | Mock template registry | Control template resolution |
| `ventureContextManager` | Mock context manager | Set venture context |
| `chairmanPreferenceStore` | Mock preference store | Control thresholds |
| `decisionFilterEngine` | Mock filter engine | Control filter behavior |

### Test Categories

#### Constructor Validation

Tests that verify the orchestrator rejects invalid configuration:

- Missing `ventureId` throws descriptive error
- Missing `db` client throws descriptive error
- Missing `chairmanId` throws descriptive error
- Invalid `ventureId` format (not UUID) throws error
- Null dependencies are caught at construction, not at runtime

#### processStage Workflow

Tests that verify the stage processing pipeline:

- Stage template is loaded from registry by stage number
- Dependencies are checked before execution
- Required inputs are gathered from previous artifacts
- LLM client is called with the correct prompt and tier
- Output is validated against the template's output schema
- Artifact is stored in the database with correct metadata
- Stage transition is recorded with idempotency key
- Eva event is emitted with correct payload
- Decision filters are applied to the output
- Gate evaluation occurs at boundary stages

#### Error Handling

Tests that verify graceful failure behavior:

- LLM timeout triggers retry with exponential backoff
- LLM JSON parse failure triggers retry (up to 3 attempts)
- Database write failure is surfaced with context
- Missing dependency stage returns clear error, not cryptic failure
- Template validation failure is caught before LLM call
- Gate failure halts processing with actionable details

#### Idempotency

Tests that verify duplicate-safe behavior:

- Re-processing a completed stage skips LLM call
- Re-processing updates artifact version, not duplicate
- Idempotency key format is consistent: `{ventureId}:{stageNumber}`

#### Multi-Stage Execution

Tests for `runMultipleStages()`:

- Stages execute in order from `fromStage` to `toStage`
- Kill gate failure stops further processing
- Completed stages are skipped
- Inactive stages are skipped
- Return value includes completed, skipped, and failed stages

### Mock Construction Patterns

Tests construct mock objects that mirror the real dependency interfaces:

```
Mock DB Client Structure:
  .from(tableName)
    .select(columns)
      .eq(field, value)
        .single()          → { data, error }
        .order(col, opts)  → { data, error }
    .insert(row)
      .select()
        .single()          → { data, error }
    .update(fields)
      .eq(field, value)
        .select()
          .single()        → { data, error }

Mock LLM Client Structure:
  .chat({ messages, model, temperature, maxTokens })
    → { content: JSON.stringify(stageOutput) }

Mock Stage Template Structure:
  STAGE_METADATA: { stageNumber, stageName, llmTier, estimatedTokens, ... }
  ANALYSIS_PROMPT: "Template prompt string with {{variables}}"
  execute(inputs, llmClient): Promise<{ output, qualityScore }>
```

### Running Unit Tests

```bash
npx vitest run lib/eva/__tests__/eva-orchestrator.test.js
npx vitest run lib/eva/__tests__/ --reporter=verbose
npx vitest watch lib/eva/__tests__/  # Watch mode during development
```

## Stage Template Tests

### Per-Template Validation

Each stage template can be validated independently using the validation utility
at `lib/eva/stage-templates/validation.js`.

#### STAGE_METADATA Validation

Every template must export a `STAGE_METADATA` object with:

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `stageNumber` | number | Yes | 1-30, matches filename |
| `stageName` | string | Yes | Non-empty, descriptive |
| `stageCategory` | string | Yes | One of: identity, blueprint, build, launch, growth |
| `llmTier` | string | Yes | One of: haiku, sonnet, opus |
| `estimatedTokens` | number | Yes | Positive integer |
| `requiredInputs` | string[] | Yes | Array of artifact type identifiers |
| `outputArtifactTypes` | string[] | Yes | Array of artifact type identifiers |
| `dependsOn` | number[] | Yes | Stage numbers that must complete first |

#### Required Inputs Validation

Tests verify that:

- Each `requiredInputs` entry corresponds to an artifact produced by a prior stage
- The dependency graph has no cycles
- All dependencies are within the 1-30 stage range
- Required inputs align with the `depends_on` stages

#### Output Schema Validation

Templates define expected output shapes. Validation checks:

- The `execute()` function returns an object with `output` and `qualityScore`
- `output` matches the template's declared output schema
- `qualityScore` is a number between 0 and 1
- All `outputArtifactTypes` are produced

#### Running Template Validation

```bash
# Validate all templates
node lib/eva/stage-templates/validation.js --all

# Validate a specific template
node lib/eva/stage-templates/validation.js --stage 14

# Validate with verbose output
node lib/eva/stage-templates/validation.js --all --verbose
```

### Template Test Pattern

Individual template tests follow this structure:

```
Test: Stage {N} Template
  |
  +-- Describe: STAGE_METADATA
  |     +-- Has correct stageNumber
  |     +-- Has valid stageCategory
  |     +-- Has valid llmTier
  |     +-- Has non-empty requiredInputs
  |     +-- Has non-empty outputArtifactTypes
  |
  +-- Describe: ANALYSIS_PROMPT
  |     +-- Is a non-empty string
  |     +-- Contains expected template variables
  |     +-- Does not exceed token budget
  |
  +-- Describe: execute()
        +-- Returns valid output shape
        +-- Produces all declared artifact types
        +-- Returns quality score in range [0, 1]
        +-- Handles missing inputs gracefully
        +-- Handles LLM error gracefully
```

## Integration Tests

### Setup Requirements

Integration tests connect to a real Supabase database. Required:

- Valid `SUPABASE_URL` in `.env`
- Valid `SUPABASE_SERVICE_ROLE_KEY` in `.env`
- All Eva tables must exist (see developer-setup.md)
- `lifecycle_stage_config` must be populated

### Test Categories

#### Create-Execute-Verify Flow

End-to-end test that:

1. Creates a test venture in the database
2. Initializes the orchestrator with the test venture
3. Executes one or more stages
4. Verifies artifacts were stored correctly
5. Verifies stage transitions were recorded
6. Verifies eva_events were emitted
7. Cleans up test data

#### Gate Enforcement Testing

Tests that verify gates function with real database state:

- Reality gate fails when required artifacts are missing from database
- Reality gate passes when all required artifacts are present
- Kill gate respects Chairman preference threshold from database
- Promotion gate checks all checklist items against database records

#### Multi-Stage Workflow Testing

Tests that run sequences of stages with real dependencies:

- Stages 1-3 execute in order, each depending on prior outputs
- Stage with unmet dependency is correctly deferred
- Completed stages are detected via database lookup and skipped
- Kill gate at stage boundary stops further processing

### Test Data Management

#### Cleanup Patterns

Integration tests use `afterAll` hooks to clean up test data:

```
Cleanup Order (reverse of creation):
  1. Delete eva_events for test venture
  2. Delete venture_stage_transitions for test venture
  3. Delete venture_artifacts for test venture
  4. Delete chairman_preferences for test venture
  5. Delete the test venture itself
```

All cleanup queries filter by the test venture's UUID, ensuring isolation
from production data.

#### Test Venture Naming

Test ventures use a distinctive naming pattern to distinguish them from
real ventures: `__TEST_VENTURE_{timestamp}_{random}`. This allows manual
cleanup if `afterAll` hooks fail.

#### Isolation

Each integration test suite creates its own venture with a unique UUID.
Tests within a suite share the venture but execute sequentially (not in
parallel) to avoid race conditions on stage transitions.

### Running Integration Tests

```bash
# All integration tests
npx vitest run lib/eva/__tests__/integration/

# Specific test file
npx vitest run lib/eva/__tests__/integration/orchestrator-flow.test.js

# With real database logging
npx vitest run lib/eva/__tests__/integration/ --reporter=verbose
```

## UAT Tests

### Framework and Location

- **Framework**: Playwright
- **Location**: `tests/uat/eva.spec.js`
- **Requires**: Running LEO stack

### Prerequisites

Before running UAT tests:

1. Start the LEO stack: `node scripts/cross-platform-run.js leo-stack restart`
2. Verify servers are running: `node scripts/cross-platform-run.js leo-stack status`
3. Ensure test data exists (venture records in database)

### Test Scenarios

#### Eva Chat Interface

Tests the Eva chat interface in the LEO dashboard:

1. Navigate to Eva chat page
2. Start a new venture conversation
3. Verify stage processing messages appear
4. Verify artifact display in the UI
5. Verify gate decision prompts
6. Verify progress indicator updates

#### Visual Verification

Playwright captures screenshots at key points:

- Before and after each stage completes
- Gate decision prompts
- Error states
- Completion state

Screenshots are stored in `tests/uat/screenshots/` for review.

### Running UAT Tests

```bash
# Start the LEO stack first
node scripts/cross-platform-run.js leo-stack restart

# Run Eva UAT tests
npx playwright test tests/uat/eva.spec.js

# Run with headed browser (for visual debugging)
npx playwright test tests/uat/eva.spec.js --headed

# Run with trace recording
npx playwright test tests/uat/eva.spec.js --trace on
```

## Test Coverage Strategy

### What to Cover

| Area | Coverage Target | Rationale |
|------|----------------|-----------|
| Orchestrator core | High | Critical state machine logic |
| Stage templates | Medium | Each template independently testable |
| Gates | High | Security/enforcement boundaries |
| Decision filters | Medium | Business logic correctness |
| SD Bridge | High | Cross-system integration |
| Drift detector | Medium | Analysis quality |
| Services | Low | Mostly LLM prompt wrappers |

### What NOT to Test

- LLM prompt quality (subjective, use benchmarks instead)
- Supabase client internals (trust the SDK)
- Template prompt text content (changes frequently)
- Database migration idempotency (tested by migration framework)

## Debugging Test Failures

### Common Vitest Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `Cannot find module` | ESM import path issue | Ensure `.js` extension in imports |
| `ReferenceError: vi is not defined` | Missing Vitest globals | Add `globals: true` to config |
| Timeout on LLM call | Mock not properly injected | Verify mock is passed to constructor |
| Idempotency test fails | Previous test data not cleaned | Check `afterAll` cleanup hooks |

### Common Integration Test Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| RLS policy error | Using anon key | Switch to `SUPABASE_SERVICE_ROLE_KEY` |
| Table not found | Migration not run | Execute migrations via DATABASE agent |
| Stale data | Previous test cleanup failed | Manual cleanup with test venture name |
| Timeout | Supabase connection slow | Increase Vitest timeout for integration |

### Common Playwright Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Page not loading | LEO stack not running | Run `leo-stack restart` |
| Element not found | UI changed | Update selectors in spec file |
| Screenshot mismatch | CSS changes | Update baseline screenshots |
| Timeout on action | Server processing slow | Increase Playwright timeout |

## Related Documentation

- Developer Setup: `docs/workflow/cli-venture-lifecycle/guides/developer-setup.md`
- Running a Venture: `docs/workflow/cli-venture-lifecycle/guides/running-a-venture.md`
- Troubleshooting: `docs/workflow/cli-venture-lifecycle/guides/troubleshooting.md`
- QA Director Guide: `docs/reference/qa-director-guide.md`
