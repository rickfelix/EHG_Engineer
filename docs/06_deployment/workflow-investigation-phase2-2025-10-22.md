---
category: deployment
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [deployment, auto-generated]
---
# GitHub Actions Workflow Investigation - Phase 2


## Table of Contents

- [Metadata](#metadata)
- [Executive Summary](#executive-summary)
- [Investigation Summary](#investigation-summary)
  - [1. WSJF Recommendations (Staging)](#1-wsjf-recommendations-staging)
  - [2. WSJF Recommendations (Prod)](#2-wsjf-recommendations-prod)
  - [3. Schema & System Consistency Validation](#3-schema-system-consistency-validation)
  - [4. UAT Testing Pipeline for EHG Application](#4-uat-testing-pipeline-for-ehg-application)
- [Summary of Required Fixes](#summary-of-required-fixes)
  - [Immediate Fixes (Can Implement Now)](#immediate-fixes-can-implement-now)
  - [Configuration-Dependent Fixes (Require Secrets/Access)](#configuration-dependent-fixes-require-secretsaccess)
- [Recommended Implementation Plan](#recommended-implementation-plan)
  - [Phase 2A: Immediate Fixes (Can Deploy Now)](#phase-2a-immediate-fixes-can-deploy-now)
  - [Phase 2B: Configuration Fixes (Requires Decision)](#phase-2b-configuration-fixes-requires-decision)
  - [Phase 2C: Prevention Measures](#phase-2c-prevention-measures)
- [Files to Modify](#files-to-modify)
  - [Code Changes](#code-changes)
  - [Workflow Changes](#workflow-changes)
  - [Optional Changes (Configuration-Dependent)](#optional-changes-configuration-dependent)
- [Testing Strategy](#testing-strategy)
- [Context for Fixes](#context-for-fixes)
- [Lessons Learned](#lessons-learned)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, schema, feature

**SD**: SD-CICD-WORKFLOW-FIX
**Date**: 2025-10-22
**Status**: Investigation Complete, Fixes Pending

---

## Executive Summary

Completed comprehensive investigation of 4 failing GitHub Actions workflows. Identified root causes ranging from missing secrets, incorrect secret references, code compatibility issues, and commented-out dependencies.

**Phase 2 Scope**:
- ✅ WSJF Recommendations (Staging) - Missing secrets identified
- ✅ WSJF Recommendations (Prod) - Secret/variable mismatch + wrong SQL file
- ✅ Schema & System Consistency Validation - ESM/CommonJS import issue
- ✅ UAT Testing Pipeline - Commented checkout + wrong secrets

---

## Investigation Summary

### 1. WSJF Recommendations (Staging)

**Workflow**: `.github/workflows/wsjf-staging-readonly.yml`
**Failure Rate**: 100% (last 3 runs)
**Last Failure**: 3 days ago

**Root Cause**: Missing GitHub Secrets
- ❌ PGHOST_STAGING (not found)
- ❌ PGPORT_STAGING (not found)
- ❌ PGDATABASE_STAGING (not found)
- ❌ PGUSER_STAGING (not found)
- ❌ PGPASSWORD_STAGING (not found)

**Workflow Configuration** (Lines 18-23):
```yaml
env:
  PGHOST: ${{ secrets.PGHOST_STAGING }}
  PGPORT: ${{ secrets.PGPORT_STAGING }}
  PGDATABASE: ${{ secrets.PGDATABASE_STAGING }}
  PGUSER: ${{ secrets.PGUSER_STAGING }}
  PGPASSWORD: ${{ secrets.PGPASSWORD_STAGING }}
```

**Impact**: Workflow cannot connect to staging database

**Options**:
1. Add STAGING secrets to repository
2. Point to PROD database (read-only, safe for staging workflow)
3. Disable staging workflow until STAGING environment available

---

### 2. WSJF Recommendations (Prod)

**Workflow**: `.github/workflows/wsjf-prod-readonly.yml`
**Failure Rate**: 100% (last 3 runs)

**Root Cause 1**: Secret/Variable Type Mismatch

Workflow references **secrets** but values stored as **variables**:

**Workflow (Lines 18-23)**:
```yaml
env:
  PGHOST: ${{ secrets.PGHOST_PROD }}         # ❌ REFERENCES SECRET
  PGPORT: ${{ secrets.PGPORT_PROD }}         # ❌ REFERENCES SECRET
  PGDATABASE: ${{ secrets.PGDATABASE_PROD }} # ❌ REFERENCES SECRET
  PGUSER: ${{ secrets.PGUSER_PROD }}         # ❌ REFERENCES SECRET
  PGPASSWORD: ${{ secrets.PGPASSWORD_PROD }} # ✅ EXISTS AS SECRET
```

**GitHub Configuration**:
- ✅ `vars.PGHOST_PROD` = "aws-1-us-east-1.pooler.supabase.com"
- ✅ `vars.PGPORT_PROD` = "5432"
- ✅ `vars.PGDATABASE_PROD` = "postgres"
- ✅ `vars.PGUSER_PROD` = "postgres.dedlbzhpgkmetvhbkyzq"
- ✅ `secrets.PGPASSWORD_PROD` = (exists)

**Root Cause 2**: Wrong SQL File Reference

**Line 41**:
```bash
psql -f ops/checks/wsjf_recommendations_staging.sql  # ❌ STAGING FILE!
```

Should be:
```bash
psql -f ops/checks/wsjf_recommendations_prod.sql     # ✅ PROD FILE
```

**Fix Required**:
1. Change `secrets.PGHOST_PROD` → `vars.PGHOST_PROD` (and similar for PORT, DATABASE, USER)
2. Change SQL file from staging to prod version
3. Keep PGPASSWORD as secret (correct)

---

### 3. Schema & System Consistency Validation

**Workflow**: `.github/workflows/schema-validation.yml`
**Failure Rate**: 100% (recent runs)
**Run ID**: 18712111106

**Root Cause**: ESM/CommonJS Module Incompatibility

**Error Log**:
```
SyntaxError: Named export 'glob' not found. The requested module 'glob' is a CommonJS module,
which may not support all module.exports as named exports.
CommonJS modules can always be imported via the default export
```

**Problem Code** (`scripts/validate-system-consistency.js:29`):
```javascript
import { glob } from 'glob';  // ❌ FAILS: glob is CommonJS module
```

**Fix Required**:
```javascript
import pkg from 'glob';       // ✅ Import default export
const { glob } = pkg;         // ✅ Destructure from package
```

**Impact**: Workflow fails immediately on script execution, never reaches validation logic

**Note**: This is a code fix, not a workflow configuration fix

---

### 4. UAT Testing Pipeline for EHG Application

**Workflow**: `.github/workflows/uat-testing.yml`
**Failure Rate**: 100% (last 3 runs)
**Run ID**: 18703559026

**Root Cause 1**: Missing Directory

**Error**:
```
An error occurred trying to start process '/usr/bin/bash' with working directory
'/home/runner/work/EHG_Engineer/EHG_Engineer/ehg'. No such file or directory
```

**Problem**: EHG application checkout is commented out (Lines 27-32):
```yaml
# - name: Checkout EHG Application (Target)
#   uses: actions/checkout@v3
#   with:
#     repository: rickfelix/ehg
#     path: ehg
#     token: ${{ secrets.GH_PAT }}  # Requires PAT with repo access for private repo
```

But workflow tries to use `ehg` directory:
- **Line 48-49**: Install dependencies in `ehg` directory (FAILS)
- **Line 56-59**: Start EHG app from `ehg` directory (never reached)

**Root Cause 2**: Wrong Supabase Secrets (Lines 72-73)

```yaml
env:
  SUPABASE_URL: ${{ secrets.SUPABASE_URL }}           # ❌ DOESN'T EXIST
  SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }} # ❌ DOESN'T EXIST
```

Should be:
```yaml
env:
  SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}           # ✅ EXISTS
  SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }} # ✅ EXISTS
```

**Fix Required**:
1. Uncomment EHG checkout (requires GH_PAT secret with repo access)
2. Change Supabase secret references
3. Alternative: Disable workflow until EHG repo access configured

---

## Summary of Required Fixes

### Immediate Fixes (Can Implement Now)

1. **WSJF Prod workflow** (`.github/workflows/wsjf-prod-readonly.yml`):
   - Change lines 18-22: `secrets.*` → `vars.*` for PGHOST, PGPORT, PGDATABASE, PGUSER
   - Keep line 23: `secrets.PGPASSWORD_PROD` (correct)
   - Change line 41: `wsjf_recommendations_staging.sql` → `wsjf_recommendations_prod.sql`

2. **Schema Validation script** (`scripts/validate-system-consistency.js`):
   - Change line 29: `import { glob } from 'glob'` → `import pkg from 'glob'; const { glob } = pkg;`

### Configuration-Dependent Fixes (Require Secrets/Access)

3. **WSJF Staging workflow** (`.github/workflows/wsjf-staging-readonly.yml`):
   - **Option A**: Add STAGING secrets (PGHOST_STAGING, PGPORT_STAGING, etc.)
   - **Option B**: Point to PROD database (read-only operations, safe)
   - **Option C**: Disable workflow (if STAGING environment not needed)

4. **UAT Testing workflow** (`.github/workflows/uat-testing.yml`):
   - **Option A**: Add GH_PAT secret and uncomment EHG checkout
   - **Option B**: Disable workflow (if cross-repo testing not needed yet)
   - Also fix lines 72-73: Change to NEXT_PUBLIC_SUPABASE_* secrets

---

## Recommended Implementation Plan

### Phase 2A: Immediate Fixes (Can Deploy Now)

1. Fix WSJF Prod workflow (secret→variable references + SQL file)
2. Fix Schema Validation script (ESM import)
3. Test via PR (similar to Phase 1 approach)

### Phase 2B: Configuration Fixes (Requires Decision)

4. WSJF Staging: Decide on Option A/B/C (recommend: Option B or C for now)
5. UAT Testing: Decide on Option A/B (recommend: Option B for now)

### Phase 2C: Prevention Measures

6. Add workflow YAML linting to pre-commit hooks
7. Add secret/variable reference validator
8. Document required secrets per workflow
9. Create workflow troubleshooting runbook

---

## Files to Modify

### Code Changes
1. `scripts/validate-system-consistency.js` (line 29)

### Workflow Changes
2. `.github/workflows/wsjf-prod-readonly.yml` (lines 18-23, line 41)

### Optional Changes (Configuration-Dependent)
3. `.github/workflows/wsjf-staging-readonly.yml` (disable or reconfigure)
4. `.github/workflows/uat-testing.yml` (disable or add GH_PAT + fix secrets)

---

## Testing Strategy

1. Create feature branch: `fix/SD-CICD-WORKFLOW-FIX-phase2-workflow-fixes`
2. Implement Phase 2A fixes (WSJF Prod + Schema Validation)
3. Create PR to trigger workflows
4. Verify:
   - ✅ WSJF Prod executes without secret errors
   - ✅ WSJF Prod uses correct SQL file
   - ✅ Schema Validation script executes without import errors
5. Monitor runs for 48 hours
6. Document results
7. Proceed with Phase 2B if needed

---

## Context for Fixes

**Phase 1 (COMPLETED)**:
- Fixed LEO Gates workflow
- Added NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable
- Fixed bash syntax error (`.repeat()` → `printf`)
- PR #10, commit 950483d

**Phase 2 (IN PROGRESS)**:
- Investigating 4 additional failing workflows
- Root causes identified for all 4
- Ready to implement fixes

---

## Lessons Learned

1. **Secret vs Variable confusion**: GitHub has both secrets (encrypted) and variables (plaintext). Workflows must reference the correct type.
2. **ESM/CommonJS compatibility**: Not all npm packages support ESM named imports. Use default import for CommonJS packages.
3. **Commented dependencies**: If workflow steps are commented out, all dependent steps must also be commented or removed.
4. **Cross-repo testing**: Requires PAT with repo access. Cannot use default GITHUB_TOKEN for private repos.
5. **Environment-specific secrets**: Staging/Prod separation requires separate secrets or shared secrets with clear naming.

---

**Generated**: 2025-10-22
**Author**: LEO Protocol EXEC Agent
**SD**: SD-CICD-WORKFLOW-FIX Phase 2
**Part of**: Infrastructure repair and CI/CD restoration
