# Stage 30: Professional Standard Operating Procedure

## Overview

This SOP documents the production deployment process for Stage 30, including blue-green deployment orchestration, zero-downtime guarantees, and automated rollback procedures.

**Status**: ⚠️ TEMPLATE (no current implementation)
**Automation Level**: Manual → Assisted → Auto (target)
**Estimated Duration**: 60-120 minutes (manual process)

**Prerequisites**:
- Stage 29 (Final Polish) complete
- Release candidate approved
- Chairman approval received
- Security baseline (SD-SECURITY-AUTOMATION-001) implemented

---

## Section 1: Pre-Deployment Validation (Substage 30.1)

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1359-1364 "Pre-Deployment Validation"

**Objective**: Validate production environment readiness and create rollback safety net.

**Duration**: 15-30 minutes

### Step 1.1: Health Check Validation
**Done When**: Health checks passed

**Procedure**:
1. Execute pre-deployment health checks against production environment:
   ```bash
   # Database connectivity
   npm run health:database

   # API endpoints
   npm run health:api

   # External dependencies (Supabase, Stripe, etc.)
   npm run health:external
   ```

2. Verify all health checks return HTTP 200 status
3. Document health check results in deployment log

**Exit Criteria**:
- All health checks pass (100% success rate)
- No critical errors in logs

**Rollback Trigger**: If health checks fail → ABORT deployment, investigate failures

### Step 1.2: Dependency Verification
**Done When**: Dependencies verified

**Procedure**:
1. Verify external service availability:
   - Supabase API: Check status page
   - Stripe API: Execute test transaction
   - Email service: Send test email

2. Verify internal dependencies:
   - Database migrations applied
   - Environment variables configured
   - Secrets vault accessible

3. Document dependency status in deployment log

**Exit Criteria**:
- All external services operational
- All internal dependencies ready

**Rollback Trigger**: If critical dependencies unavailable → ABORT deployment, schedule maintenance window

### Step 1.3: Backup Creation
**Done When**: Backups created

**Procedure**:
1. Create database backup:
   ```bash
   # Supabase backup via pg_dump
   npm run backup:database --timestamp=$(date +%Y%m%d_%H%M%S)
   ```

2. Create file system backup (if applicable):
   ```bash
   # Backup uploaded files, logs, configs
   npm run backup:files --timestamp=$(date +%Y%m%d_%H%M%S)
   ```

3. Verify backup integrity:
   ```bash
   npm run backup:verify --latest
   ```

4. Document backup location and checksum

**Exit Criteria**:
- Database backup created and verified
- File system backup created (if applicable)
- Backup restoration tested in staging environment

**Rollback Trigger**: If backup verification fails → ABORT deployment, fix backup system

---

## Section 2: Blue-Green Deployment (Substage 30.2)

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1365-1370 "Blue-Green Deployment"

**Objective**: Deploy new version to green environment and switch traffic with zero downtime.

**Duration**: 30-60 minutes

**Note**: Blue-green deployment pattern not currently implemented. This SOP assumes future implementation via SD-DEPLOYMENT-AUTOMATION-001.

### Step 2.1: Green Environment Provisioning
**Done When**: Green environment ready

**Procedure**:
1. Provision green environment (parallel to blue/production):
   ```bash
   # Kubernetes deployment (example)
   kubectl apply -f k8s/deployment-green.yaml

   # Or Docker Compose (example)
   docker-compose -f docker-compose.green.yml up -d
   ```

2. Deploy release candidate to green environment:
   ```bash
   npm run deploy:green --version=${RELEASE_VERSION}
   ```

3. Run database migrations on green environment (if schema changes):
   ```bash
   npm run migrate:green
   ```

4. Verify green environment health:
   ```bash
   npm run health:green
   ```

**Exit Criteria**:
- Green environment provisioned and healthy
- Release candidate deployed successfully
- Database migrations applied (if applicable)

**Rollback Trigger**: If green environment fails health checks → ABORT deployment, destroy green environment

### Step 2.2: Traffic Switching
**Done When**: Traffic switched

**Procedure**:
1. Gradual traffic cutover (canary deployment pattern):
   ```bash
   # Route 10% traffic to green
   npm run traffic:canary --green=10

   # Monitor for 5 minutes, check error rates

   # Route 50% traffic to green
   npm run traffic:canary --green=50

   # Monitor for 5 minutes

   # Route 100% traffic to green
   npm run traffic:canary --green=100
   ```

2. Monitor key metrics during cutover:
   - HTTP error rates (target: <1%)
   - Response times (target: <500ms p95)
   - Database connection pool utilization
   - CPU/memory usage

3. Document cutover timeline and metrics

**Exit Criteria**:
- 100% traffic routed to green environment
- Error rates within acceptable thresholds (<1%)
- Response times within SLA (<500ms p95)

**Rollback Trigger**: If error rates spike >5% → EXECUTE ROLLBACK (see Section 3)

### Step 2.3: Validation Complete
**Done When**: Validation complete

**Procedure**:
1. Execute smoke tests against green environment:
   ```bash
   npm run test:smoke:production --env=green
   ```

2. Verify critical user flows:
   - User authentication
   - Venture creation
   - Dashboard rendering
   - Database queries

3. Check monitoring dashboards:
   - Application metrics (error rates, latency)
   - Infrastructure metrics (CPU, memory, disk)
   - Business metrics (active users, transactions)

**Exit Criteria**:
- All smoke tests pass (100% success rate)
- Critical user flows validated
- Monitoring dashboards show green status

**Rollback Trigger**: If smoke tests fail → EXECUTE ROLLBACK (see Section 3)

---

## Section 3: Rollback Procedures

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-30.md:47-50 "Add Rollback Procedures"

**Objective**: Restore previous production version if deployment fails.

**Duration**: <5 minutes (automated rollback target)

### Rollback Decision Tree

```
Deployment Failure Detected
  ↓
Is traffic switched to green?
  ├─ NO → Destroy green environment, ABORT deployment
  └─ YES → Execute automated rollback
      ↓
      Rollback Type?
      ├─ Traffic Rollback (fastest) → Route 100% traffic to blue
      ├─ Database Rollback (if migrations) → Restore database backup + traffic rollback
      └─ Full Rollback (nuclear option) → Database + traffic + destroy green
```

### Rollback Type 1: Traffic Rollback (Fastest)
**Use When**: No database schema changes, green environment unhealthy

**Procedure**:
1. Route 100% traffic back to blue environment:
   ```bash
   npm run traffic:rollback --blue=100
   ```

2. Verify blue environment health:
   ```bash
   npm run health:blue
   ```

3. Monitor error rates for 5 minutes
4. Document rollback reason and timeline

**Duration**: <1 minute
**Downtime**: 0 minutes (traffic switch only)

### Rollback Type 2: Database Rollback
**Use When**: Database migrations applied to green, need to revert schema

**Procedure**:
1. Route 100% traffic back to blue environment:
   ```bash
   npm run traffic:rollback --blue=100
   ```

2. Restore database backup:
   ```bash
   npm run backup:restore --timestamp=${BACKUP_TIMESTAMP}
   ```

3. Verify database integrity:
   ```bash
   npm run health:database
   ```

4. Document rollback reason and data loss (if any)

**Duration**: <5 minutes
**Downtime**: 0-2 minutes (during database restore)

**Warning**: Data created between deployment and rollback may be lost. Communicate to users if applicable.

### Rollback Type 3: Full Rollback (Nuclear Option)
**Use When**: Complete deployment failure, green environment unrecoverable

**Procedure**:
1. Route 100% traffic back to blue environment
2. Restore database backup (if migrations applied)
3. Destroy green environment:
   ```bash
   npm run deploy:destroy-green
   ```
4. Investigate root cause before next deployment attempt

**Duration**: <5 minutes
**Downtime**: 0-2 minutes

---

## Section 4: Post-Deployment Verification (Substage 30.3)

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1371-1376 "Post-Deployment Verification"

**Objective**: Confirm deployment success and validate rollback capability.

**Duration**: 15-30 minutes

### Step 4.1: Smoke Tests
**Done When**: Smoke tests passed

**Procedure**:
1. Execute comprehensive smoke test suite:
   ```bash
   npm run test:smoke:production --env=green --full
   ```

2. Verify test results:
   - Authentication flows
   - CRUD operations
   - API endpoints
   - Database queries
   - External integrations

3. Document test results in deployment log

**Exit Criteria**:
- All smoke tests pass (100% success rate)
- No critical errors in logs

**Rollback Trigger**: If smoke tests fail → EXECUTE ROLLBACK (see Section 3)

### Step 4.2: Monitoring Confirmation
**Done When**: Monitoring confirmed

**Procedure**:
1. Verify monitoring stack operational:
   - Application metrics dashboard
   - Infrastructure metrics dashboard
   - Error tracking (Sentry/similar)
   - Log aggregation (CloudWatch/similar)

2. Configure alerts for production environment:
   - Error rate threshold: >1%
   - Response time threshold: >500ms p95
   - Database connection pool saturation: >80%
   - CPU usage: >70%

3. Verify alerts triggered correctly (test alert)

**Exit Criteria**:
- All monitoring dashboards operational
- Alerts configured and tested

**Rollback Trigger**: If monitoring unavailable → Investigate, but deployment can proceed (non-blocking)

### Step 4.3: Rollback Testing
**Done When**: Rollback tested

**Procedure**:
1. Execute dry-run rollback test:
   ```bash
   npm run rollback:test --dry-run
   ```

2. Verify rollback procedure documentation up-to-date
3. Confirm backup restoration tested in staging
4. Document rollback test results

**Exit Criteria**:
- Rollback dry-run successful
- Rollback documentation verified
- Team trained on rollback procedures

**Note**: Do NOT execute actual rollback unless deployment fails. This step validates rollback capability only.

---

## Section 5: Exit Gate Validation

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1354-1357 "exit gates"

**Procedure**:
1. Verify all exit gates satisfied:
   - [ ] Deployment successful (all substages complete)
   - [ ] Monitoring active (dashboards operational)
   - [ ] Rollback tested (dry-run successful)

2. Update venture workflow stage:
   ```sql
   UPDATE ventures
   SET current_workflow_stage = 31,
       updated_at = NOW()
   WHERE id = '45a8fd77-96f7-4f83-9e28-385d3ef4c431';
   ```

3. Create handoff document for Stage 31 (MVP Launch)

**Exit Criteria**:
- All exit gates validated
- Venture stage updated to 31
- Handoff document created

---

## Section 6: Data Flow

**Input Artifacts**:
- Release candidate (Docker image/build artifact)
- Deployment plan (this SOP)
- Rollback strategy (Section 3)

**Output Artifacts**:
- Production deployment (green environment URL)
- Monitoring setup (dashboard URLs, alert configs)
- Documentation (deployment log, rollback test results)

**Data Transformations**:
- Release candidate → Production environment (blue-green deployment)
- Database schema (if migrations) → Production database
- Environment variables → Production config

---

## Automation Roadmap

**Current State**: 100% manual (no automation)

**Target State**: 80% automation via SD-DEPLOYMENT-AUTOMATION-001

**Automation Phases**:

### Phase 1: Assisted (50% automation)
- Automated health checks (Step 1.1)
- Automated backup creation (Step 1.3)
- Automated smoke tests (Step 4.1)

### Phase 2: Auto (80% automation)
- Automated blue-green deployment (Section 2)
- Automated traffic switching with canary pattern (Step 2.2)
- Automated rollback on error rate threshold breach (Section 3)

### Phase 3: Full Auto (95% automation)
- CI/CD triggered deployment on merge to `main`
- Automated Chairman approval workflow (Slack notification → approval → deploy)
- Automated post-deployment verification and handoff creation

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1378 "progression_mode: Manual → Assisted → Auto"

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| Substages | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1358-1376 | SOP structure |
| Exit gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1354-1357 | Exit criteria |
| Rollback recommendation | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-30.md | 47-50 | Rollback procedures |
| Progression mode | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1378 | Automation roadmap |

---

**Next**: See `06_agent-orchestration.md` for proposed agent crew structure.

<!-- Generated by Claude Code Phase 11 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
