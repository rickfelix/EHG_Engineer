# Test Management System

**SD-TEST-MANAGEMENT-001**

A comprehensive test management system providing intelligent test execution, analysis, and optimization capabilities.

## Quick Start

```bash
# Scan and register tests
node scripts/test-scanner.js

# Run tests with smart selection
node scripts/test-selection.js select --risk high

# Automate test execution
node scripts/test-automation.js watch
```

## System Components

| Component | Script | Purpose |
|-----------|--------|---------|
| Scanner | `test-scanner.js` | Discover and register tests |
| Selection | `test-selection.js` | Smart test selection |
| Automation | `test-automation.js` | Watch mode and parallel execution |
| LLM Core | `test-llm-core.js` | AI-powered analysis |
| LLM Advanced | `test-llm-advanced.js` | Multi-agent orchestration |
| Result Capture | `test-result-capture.js` | CI/CD integration |

## CLI Reference

### test-scanner.js

Discovers test files and registers them in the UAT database.

```bash
# Full scan and registration
node scripts/test-scanner.js

# Dry run (no database writes)
node scripts/test-scanner.js --dry-run

# Verbose output
node scripts/test-scanner.js --verbose
```

**Output**: `test-scanner-report.json`

### test-selection.js

Intelligent test selection based on risk, history, and duration.

```bash
# Select high-risk tests
node scripts/test-selection.js select --risk high

# Limit to 50 tests
node scripts/test-selection.js select --limit 50

# Select tests affected by recent changes
node scripts/test-selection.js select --since main

# Detect flaky tests
node scripts/test-selection.js flaky

# Analyze test patterns
node scripts/test-selection.js analyze

# Generate comprehensive report
node scripts/test-selection.js report
```

**Commands**: `select`, `flaky`, `analyze`, `report`

### test-automation.js

Automated test execution with watch mode and parallel execution.

```bash
# Start watch mode
node scripts/test-automation.js watch

# Run affected tests
node scripts/test-automation.js affected --since HEAD~3

# Parallel execution
node scripts/test-automation.js parallel --workers 4

# Generate metrics report
node scripts/test-automation.js report
```

**Commands**: `watch`, `affected`, `parallel`, `report`

### test-llm-core.js

LLM-powered test analysis using Claude API.

```bash
# Analyze test failures
node scripts/test-llm-core.js analyze

# Generate test suggestions
node scripts/test-llm-core.js generate src/services/auth.js

# Identify coverage gaps
node scripts/test-llm-core.js coverage

# Diagnose flaky tests
node scripts/test-llm-core.js flaky

# Generate comprehensive report
node scripts/test-llm-core.js report
```

**Commands**: `analyze`, `generate`, `coverage`, `flaky`, `report`

**Cost**: Approximately $0.01-0.05 per analysis

### test-llm-advanced.js

Advanced multi-agent test orchestration.

```bash
# Multi-agent orchestration
node scripts/test-llm-advanced.js orchestrate --agents 3

# Intelligent retry strategy
node scripts/test-llm-advanced.js retry auth.spec.ts

# Test suite optimization
node scripts/test-llm-advanced.js optimize

# Parallel execution strategy
node scripts/test-llm-advanced.js parallel

# Comprehensive report
node scripts/test-llm-advanced.js report
```

**Commands**: `orchestrate`, `retry`, `optimize`, `parallel`, `report`

**Cost**: Approximately $0.05-0.25 per analysis

### test-result-capture.js

Captures test results from CI/CD and stores in database.

```bash
# Capture from default paths
node scripts/test-result-capture.js

# Capture from specific file
node scripts/test-result-capture.js --json test-results.json

# CI mode with branch
node scripts/test-result-capture.js --ci --branch feature/my-branch

# Link to Strategic Directive
node scripts/test-result-capture.js --sd SD-FEATURE-001
```

## Database Schema

The system uses the UAT (User Acceptance Testing) schema:

- `uat_test_suites` - Test suite definitions
- `uat_test_cases` - Individual test case records
- `test_runs` - Test execution records
- `test_failures` - Failure tracking
- `uat_coverage_metrics` - Coverage metrics

## CI/CD Integration

The system integrates with GitHub Actions via `.github/workflows/test-coverage.yml`:

1. Tests run with coverage
2. Results captured to database
3. Coverage thresholds enforced
4. Grace period labels supported

## Architecture

```
scripts/
  test-scanner.js       # Discovery & registration
  test-selection.js     # Smart selection
  test-automation.js    # Execution automation
  test-llm-core.js      # Core LLM analysis
  test-llm-advanced.js  # Advanced multi-agent
  test-result-capture.js # CI/CD capture
  lib/
    test-parser.js      # Test file parsing
    test-registrar.js   # Database registration
```

## Configuration

Environment variables:
- `SUPABASE_URL` - Database URL
- `SUPABASE_SERVICE_ROLE_KEY` - Database key
- `ANTHROPIC_API_KEY` - For LLM features

## Reports Generated

| Script | Report File |
|--------|-------------|
| test-scanner.js | test-scanner-report.json |
| test-selection.js | test-selection-report.json |
| test-automation.js | test-automation-report.json |
| test-llm-core.js | test-llm-report.json |
| test-llm-advanced.js | test-llm-advanced-report.json |
| test-result-capture.js | test-capture-report.json |

## Related SDs

- SD-TEST-MGMT-SCHEMA-001 - Database schema
- SD-TEST-MGMT-CLEANUP-001 - Legacy cleanup
- SD-TEST-MGMT-SCANNER-001 - Test scanning
- SD-TEST-MGMT-CICD-001 - CI/CD integration
- SD-TEST-MGMT-AUTOMATION-001 - Automation workflows
- SD-TEST-MGMT-SELECTION-001 - Smart selection
- SD-TEST-MGMT-LLM-CORE-001 - Core LLM
- SD-TEST-MGMT-LLM-ADV-001 - Advanced LLM
- SD-TEST-MGMT-DOCS-001 - Documentation
- SD-TEST-MGMT-EXEC-001 - Execution validation
