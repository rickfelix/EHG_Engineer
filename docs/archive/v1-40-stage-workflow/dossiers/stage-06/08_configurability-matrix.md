# Stage 6: Configurability Matrix

**Purpose**: Document tunable parameters, thresholds, and configuration options for Stage 6 (Risk Evaluation).

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:228-273 "id: 6, Risk Evaluation"

---

## Primary Configuration Parameters

### 1. Hidden Cost Recursion Threshold

**Parameter**: `HIDDEN_COST_THRESHOLD_PCT`
**Type**: Number (percentage)
**Default**: `10` (10% of OpEx)
**Range**: 5-25%

**Purpose**: Define when risk mitigation costs trigger FIN-001 recursion to Stage 5.

**Impact**:
- **Lower threshold** (5%): More sensitive; triggers recursion more frequently (may over-recurse)
- **Higher threshold** (25%): Less sensitive; fewer recursions (may miss significant cost increases)

**Recommended by Industry**:
- **SaaS**: 10% (standard)
- **Hardware**: 15% (higher tolerance for compliance/manufacturing costs)
- **Healthcare**: 5% (lower tolerance due to strict regulatory costs)

**Configuration**:
```typescript
const config = {
  recursion: {
    hidden_cost_threshold_pct: 10,  // Trigger FIN-001 if mitigation costs > 10% of OpEx
    critical_threshold_pct: 25      // Auto-execute recursion if > 25% OpEx
  }
};
```

**Evidence**: Proposed threshold based on Stage 5 recursion pattern (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:91)

---

### 2. Risk Severity Thresholds

**Parameter**: `RISK_SEVERITY_THRESHOLDS`
**Type**: Object (probability × impact matrix)
**Default**:

```typescript
{
  critical: { min_probability: 0.67, min_impact: 100000 },  // High prob (67%+) + High impact ($100k+)
  high: { min_probability: 0.34, min_impact: 50000 },       // Medium prob (34%+) + Medium impact ($50k+)
  medium: { min_probability: 0.34, min_impact: 10000 },     // Medium prob + Low impact
  low: { max_probability: 0.33, max_impact: 10000 }         // Low prob (<33%) or Low impact (<$10k)
}
```

**Purpose**: Define risk matrix color coding and prioritization.

**Impact**:
- **Lower thresholds**: More risks flagged as Critical/High (may increase false positives)
- **Higher thresholds**: Fewer risks flagged (may miss important risks)

**Configuration**:
```typescript
const config = {
  risk_scoring: {
    critical: { min_probability_pct: 67, min_impact_usd: 100000 },
    high: { min_probability_pct: 34, min_impact_usd: 50000 },
    // ... medium, low
  }
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:260-265 "Probability assigned, Impact assessed"

---

### 3. Risk Coverage Target

**Parameter**: `RISK_COVERAGE_TARGET_PCT`
**Type**: Number (percentage)
**Default**: `100` (100% coverage)
**Range**: 90-100%

**Purpose**: Define minimum percentage of risks that must have mitigation plans to pass exit gate.

**Impact**:
- **100%**: All risks must have mitigation (strict quality gate)
- **95%**: Allows 5% of risks to remain unmitigated (e.g., low-severity risks)
- **90%**: More lenient (may allow critical risks to be unmitigated)

**Configuration**:
```typescript
const config = {
  metrics: {
    risk_coverage_target_pct: 100,  // 100% of risks must have mitigation plans
    allow_unmitigated_low_risks: false  // If true, low-severity risks can be unmitigated
  }
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:241-244 "Risk coverage"

---

### 4. Mitigation Effectiveness Target

**Parameter**: `MITIGATION_EFFECTIVENESS_TARGET_PCT`
**Type**: Number (percentage)
**Default**: `70` (70% average risk reduction)
**Range**: 50-90%

**Purpose**: Define minimum average effectiveness of mitigation strategies to pass exit gate.

**Impact**:
- **Higher target** (90%): Requires highly effective mitigation (may be unrealistic for some risks)
- **Lower target** (50%): Allows less effective mitigation (may not sufficiently reduce risk)

**Configuration**:
```typescript
const config = {
  metrics: {
    mitigation_effectiveness_target_pct: 70,  // Average mitigation must reduce risk by 70%
    critical_risk_min_effectiveness: 80       // Critical risks require 80%+ effectiveness
  }
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:242 "Mitigation effectiveness"

---

### 5. Maximum Risk Score

**Parameter**: `MAX_ACCEPTABLE_RISK_SCORE`
**Type**: Number (composite score)
**Default**: `50`
**Range**: 30-100

**Purpose**: Define maximum acceptable overall risk score (sum of probability × impact for all risks) to pass exit gate.

**Calculation**:
```typescript
const riskScore = risks.reduce((sum, risk) => {
  return sum + (risk.probability_pct / 100) * risk.impact_usd;
}, 0);
```

**Impact**:
- **Lower threshold** (30): Stricter quality gate (fewer ventures pass)
- **Higher threshold** (100): More lenient (more ventures pass, higher risk tolerance)

**Configuration**:
```typescript
const config = {
  metrics: {
    max_acceptable_risk_score: 50,  // Overall risk score must be < 50
    chairman_override_max: 100      // Chairman can override up to risk score 100
  }
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:244 "Risk score"

---

### 6. Minimum Risk Count by Domain

**Parameter**: `MIN_RISKS_BY_DOMAIN`
**Type**: Object (risk counts)
**Default**:

```typescript
{
  technical: 3,      // Minimum 3 technical risks identified
  market: 3,         // Minimum 3 market risks identified
  operational: 3     // Minimum 3 operational risks identified
}
```

**Purpose**: Ensure comprehensive risk identification across all domains.

**Impact**:
- **Higher minimum** (5+): Forces deeper risk analysis (may identify low-value risks)
- **Lower minimum** (1-2): Faster execution (may miss important risks)

**Configuration**:
```typescript
const config = {
  risk_identification: {
    min_technical_risks: 3,
    min_market_risks: 3,
    min_operational_risks: 3,
    allow_domain_exemptions: true  // If true, Chairman can exempt specific domains (e.g., "No operational risks for SaaS")
  }
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:256-259 "Technical risks listed, Market risks assessed, Operational risks mapped"

---

### 7. Max Recursions from Stage 6

**Parameter**: `MAX_RECURSIONS_FROM_STAGE_6`
**Type**: Number (count)
**Default**: `2`
**Range**: 1-5

**Purpose**: Prevent infinite recursion loops when Stage 6 discovers hidden costs multiple times.

**Impact**:
- **Lower limit** (1): Stricter loop prevention (may force premature decisions)
- **Higher limit** (5): More lenient (allows more iterations to refine financial model)

**Configuration**:
```typescript
const config = {
  recursion: {
    max_recursions_from_stage_6: 2,  // Max 2 FIN-001 triggers from Stage 6 to Stage 5
    escalate_to_chairman_after_max: true  // Require Chairman decision after max recursions
  }
};
```

**Evidence**: Pattern from Stage 5 loop prevention (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:95-101)

---

### 8. Chairman Approval Requirements

**Parameter**: `CHAIRMAN_APPROVAL_RULES`
**Type**: Object (approval scenarios)
**Default**:

```typescript
{
  mitigation_plans: true,           // Always require Chairman approval for mitigation plans
  hidden_costs_high: true,          // Require approval for HIGH severity recursion (10-25% OpEx)
  hidden_costs_critical: false,     // Auto-execute CRITICAL recursion (>25% OpEx), notify post-execution
  risk_score_above_threshold: true, // Require approval if risk score > max_acceptable_risk_score
  unmitigated_critical_risks: true  // Require approval if any Critical risks unmitigated
}
```

**Purpose**: Define when Chairman approval is required vs. auto-execution.

**Configuration**:
```typescript
const config = {
  governance: {
    chairman_approval_required_for: [
      'mitigation_plans',
      'hidden_costs_high',
      'risk_score_above_threshold',
      'unmitigated_critical_risks'
    ],
    auto_execute: ['hidden_costs_critical']  // CRITICAL severity auto-executes
  }
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:250 "Mitigation plans approved"

---

## Industry-Specific Configuration

**Note**: Different industries have different risk profiles; configuration should be adjusted accordingly.

### SaaS Configuration

```typescript
const saasConfig = {
  recursion: {
    hidden_cost_threshold_pct: 10,
    critical_threshold_pct: 25
  },
  risk_scoring: {
    critical: { min_probability_pct: 67, min_impact_usd: 50000 },  // Lower impact threshold (SaaS has lower costs)
    high: { min_probability_pct: 34, min_impact_usd: 25000 }
  },
  metrics: {
    max_acceptable_risk_score: 40  // Lower risk tolerance (SaaS should be low-risk)
  },
  risk_identification: {
    min_technical_risks: 5,  // SaaS has many technical risks (scalability, security, uptime)
    min_market_risks: 3,
    min_operational_risks: 2  // Lower operational risk (no physical supply chain)
  }
};
```

**Evidence**: Industry pattern analysis (not in governance docs; proposed)

---

### Hardware Configuration

```typescript
const hardwareConfig = {
  recursion: {
    hidden_cost_threshold_pct: 15,  // Higher tolerance (hardware has inherent cost variability)
    critical_threshold_pct: 30
  },
  risk_scoring: {
    critical: { min_probability_pct: 67, min_impact_usd: 200000 },  // Higher impact threshold
    high: { min_probability_pct: 34, min_impact_usd: 100000 }
  },
  metrics: {
    max_acceptable_risk_score: 70  // Higher risk tolerance (hardware inherently risky)
  },
  risk_identification: {
    min_technical_risks: 4,
    min_market_risks: 4,
    min_operational_risks: 6  // Higher operational risk (supply chain, manufacturing, logistics)
  }
};
```

**Evidence**: Industry pattern analysis (not in governance docs; proposed)

---

### Healthcare Configuration

```typescript
const healthcareConfig = {
  recursion: {
    hidden_cost_threshold_pct: 5,  // Lower tolerance (regulatory costs significant)
    critical_threshold_pct: 15
  },
  risk_scoring: {
    critical: { min_probability_pct: 50, min_impact_usd: 100000 },  // Lower probability threshold (compliance risks highly probable)
    high: { min_probability_pct: 25, min_impact_usd: 50000 }
  },
  metrics: {
    max_acceptable_risk_score: 30  // Lower risk tolerance (healthcare highly regulated)
  },
  risk_identification: {
    min_technical_risks: 4,
    min_market_risks: 3,
    min_operational_risks: 7,  // Higher operational risk (HIPAA, FDA, clinical trials)
    required_compliance_risks: ['HIPAA', 'FDA', 'Clinical Trial Insurance']  // Mandatory compliance risks
  }
};
```

**Evidence**: Industry pattern analysis (not in governance docs; proposed)

---

## Environment-Specific Configuration

**Development** (lenient thresholds for testing):
```typescript
const devConfig = {
  recursion: { hidden_cost_threshold_pct: 50 },  // High threshold (avoid triggering recursion in dev)
  metrics: { risk_coverage_target_pct: 80, max_acceptable_risk_score: 100 },  // Lenient quality gates
  governance: { chairman_approval_required_for: [] }  // No approval required (auto-approve)
};
```

**Staging** (moderate thresholds for pre-production):
```typescript
const stagingConfig = {
  recursion: { hidden_cost_threshold_pct: 15 },
  metrics: { risk_coverage_target_pct: 95, max_acceptable_risk_score: 60 },
  governance: { chairman_approval_required_for: ['mitigation_plans'] }  // Limited approval
};
```

**Production** (strict thresholds for live ventures):
```typescript
const prodConfig = {
  recursion: { hidden_cost_threshold_pct: 10 },
  metrics: { risk_coverage_target_pct: 100, max_acceptable_risk_score: 50 },
  governance: { chairman_approval_required_for: ['mitigation_plans', 'hidden_costs_high', 'risk_score_above_threshold', 'unmitigated_critical_risks'] }
};
```

---

## Configuration Storage

**Proposed Database Schema**:

```sql
CREATE TABLE stage_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id INT NOT NULL,  -- 6
  environment VARCHAR(50) NOT NULL,  -- 'dev', 'staging', 'prod'
  industry VARCHAR(50),  -- 'saas', 'hardware', 'healthcare', NULL = default
  config JSONB NOT NULL,  -- Full configuration object
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_stage_config ON stage_configurations(stage_id, environment, industry);
```

**Usage**:
```typescript
const config = await db.stage_configurations.findOne({
  stage_id: 6,
  environment: process.env.NODE_ENV,  // 'dev', 'staging', 'prod'
  industry: venture.industry  // 'saas', 'hardware', 'healthcare'
});
```

---

## Chairman Override Capabilities

**Can Override/Modify**:
1. **Hidden cost threshold**: Adjust from 10% to higher/lower value for specific ventures
2. **Risk score threshold**: Adjust from 50 to higher value (accept more risk)
3. **Risk coverage**: Allow <100% coverage (e.g., accept 95% if low-severity risks unmitigated)
4. **Mitigation effectiveness**: Accept <70% effectiveness for specific risks
5. **Max recursions**: Allow 3rd or 4th recursion if progress is being made

**Audit Trail**: All Chairman overrides logged in `chairman_overrides` table with justification

**Evidence**: Pattern from Stage 5 Chairman controls (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:111-114)

---

## Configuration Change Management

**Versioning**: All configuration changes versioned in `stage_configurations` table with `updated_at` timestamp

**Rollback**: Previous configurations preserved; can rollback to earlier version if needed

**Change Log**:
```sql
CREATE TABLE configuration_changelog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id INT NOT NULL,
  parameter_name VARCHAR(100) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_by VARCHAR(100),  -- Chairman email
  change_reason TEXT,
  changed_at TIMESTAMP DEFAULT NOW()
);
```

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Stage definition | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 228-273 |
| Metrics | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 241-244 |
| Recursion reference | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 91 |
| Chairman controls pattern | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 111-114 |

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
