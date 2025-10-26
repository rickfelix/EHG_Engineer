# Known CI/CD Issues & Status

**Last Updated**: 2025-10-26
**Maintainer**: Engineering Team

---

## 🔴 TEMPORARILY DISABLED WORKFLOWS

### 1. UAT Testing Pipeline (`uat-testing.yml`)

**Status**: ⏸️ DISABLED (if: false)
**Reason**: Missing EHG application repository checkout
**Blocking Issue**: Commented-out checkout step for `rickfelix/ehg` repo (line 27-32)

**To Re-enable**:
1. Add `GH_PAT` secret with access to rickfelix/ehg repository
2. Uncomment lines 27-32 in `.github/workflows/uat-testing.yml`
3. Remove `if: false` condition (line 17)
4. Verify `scripts/calculate-pass-rate.js` exists or stub it out

**Alternative**: Consider running UAT tests locally until repository access is configured.

---

### 2. VH Ideation Staging (`vh-ideation-staging-readonly.yml`)

**Status**: ⏸️ DISABLED (if: false)
**Reason**: Missing `ENABLE_VH_CHECKS` repository variable
**Original Condition**: `if: ${{ vars.ENABLE_VH_CHECKS == '1' }}`

**To Re-enable**:
1. Set repository variable: `ENABLE_VH_CHECKS=1`
2. Remove `if: false` condition (line 22)
3. Restore original condition (line 23)

**Alternative**: Remove condition entirely if this workflow should always run.

---

## 🟡 WORKFLOWS WITH FIXES PENDING

### 3. LEO Protocol Drift Check (`leo-drift-check.yml`)

**Status**: ⚠️ MAY FAIL - database connection issues
**Issues**:
- Uses outdated actions (@v3 instead of @v4)
- Missing `DATABASE_URL` secret for sub-jobs: gate-weight-check, rls-permission-check
- Complex multi-job dependencies

**Action Required**:
1. Add `DATABASE_URL` secret (Supabase PostgreSQL connection string)
2. Upgrade to @v4 actions (Phase 2)
3. Consider splitting into separate workflows

---

### 4. E2E Stories (`e2e-stories.yml`)

**Status**: ⚠️ CONFIGURATION INCOMPLETE
**Issues**:
- Missing `staging` environment configuration
- Missing environment variables: BASE_URL, SUPABASE_URL
- Missing secrets: SERVICE_TOKEN_STAGING, STORY_VERIFY_API

**Action Required**:
1. Create `staging` environment in GitHub repository settings
2. Add environment variables:
   - `BASE_URL` (e.g., https://staging.example.com)
   - `SUPABASE_URL` (Supabase project URL)
3. Add secrets:
   - `SERVICE_TOKEN_STAGING`
   - `STORY_VERIFY_API`

---

### 5. RLS Policy Verification (`rls-verification.yml`)

**Status**: ✅ FIXED (awaiting validation)
**Fix Applied**: Added `DATABASE_URL` secret fallback in workflow
**Validation**: Next push to main will test

---

## 🟢 WORKING WORKFLOWS (No Issues)

- Test Coverage Enforcement
- Security Review
- Story Verification CI
- PRD Schema Validation
- (... and 30+ others)

---

## 📋 REQUIRED SECRETS & VARIABLES

### Secrets (Add via GitHub Settings → Secrets and Variables → Actions)

| Secret Name | Purpose | Status | Priority |
|-------------|---------|--------|----------|
| `DATABASE_URL` | Supabase PostgreSQL connection | ❌ MISSING | CRITICAL |
| `GH_PAT` | Access to rickfelix/ehg repo | ❌ MISSING | HIGH (for UAT) |
| `SERVICE_TOKEN_STAGING` | E2E story verification | ❌ MISSING | MEDIUM |
| `STORY_VERIFY_API` | E2E story API endpoint | ❌ MISSING | MEDIUM |

### Variables (Add via GitHub Settings → Secrets and Variables → Actions → Variables)

| Variable Name | Purpose | Status | Priority |
|---------------|---------|--------|----------|
| `ENABLE_VH_CHECKS` | Enable VH ideation workflow | ❌ MISSING | MEDIUM |

### Environment: `staging`

| Variable Name | Purpose | Status |
|---------------|---------|--------|
| `BASE_URL` | Staging app URL | ❌ MISSING |
| `SUPABASE_URL` | Staging Supabase URL | ❌ MISSING |

---

## 🔧 UPCOMING FIXES (Phase 2+)

### Outdated GitHub Actions (9 workflows)

Workflows using deprecated @v3 actions:
1. `uat-testing.yml` - checkout@v3, setup-node@v3
2. `leo-drift-check.yml` - checkout@v3, setup-node@v3, github-script@v6
3. `prd-audit-scheduled.yml` - checkout@v3, setup-node@v3, upload-artifact@v3, github-script@v6
4. `schema-compatibility-check.yml` - checkout@v3, setup-node@v3
5. (... 5 more workflows)

**Action Required**: Batch upgrade to @v4 (Phase 2)

---

## 📊 CI/CD Health Metrics

**Total Workflows**: 46
**Active**: 44 (2 temporarily disabled)
**Failing**: ~7 (being fixed)
**Passing**: ~37

**Target**: <5% failure rate on main branch pushes

---

## 🆘 Emergency Contacts

- CI/CD Issues: Escalate to Engineering Lead
- GitHub Secrets: Request from DevOps team
- Workflow Failures: Check this document first, then create issue with label `ci-cd`

---

## 📝 Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-10-26 | Initial documentation, disabled UAT and VH Ideation workflows | CI/CD Remediation |
| 2025-10-26 | Fixed RLS verification database connection | CI/CD Remediation |

---

**Note**: This document is maintained as part of ongoing CI/CD health monitoring. Update when workflow status changes.
