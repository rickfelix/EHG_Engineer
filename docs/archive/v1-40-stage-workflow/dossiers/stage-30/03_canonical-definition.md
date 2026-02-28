---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 30: Canonical Definition

## Full YAML Specification

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1333-1378

```yaml
  - id: 30
    title: Production Deployment
    description: Deploy to production with zero-downtime and rollback capabilities.
    depends_on:
      - 29
    inputs:
      - Release candidate
      - Deployment plan
      - Rollback strategy
    outputs:
      - Production deployment
      - Monitoring setup
      - Documentation
    metrics:
      - Deployment success rate
      - Downtime
      - Rollback time
    gates:
      entry:
        - Release approved
        - Chairman approval received
      exit:
        - Deployment successful
        - Monitoring active
        - Rollback tested
    substages:
      - id: '30.1'
        title: Pre-Deployment Validation
        done_when:
          - Health checks passed
          - Dependencies verified
          - Backups created
      - id: '30.2'
        title: Blue-Green Deployment
        done_when:
          - Green environment ready
          - Traffic switched
          - Validation complete
      - id: '30.3'
        title: Post-Deployment Verification
        done_when:
          - Smoke tests passed
          - Monitoring confirmed
          - Rollback tested
    notes:
      progression_mode: Manual → Assisted → Auto (suggested)
```

---

## Field Analysis

### Core Identifiers
- **id**: 30
- **title**: Production Deployment
- **description**: Deploy to production with zero-downtime and rollback capabilities.

### Dependencies
- **depends_on**: [29]
- **Evidence**: Line 1337 "depends_on: - 29"
- **Interpretation**: Stage 29 (Final Polish) must complete before Stage 30 begins

### Inputs (3)
1. **Release candidate** — Vetted production-ready build
2. **Deployment plan** — Blue-green deployment orchestration steps
3. **Rollback strategy** — Automated rollback triggers and procedures

**Evidence**: Lines 1338-1341 "inputs: Release candidate, Deployment plan, Rollback strategy"

### Outputs (3)
1. **Production deployment** — Live production environment
2. **Monitoring setup** — Active observability stack
3. **Documentation** — Deployment runbook and rollback procedures

**Evidence**: Lines 1342-1345 "outputs: Production deployment, Monitoring setup, Documentation"

### Metrics (3)
1. **Deployment success rate** — Percentage of successful deployments (target: ≥99%)
2. **Downtime** — Minutes of service unavailability (target: 0 minutes)
3. **Rollback time** — Minutes to execute rollback (target: <5 minutes)

**Evidence**: Lines 1346-1349 "metrics: Deployment success rate, Downtime, Rollback time"

**Gap Identified**: No threshold values defined in YAML (critique line 38 "Missing: Threshold values, measurement frequency")

### Entry Gates (2)
1. **Release approved** — Final QA and stakeholder sign-off
2. **Chairman approval received** ⚠️ — Executive authorization for production deployment

**Evidence**: Lines 1350-1353 "gates.entry: Release approved, Chairman approval received"

**Unique Characteristic**: Chairman approval gate is RARE in workflow (only Stages 30, 31, 40 require Chairman gates)

### Exit Gates (3)
1. **Deployment successful** — Zero-downtime deployment completed
2. **Monitoring active** — Observability stack operational
3. **Rollback tested** — Rollback procedure validated

**Evidence**: Lines 1354-1357 "gates.exit: Deployment successful, Monitoring active, Rollback tested"

---

## Substages Breakdown

### Substage 30.1: Pre-Deployment Validation
**Done When**:
- Health checks passed — Pre-flight validation of production environment
- Dependencies verified — External service availability confirmed
- Backups created — Rollback safety net established

**Evidence**: Lines 1359-1364 "id: 30.1, done_when: Health checks passed, Dependencies verified, Backups created"

**Estimated Duration**: 15-30 minutes (manual process)

### Substage 30.2: Blue-Green Deployment
**Done When**:
- Green environment ready — New production environment provisioned
- Traffic switched — Load balancer cutover completed
- Validation complete — Post-cutover smoke tests passed

**Evidence**: Lines 1365-1370 "id: 30.2, done_when: Green environment ready, Traffic switched, Validation complete"

**Estimated Duration**: 30-60 minutes (manual process)

**Note**: Blue-green deployment pattern not currently implemented (requires SD-DEPLOYMENT-AUTOMATION-001)

### Substage 30.3: Post-Deployment Verification
**Done When**:
- Smoke tests passed — Critical path E2E tests validated
- Monitoring confirmed — Metrics flowing to observability stack
- Rollback tested — Rollback procedure executed in dry-run mode

**Evidence**: Lines 1371-1376 "id: 30.3, done_when: Smoke tests passed, Monitoring confirmed, Rollback tested"

**Estimated Duration**: 15-30 minutes (manual process)

---

## Progression Mode

**Notes**: "Manual → Assisted → Auto (suggested)"
**Evidence**: Line 1378 "progression_mode: Manual → Assisted → Auto (suggested)"

**Interpretation**:
- **Current State**: Manual deployment process (no automation)
- **Next State**: Assisted deployment (partial automation with human oversight)
- **Target State**: Automated deployment (CI/CD triggered, zero-touch)

**Gap**: No automation currently implemented (see `10_gaps-backlog.md` for SD-DEPLOYMENT-AUTOMATION-001 proposal)

---

## Comparison to Other Stages

### Risk Exposure (Unique)
Stage 30 has the HIGHEST Risk Exposure score (4/5) across all 40 stages:
- Most stages: 1-2/5 Risk Exposure
- Stage 30: 4/5 Risk Exposure
- **Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-30.md:10 "Risk Exposure | 4 | Critical decision point"

### Chairman Gate (Rare)
Only 3 stages require Chairman approval gates:
- Stage 30: Production Deployment (entry gate)
- Stage 31: MVP Launch (entry gate)
- Stage 40: Scale Operations (entry gate)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1353,1407,1851 "Chairman approval received"

### Substage Complexity (Moderate)
- Stage 30: 3 substages (30.1, 30.2, 30.3)
- Average across stages: 2-3 substages
- Highest: Stage 10 (5 substages), Stage 20 (4 substages)

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| YAML definition | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1333-1378 | Canonical stage specification |
| Critique assessment | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-30.md | 1-72 | Rubric scores and gaps |
| Stage 31 comparison | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1379-1424 | Chairman gate comparison |
| Stage 40 comparison | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1805-1859 | Chairman gate comparison |

---

**Next**: See `04_current-assessment.md` for critique rubric analysis.

<!-- Generated by Claude Code Phase 11 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
