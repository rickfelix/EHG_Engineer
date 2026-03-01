# UAT System - Quick Start Guide


## Table of Contents

- [Overview](#overview)
- [🚀 5-Minute Getting Started](#-5-minute-getting-started)
  - [Prerequisites](#prerequisites)
  - [Step 1: Initialize Database (One-time setup)](#step-1-initialize-database-one-time-setup)
  - [Step 2: Compile TypeScript Files](#step-2-compile-typescript-files)
  - [Step 3: Start UAT Lead (Terminal 1)](#step-3-start-uat-lead-terminal-1)
  - [Step 4: Start UAT Wizard (Terminal 2)](#step-4-start-uat-wizard-terminal-2)
  - [Step 5: Execute Tests](#step-5-execute-tests)
  - [Step 6: Monitor Progress (Terminal 1 - UAT Lead)](#step-6-monitor-progress-terminal-1---uat-lead)
  - [Step 7: Check Status](#step-7-check-status)
- [📊 Gate Rules](#-gate-rules)
- [🔧 Advanced Usage](#-advanced-usage)
  - [Export Results](#export-results)
  - [Resume Testing Session](#resume-testing-session)
  - [Direct Database Queries](#direct-database-queries)
- [📁 File Structure](#-file-structure)
- [🐛 Troubleshooting](#-troubleshooting)
  - [Database Connection Issues](#database-connection-issues)
  - [TypeScript Compilation Errors](#typescript-compilation-errors)
  - [Payload Not Processing](#payload-not-processing)
  - [Tests Not Loading](#tests-not-loading)
- [📈 Optional: UAT Dashboard](#-optional-uat-dashboard)
- [🎯 Tips for Effective UAT](#-tips-for-effective-uat)
- [📚 Further Resources](#-further-resources)

## Overview

A simple, database-backed User Acceptance Testing system for the EHG application with two cooperating agents:

- **UAT Wizard**: One-question-at-a-time test guide for human testers
- **UAT Lead**: Database writer, gate keeper, and defect creator

All UAT data is stored in EHG_Engineering database, keeping the EHG app clean.

## 🚀 5-Minute Getting Started

### Prerequisites

1. **EHG App Running**: Ensure the EHG application is running at `http://localhost:5173`
2. **Database Access**: Ensure Supabase credentials are in `.env`
3. **Node/TypeScript**: Node.js 18+ with TypeScript installed

### Step 1: Initialize Database (One-time setup)

```bash
# From EHG_Engineering directory
cd /mnt/c/_EHG/EHG_Engineer

# Apply migrations to create UAT tables
psql $DATABASE_URL -f database/migrations/uat-simple-tracking.sql

# Or use Supabase dashboard:
# 1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq
# 2. Navigate to SQL Editor
# 3. Paste and run the migration SQL
```

### Step 2: Compile TypeScript Files

```bash
# Compile the UAT scripts
npx tsc scripts/uat-wizard.ts --outDir dist/scripts --module commonjs --target es2020
npx tsc scripts/uat-lead.ts --outDir dist/scripts --module commonjs --target es2020
npx tsc api/uat/handlers.ts --outDir dist/api/uat --module commonjs --target es2020
```

### Step 3: Start UAT Lead (Terminal 1)

```bash
# Start the UAT Lead agent
node dist/scripts/uat-lead.js

# Select option 1 to create a new run
# Enter environment details:
# - Environment URL: http://localhost:5173
# - App version: 1.0.0
# - Browser: Chrome
# - Role: Admin

# Note the Run ID (e.g., abc123-def456-...)
# Keep this terminal open
```

### Step 4: Start UAT Wizard (Terminal 2)

```bash
# Export the run ID from UAT Lead
export UAT_RUN_ID=abc123-def456-...

# Start the UAT Wizard
node dist/scripts/uat-wizard.js

# Select mode:
# - 1 = Guided (step-by-step questions)
# - 2 = Quick (rapid pass/fail entry)

# Select test section or press Enter for all tests
```

### Step 5: Execute Tests

#### Quick Mode Flow:
```
Test: TEST-AUTH-001
Title: Standard Login
Section: Authentication
====================
Steps:
1. Go to: http://localhost:5173/login
2. Enter valid credentials
3. Click "Sign In"
4. Verify: Dashboard loads

Result? (p=PASS, f=FAIL, b=BLOCKED, n=NA): p

[UAT-RESULT]
run_id=abc123-def456-...
case_id=TEST-AUTH-001
status=PASS
[/UAT-RESULT]

Progress: 1/61 (2%)
```

#### Guided Mode Flow:
```
Test: TEST-AUTH-002
Title: Invalid Credentials
====================

Did you navigate to the correct page? (y/n): y
Did you complete the test steps? (y/n): y
Did the test PASS? (y/n): n
Current page URL: http://localhost:5173/login
Page heading/title: Login - EHG
Error message (if any): Invalid username or password
What went wrong? (brief): Login failed as expected with invalid creds
```

### Step 6: Monitor Progress (Terminal 1 - UAT Lead)

Copy the `[UAT-RESULT]` payload from Wizard and paste into Lead terminal. The Lead will:

1. **Log the result**: `✓ TEST-AUTH-001: PASS | Run: 1/1 (100%) [GREEN]`
2. **Create defects** (for failures): `→ Created defect: xyz789...`
3. **Update gate status**: GREEN/YELLOW/RED based on pass rate

Or select option 3 in UAT Lead to enter payload processing mode for automatic handling.

### Step 7: Check Status

In UAT Lead terminal, use commands:

```bash
Lead> status

=== Run Status ===
Run ID: abc123-def456-...
Executed: 5
Passed: 4
Failed: 1
Blocked: 0
Pass Rate: 80.0%
Critical Defects: 0
Gate Status: RED
Rationale: Pass rate below 85% threshold

Lead> defects

=== Open Defects (1) ===
Major (1):
  - TEST-AUTH-002: Invalid credentials test failed

Lead> close

=== UAT Run Complete ===
Gate Status: RED - NO-GO
Recommendation: NO-GO - Improve pass rate and fix defects
```

## 📊 Gate Rules

- **GREEN (GO)**: Pass rate ≥85% AND no critical defects
- **YELLOW (GO with conditions)**: Pass rate ≥85% BUT has critical defects
- **RED (NO-GO)**: Pass rate <85%

Pass rate = PASS / (PASS + FAIL + BLOCKED), excluding NA tests

## 🔧 Advanced Usage

### Export Results

```bash
Lead> export
Format? (json/csv): csv
✓ Exported to uat-results-abc123-def456.csv
```

### Resume Testing Session

```bash
# Terminal 1 - UAT Lead
node dist/scripts/uat-lead.js
# Select option 2: Resume run
# Enter Run ID: abc123-def456-...

# Terminal 2 - UAT Wizard
export UAT_RUN_ID=abc123-def456-...
node dist/scripts/uat-wizard.js
```

### Direct Database Queries

```sql
-- View current run status
SELECT * FROM v_uat_run_stats WHERE run_id = 'abc123-def456-...';

-- Get gate status
SELECT * FROM uat_gate_status('abc123-def456-...');

-- View all defects
SELECT * FROM uat_defects WHERE run_id = 'abc123-def456-...';
```

## 📁 File Structure

```
EHG_Engineer/
├── database/migrations/
│   └── uat-simple-tracking.sql      # Database schema
├── api/uat/
│   └── handlers.ts                  # TypeScript server utilities
├── scripts/
│   ├── uat-wizard.ts               # Wizard agent
│   └── uat-lead.ts                 # Lead agent
├── docs/uat/
│   └── README.md                   # This file
└── dist/                           # Compiled JavaScript (generated)
```

## 🐛 Troubleshooting

### Database Connection Issues
- Check `.env` has correct Supabase credentials
- Verify `SUPABASE_SERVICE_ROLE_KEY` for write operations

### TypeScript Compilation Errors
```bash
# Install missing dependencies
npm install @supabase/supabase-js chalk readline
npm install --save-dev @types/node typescript
```

### Payload Not Processing
- Ensure you include both `[UAT-RESULT]` and `[/UAT-RESULT]` tags
- Check all required fields: run_id, case_id, status
- Verify Run ID matches between Wizard and Lead

### Tests Not Loading
- Verify seed data was inserted (61 test cases)
- Check database connection
- Try specifying a section: AUTH, DASH, VENT, etc.

## 📈 Optional: UAT Dashboard

A visual dashboard is available at:
```
http://localhost:3000/uat-dashboard
```

Features:
- Real-time run progress
- Pass rate gauge with gate indicator
- Defect list by severity
- Test execution timeline
- Export controls

## 🎯 Tips for Effective UAT

1. **Start Small**: Test a single section first (e.g., AUTH)
2. **Use Quick Mode**: For experienced testers or re-runs
3. **Capture Evidence**: Always note URLs and error messages for failures
4. **Batch Similar Tests**: Group by section for efficiency
5. **Review Defects**: Check suspected files are accurate

## 📚 Further Resources

- UAT Script: `/docs/EHG_UAT_Script.md`
- Database Schema: `/database/migrations/uat-simple-tracking.sql`
- API Documentation: `/api/uat/handlers.ts`

---

**Support**: For issues or questions, contact the EHG Engineering team.

## Files

- [22 Iterative Dev Loop](22_iterative_dev_loop.md)
- [25 Quality Assurance](25_quality_assurance.md)
- [Auth Pages Validation Report](auth-pages-validation-report.md)
- [Completed Sds Testing Campaign Report](completed-sds-testing-campaign-report.md)
- [Coverage Summary Visual](coverage-summary-visual.md)
- [COVERAGE SUMMARY](COVERAGE-SUMMARY.md)
- [Dashboard Test Report](dashboard-test-report.md)
- [DIRECTIVE LAB UI IMPROVEMENTS](DIRECTIVE_LAB_UI_IMPROVEMENTS.md)
- [E2e Coverage Gap Analysis 90 Percent](e2e-coverage-gap-analysis-90-percent.md)
- [E2e Coverage Gap Analysis](e2e-coverage-gap-analysis.md)
- [E2e Coverage Summary 90 Percent](e2e-coverage-summary-90-percent.md)
- [E2e Coverage Visual Breakdown](e2e-coverage-visual-breakdown.md)
- [E2e Test Results Sd Test 001](e2e-test-results-sd-test-001.md)
- [Enhanced Architecture](enhanced-architecture.md)
- [Enhanced Index](enhanced-index.md)
- [Exec Vision Qa Workflow](exec-vision-qa-workflow.md)
- [Known Issues Unit Tests](known-issues-unit-tests.md)
- [PHASE4 VALIDATION REPORT](PHASE4-VALIDATION-REPORT.md)
- [Qa Director V2 Test Results](qa-director-v2-test-results.md)
- [Qa Engineering Director V2](qa-engineering-director-v2.md)
- [Real Testing Implementation Summary](real-testing-implementation-summary.md)
- [SD E2E COVERAGE 90 PROPOSAL](SD-E2E-COVERAGE-90-PROPOSAL.md)
- [SD FOUNDATION V3 001 Database Validation](SD-FOUNDATION-V3-001-database-validation.md)
- [SD FOUNDATION V3 001 Design Analysis](SD-FOUNDATION-V3-001-design-analysis.md)
- [SD FOUNDATION V3 006 Database Validation](SD-FOUNDATION-V3-006-database-validation.md)
- [SD FOUNDATION V3 006 Invest Validation](SD-FOUNDATION-V3-006-invest-validation.md)
- [SD FOUNDATION V3 008 User Stories Validation](SD-FOUNDATION-V3-008-user-stories-validation.md)
- [SD HARDENING V1 003 Database Agent Report](SD-HARDENING-V1-003-database-agent-report.md)
- [SD HARDENING V1 003 Database Validation](SD-HARDENING-V1-003-database-validation.md)
- [Sd Id Fk Integrity Report](sd-id-fk-integrity-report.md)
- [SD VISION V2 011 Database Validation](SD-VISION-V2-011-database-validation.md)
- [STORIES AGENT ANALYSIS AND VERIFICATION WORKFLOW](STORIES-AGENT-ANALYSIS-AND-VERIFICATION-WORKFLOW.md)
- [Sub Agent Enhancements Test Plan](sub-agent-enhancements-test-plan.md)
- [TEST REPORT MOCK DATA VERIFICATION](TEST-REPORT-MOCK-DATA-VERIFICATION.md)
- [TEST SUMMARY MOCK DATA VERIFICATION](TEST-SUMMARY-MOCK-DATA-VERIFICATION.md)
- [TEST SUMMARY SD STAGE 12 001](TEST-SUMMARY-SD-STAGE-12-001.md)
- [Test Validation Report SD STAGE 09 001](test-validation-report-SD-STAGE-09-001.md)
- [Test Validation Report SD STAGE 10 001](test-validation-report-SD-STAGE-10-001.md)
- [Test Validation Report SD VERIFY LADDER 002](test-validation-report-SD-VERIFY-LADDER-002.md)
- [TESTING REPORT STAGES 1 20](TESTING_REPORT_STAGES_1_20.md)
- [Three Tier Architecture](three-tier-architecture.md)
- [Ui Validation Report](ui-validation-report.md)
- [VOICE FUNCTION TEST SCENARIOS](VOICE_FUNCTION_TEST_SCENARIOS.md)
