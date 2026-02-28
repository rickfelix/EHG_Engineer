---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---

## Table of Contents

- [Metadata](#metadata)
- [Recursion Thresholds (Tunable)](#recursion-thresholds-tunable)
  - [TECH-001 Trigger Thresholds](#tech-001-trigger-thresholds)
- [Technical Metrics Calculation (Configurable Weights)](#technical-metrics-calculation-configurable-weights)
  - [Technical Debt Score Components](#technical-debt-score-components)
  - [Security Score Components](#security-score-components)
  - [Scalability Rating Thresholds](#scalability-rating-thresholds)
  - [Solution Feasibility Score Factors](#solution-feasibility-score-factors)
- [Loop Prevention Parameters](#loop-prevention-parameters)
- [Chairman Override Rules](#chairman-override-rules)
- [Performance Tuning Parameters](#performance-tuning-parameters)
- [Substage Execution Mode](#substage-execution-mode)
- [Automation Level Configuration](#automation-level-configuration)
- [Venture-Type Specific Configurations](#venture-type-specific-configurations)
  - [Strategic Ventures](#strategic-ventures)
  - [Experimental Ventures](#experimental-ventures)
  - [Enterprise Ventures](#enterprise-ventures)
  - [Fast-Track Ventures](#fast-track-ventures)
- [Configuration Storage](#configuration-storage)
- [Configuration Inheritance](#configuration-inheritance)
- [Change Management](#change-management)

<!-- ARCHIVED: 2026-01-26T16:26:50.217Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-10\08_configurability-matrix.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 10: Configurability Matrix


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, unit

**Purpose**: Document tunable parameters for Stage 10 technical review process
**Owner**: EXEC
**Configuration Layer**: Venture-level, Organization-level

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:115-125 "Recursion Thresholds"

---

## Recursion Thresholds (Tunable)

### TECH-001 Trigger Thresholds

| Parameter | Default Value | Range | Impact | Venture Type Adjustments |
|-----------|---------------|-------|--------|-------------------------|
| **blocking_issues_threshold** | ≥ 1 | 0-5 | Trigger recursion to Stage 8 | Strategic: 2-3 (more tolerant), Enterprise: 0-1 (stricter) |
| **technical_debt_threshold** | > 70/100 | 40-90 | Advisory for re-decomposition | Experimental: 80 (relaxed), Production: 60 (stricter) |
| **timeline_impact_threshold** | > 30% | 10-50% | Trigger recursion to Stage 7 | Fast-track: 15% (aggressive), Normal: 30%, Conservative: 50% |
| **cost_impact_threshold** | > 25% | 10-40% | Trigger recursion to Stage 5 | High-ROI: 40% (tolerant), Low-margin: 15% (strict) |
| **feasibility_threshold** | < 0.5 | 0.3-0.7 | CRITICAL recursion to Stage 3 | Experimental: 0.3 (allow risky), Enterprise: 0.6 (stricter) |
| **security_score_threshold** | < 60/100 | 50-80 | Trigger recursion to Stage 8 | Public-facing: 70 (strict), Internal: 50 (relaxed) |
| **scalability_rating_threshold** | < 3 stars | 2-4 | Advisory for architecture review | High-growth: 4 stars (strict), Niche: 2 stars (relaxed) |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:115-125 "Recursion Thresholds table"

---

## Technical Metrics Calculation (Configurable Weights)

### Technical Debt Score Components

| Component | Default Weight | Range | Description | Adjustable By |
|-----------|----------------|-------|-------------|---------------|
| **code_complexity** | 20% | 10-30% | Cyclomatic complexity, nesting depth | CTO, Engineering Manager |
| **deprecated_dependencies** | 30% | 20-40% | Unsupported libraries, EOL technologies | CTO, Security Team |
| **missing_tests** | 20% | 10-30% | Test coverage gaps | QA Director |
| **documentation_gaps** | 10% | 5-20% | Missing docs, outdated READMEs | Technical Writer |
| **security_vulnerabilities** | 20% | 15-30% | Known CVEs, security warnings | Security Team |

**Total Weight**: Must sum to 100%

**Calculation Formula**:
```
Technical Debt Score = (code_complexity × W1) + (deprecated_dependencies × W2) +
                       (missing_tests × W3) + (documentation_gaps × W4) +
                       (security_vulnerabilities × W5)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:424 "Technical debt score"

---

### Security Score Components

| Component | Default Weight | Range | Description | Adjustable By |
|-----------|----------------|-------|-------------|---------------|
| **authentication_authorization** | 25% | 20-30% | Auth strength, RBAC, API security | Security Team |
| **data_protection** | 25% | 20-30% | Encryption, PII handling | Security Team, Compliance |
| **vulnerability_management** | 20% | 15-25% | Scanning, patching, CVE tracking | Security Team |
| **compliance_controls** | 15% | 10-25% | GDPR, HIPAA, SOC 2 controls | Compliance Team |
| **security_monitoring** | 15% | 10-20% | Logging, incident response | Security Team, DevOps |

**Total Weight**: Must sum to 100%

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:426 "Security score"

---

### Scalability Rating Thresholds

| Rating | Default Load Multiplier | Cost Increase Threshold | Configurable? |
|--------|------------------------|------------------------|---------------|
| **5 stars** | 100x expected load | <10% cost increase | Yes (50x-100x, 5-15%) |
| **4 stars** | 50x expected load | <20% cost increase | Yes (25x-75x, 10-25%) |
| **3 stars** | 10x expected load | <30% cost increase | Yes (5x-20x, 20-40%) |
| **2 stars** | 5x expected load | Significant cost increase | Yes (3x-10x, >30%) |
| **1 star** | 2x expected load | Infeasible | Fixed (cannot relax) |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:425 "Scalability rating"

---

### Solution Feasibility Score Factors

| Factor | Default Weight | Range | Description | Adjustable By |
|--------|----------------|-------|-------------|---------------|
| **technical_capability** | 40% | 30-50% | Team skills, expertise | CTO, Engineering Manager |
| **resource_availability** | 20% | 15-30% | Time, budget, infrastructure | CFO, Engineering Manager |
| **technology_maturity** | 20% | 10-30% | Stack maturity, stability | CTO, Architect |
| **risk_factors** | 20% | 10-30% | Inverse of risk (lower risk = higher score) | Risk Manager |

**Total Weight**: Must sum to 100%

**Evidence**: (Based on critique feasibility calculation logic)

---

## Loop Prevention Parameters

| Parameter | Default Value | Range | Impact | Adjustable By |
|-----------|---------------|-------|--------|---------------|
| **max_recursions_per_venture** | 3 | 2-5 | Max TECH-001 triggers from Stage 10 | Chairman, CTO |
| **escalation_action** | CHAIRMAN_DECISION | CHAIRMAN_DECISION, AUTO_KILL, AUTO_SIMPLIFY | What happens after max recursions | Chairman only |
| **recursion_cooldown_period** | 24 hours | 0-72 hours | Min time between recursions | Engineering Manager |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:133-141 "Loop Prevention"

---

## Chairman Override Rules

| Override Type | Default Enabled | Requires Justification | Audit Log Level |
|---------------|-----------------|------------------------|-----------------|
| **Skip recursion (proceed with debt)** | Yes | Yes | HIGH |
| **Modify severity thresholds** | Yes | Yes | MEDIUM |
| **Approve with known limitations** | Yes | Yes | HIGH |
| **Force recursion (below threshold)** | Yes | No | MEDIUM |
| **Cancel CRITICAL auto-recursion** | Yes | Yes | CRITICAL |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:159-162 "Override capability"

---

## Performance Tuning Parameters

| Parameter | Default Value | Range | Impact | Tunable By |
|-----------|---------------|-------|--------|-----------|
| **review_analysis_timeout** | 5 seconds | 3-10s | Max time for technical review | DevOps |
| **recursion_detection_timeout** | 100ms | 50-200ms | Max time for recursion checks | DevOps |
| **impact_calculation_timeout** | 1 second | 500ms-2s | Max time for timeline/cost delta | DevOps |
| **parallel_substage_execution** | false | true/false | Run substages in parallel (experimental) | Engineering Manager |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:163-167 "Performance Requirements"

---

## Substage Execution Mode

| Substage | Default Mode | Options | Impact |
|----------|--------------|---------|--------|
| **10.1 Architecture Review** | Sequential | Sequential, Parallel (experimental) | Parallel may miss cross-cutting issues |
| **10.2 Scalability Assessment** | Sequential | Sequential, Parallel (experimental) | Can run parallel with Security (10.3) |
| **10.3 Security Review** | Sequential | Sequential, Parallel (experimental) | Can run parallel with Scalability (10.2) |
| **10.4 Implementation Planning** | Sequential | Sequential only | Must wait for 10.1-10.3 outputs |

**Default Workflow**: 10.1 → 10.2 → 10.3 → 10.4 → Recursion Decision (sequential)
**Experimental Workflow**: 10.1 → (10.2 + 10.3 in parallel) → 10.4 → Recursion Decision

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:435-458 "substages definition"

---

## Automation Level Configuration

| Stage Maturity | Automation Level | Manual Steps | AI-Assisted Steps | Auto Steps |
|----------------|------------------|--------------|-------------------|------------|
| **Manual** (current) | 20% | All substages | None | Metric calculations only |
| **Assisted** (target) | 60% | Chairman approvals | Architecture/security/scalability review | Metrics, recursion detection |
| **Auto** (future) | 95% | Chairman overrides only | None | All substages + recursion |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:460 "progression_mode: Manual → Assisted → Auto"

---

## Venture-Type Specific Configurations

### Strategic Ventures

**Overrides**:
- `technical_debt_threshold`: 80 (relaxed from 70)
- `blocking_issues_threshold`: 2-3 (more tolerant)
- `feasibility_threshold`: 0.4 (relaxed from 0.5)
- `max_recursions_per_venture`: 5 (extended from 3)

**Rationale**: Strategic importance justifies higher technical risk

---

### Experimental Ventures

**Overrides**:
- `technical_debt_threshold`: 85 (very relaxed)
- `feasibility_threshold`: 0.3 (accept high-risk)
- `timeline_impact_threshold`: 50% (flexible timeline)
- `cost_impact_threshold`: 40% (flexible budget)

**Rationale**: Learning opportunity, accept technical debt as training cost

---

### Enterprise Ventures

**Overrides**:
- `blocking_issues_threshold`: 0 (no blockers allowed)
- `security_score_threshold`: 70 (stricter from 60)
- `technical_debt_threshold`: 60 (stricter from 70)
- `scalability_rating_threshold`: 4 stars (stricter from 3)

**Rationale**: Enterprise clients require high quality, low risk

---

### Fast-Track Ventures

**Overrides**:
- `timeline_impact_threshold`: 15% (aggressive, from 30%)
- `review_analysis_timeout`: 3 seconds (faster, from 5s)
- `parallel_substage_execution`: true (experimental mode)

**Rationale**: Speed to market is critical, accept some review shortcuts

---

## Configuration Storage

**Database Table**: `stage_configurations`

```sql
CREATE TABLE stage_configurations (
  id UUID PRIMARY KEY,
  stage_id INTEGER NOT NULL,
  venture_type VARCHAR(50),  -- NULL = organization-level default
  parameter_name VARCHAR(100) NOT NULL,
  parameter_value JSONB NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  active BOOLEAN DEFAULT TRUE,
  UNIQUE(stage_id, venture_type, parameter_name)
);

-- Example rows
INSERT INTO stage_configurations (stage_id, venture_type, parameter_name, parameter_value, created_by)
VALUES
  (10, NULL, 'technical_debt_threshold', '70', 'admin_user_id'),  -- Organization default
  (10, 'STRATEGIC', 'technical_debt_threshold', '80', 'cto_user_id'),  -- Strategic override
  (10, 'ENTERPRISE', 'security_score_threshold', '70', 'security_lead_id');  -- Enterprise override
```

---

## Configuration Inheritance

**Precedence Order** (highest to lowest):

1. **Venture-specific override** (set for individual venture)
2. **Venture-type override** (set for STRATEGIC, EXPERIMENTAL, ENTERPRISE, etc.)
3. **Organization-level default** (applies to all ventures)
4. **System default** (hardcoded fallback)

**Example**:
```typescript
function getThreshold(ventureId: string, parameter: string): number {
  // 1. Check venture-specific
  const ventureOverride = db.stage_configurations.findOne({
    stage_id: 10,
    venture_id: ventureId,
    parameter_name: parameter,
    active: true
  });
  if (ventureOverride) return ventureOverride.parameter_value;

  // 2. Check venture-type
  const venture = db.ventures.findOne({ id: ventureId });
  const typeOverride = db.stage_configurations.findOne({
    stage_id: 10,
    venture_type: venture.type,
    parameter_name: parameter,
    active: true
  });
  if (typeOverride) return typeOverride.parameter_value;

  // 3. Check organization default
  const orgDefault = db.stage_configurations.findOne({
    stage_id: 10,
    venture_type: NULL,
    parameter_name: parameter,
    active: true
  });
  if (orgDefault) return orgDefault.parameter_value;

  // 4. System default
  return SYSTEM_DEFAULTS[parameter];
}
```

---

## Change Management

**Configuration Change Workflow**:

1. **Proposal**: User proposes configuration change with rationale
2. **Review**: CTO/Chairman reviews impact assessment
3. **Testing**: Change tested on non-production venture
4. **Approval**: Chairman approves configuration change
5. **Rollout**: Change applied to specified ventures/types
6. **Monitoring**: Track impact on recursion rates, approval times

**Audit Log**: All configuration changes logged with before/after values, approver, timestamp

---

<!-- Generated by Claude Code Phase 5 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
