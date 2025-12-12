# Stage 5: Configurability Matrix

**Purpose**: Identify tunable parameters for Stage 5 execution

---

## Configuration Parameters

| Parameter | Type | Default | Range/Options | Source |
|-----------|------|---------|---------------|--------|
| **ROI Threshold (CRITICAL)** | Percentage | 15% | 10-20% | stage-05.md:83 |
| **ROI Threshold (HIGH)** | Percentage | 20% | 15-25% | stage-05.md:84 |
| **Margin Threshold (HIGH)** | Percentage | 20% | 15-30% | stage-05.md:85 |
| **Break-even Threshold (MEDIUM)** | Months | 36 | 24-48 | stage-05.md:86 |
| **Max Recursion Count** | Integer | 3 | 2-5 | stage-05.md:96 |
| **ROI Calculation Timeout** | Duration | 500ms | 200-1000ms | stage-05.md:117 |
| **Recursion Detection Latency** | Duration | 100ms | 50-200ms | stage-05.md:118 |
| **Total Stage Latency** | Duration | 1s | 500ms-2s | stage-05.md:119 |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:83-86,96,117-119

---

## Entry Gate Configuration

| Gate | Configurable? | Parameter | Notes |
|------|---------------|-----------|-------|
| Market positioning defined | ❌ No | N/A | Boolean check (Stage 4 complete) |
| Pricing signals captured | ❌ No | N/A | Boolean check (Stage 4 complete) |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:201-203

---

## Exit Gate Configuration

| Gate | Configurable? | Parameter | Notes |
|------|---------------|-----------|-------|
| Financial model complete | ❌ No | N/A | Boolean check (all substages done) |
| Profitability validated | ✅ Yes | `min_roi_threshold` | Default: 15% (CRITICAL), 20% (HIGH) |
| Investment requirements defined | ❌ No | N/A | Boolean check (CapEx documented) |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:205-207

---

## Recursion Configuration

| Recursion Parameter | Type | Default | Range/Options | Source |
|---------------------|------|---------|---------------|--------|
| **FIN-001 ROI CRITICAL Threshold** | Percentage | 15% | 10-20% | stage-05.md:83 |
| **FIN-001 ROI HIGH Threshold** | Percentage | 20% | 15-25% | stage-05.md:84 |
| **FIN-001 Margin Threshold** | Percentage | 20% | 15-30% | stage-05.md:85 |
| **FIN-001 Auto-Execute (CRITICAL)** | Boolean | True | True/False | stage-05.md:104 |
| **FIN-001 Require Approval (HIGH)** | Boolean | True | True/False | stage-05.md:108 |
| **Max Recursion Count** | Integer | 3 | 2-5 | stage-05.md:96 |
| **Recursion Detection Latency** | Duration | 100ms | 50-200ms | stage-05.md:118 |
| **Chairman Notification Delay** | Duration | 0ms (immediate) | 0-5000ms | Inferred |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:83-86,96,104,108,118

---

## Financial Model Configuration

| Parameter | Type | Default | Range/Options | Source |
|-----------|------|---------|---------------|--------|
| **Forecast Horizon** | Years | 3-5 | 3-10 | stages.yaml:193 |
| **Growth Rate (Conservative)** | Percentage | 10% YoY | 5-20% | Inferred |
| **Growth Rate (Aggressive)** | Percentage | 30% YoY | 20-50% | Inferred |
| **Churn Rate (SaaS)** | Percentage | 5% monthly | 2-10% | Inferred |
| **Customer Acquisition Cost (CAC) Multiplier** | Factor | 3x LTV | 2x-5x | Inferred |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:193 "P&L projections"

---

## Progression Mode Configuration

**Current**: Manual → Assisted → Auto (suggested)
**Target**: Auto (full automation with AI financial modeling)

**Progression Stages**:
1. **Manual**: Human financial analyst creates spreadsheet models
2. **Assisted**: AI provides templates, recommendations, validation
3. **Auto**: AI generates financial models from venture parameters (pricing, market size, cost estimates)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:227 "progression_mode: Manual → Assisted"

---

## Chairman Override Capabilities

### ROI Threshold Overrides

**Industry-Specific Adjustments**:
- **SaaS ventures**: ROI threshold 20% (higher margins expected)
- **Hardware ventures**: ROI threshold 10% (lower margins accepted)
- **Strategic bets**: ROI threshold 0% (loss leader / market entry)

**Venture-Specific Overrides**:
- Override ROI threshold for individual ventures
- Skip recursion despite threshold violations
- Approve ventures below threshold for strategic reasons

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:111-114 "Override capability: Chairman can"

---

### Recursion Overrides

**Chairman Can**:
- Skip FIN-001 recursion despite ROI < 15%
- Approve 4th or 5th recursion (beyond max 3)
- Modify thresholds mid-execution (e.g., lower threshold from 15% to 12%)
- Change severity (e.g., downgrade CRITICAL to HIGH for specific venture)

**Audit Trail**: All overrides logged in `chairman_overrides` table with:
- Venture ID
- Override type (threshold adjustment, skip recursion, etc.)
- Justification (required text field)
- Timestamp
- Chairman user ID

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:103-114 "Chairman Controls"

---

## UI/UX Configuration

| UI Parameter | Type | Default | Range/Options | Source |
|--------------|------|---------|---------------|--------|
| **ROI Indicator Color (Green)** | Threshold | ≥20% | 15-30% | stage-05.md:124 |
| **ROI Indicator Color (Yellow)** | Threshold | 15-20% | 10-25% | stage-05.md:125 |
| **ROI Indicator Color (Red)** | Threshold | <15% | <10-20% | stage-05.md:126 |
| **Recursion Modal Auto-Display** | Boolean | True | True/False | stage-05.md:128 |
| **Comparison View Auto-Display** | Boolean | True | True/False | stage-05.md:132 |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:124-132 "UI/UX Implications"

---

## Performance Configuration

| Performance Parameter | Type | Default | Range/Options | Source |
|-----------------------|------|---------|---------------|--------|
| **ROI Calculation Timeout** | Duration | 500ms | 200-1000ms | stage-05.md:117 |
| **Recursion Detection Timeout** | Duration | 100ms | 50-200ms | stage-05.md:118 |
| **Total Stage Latency SLA** | Duration | 1s | 500ms-2s | stage-05.md:119 |
| **Database Logging Mode** | Mode | Async | Async/Sync | stage-05.md:120 |
| **Progressive ROI Calculation** | Boolean | True | True/False | Inferred |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:117-120 "Performance Requirements"

---

## Environment-Specific Configuration

### Development Environment

```yaml
stage_5_config:
  roi_threshold_critical: 10%     # Lower for testing
  roi_threshold_high: 15%
  max_recursion_count: 5           # Higher for testing
  recursion_auto_execute: false    # Manual trigger for debugging
  performance_sla_disabled: true   # No timeout enforcement
```

---

### Staging Environment

```yaml
stage_5_config:
  roi_threshold_critical: 15%     # Production values
  roi_threshold_high: 20%
  max_recursion_count: 3
  recursion_auto_execute: true
  performance_sla_disabled: false
  chairman_notification_mode: email  # Test notifications
```

---

### Production Environment

```yaml
stage_5_config:
  roi_threshold_critical: 15%
  roi_threshold_high: 20%
  margin_threshold_high: 20%
  break_even_threshold_medium: 36
  max_recursion_count: 3
  recursion_auto_execute: true
  performance_sla_disabled: false
  roi_calculation_timeout_ms: 500
  recursion_detection_timeout_ms: 100
  total_stage_latency_sla_ms: 1000
  chairman_notification_mode: dashboard_and_email
  audit_logging: enabled
```

---

## Configuration Storage

**Recommended Storage**: Database table `stage_configurations`

```sql
CREATE TABLE stage_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id INT NOT NULL,
  parameter_name VARCHAR(100) NOT NULL,
  parameter_value JSONB NOT NULL,
  environment VARCHAR(50) DEFAULT 'production',
  venture_id UUID REFERENCES ventures(id),  -- NULL for global config
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  UNIQUE(stage_id, parameter_name, environment, venture_id)
);
```

**Precedence Order** (highest to lowest):
1. Venture-specific configuration (venture_id set)
2. Environment-specific configuration (environment = 'production'/'staging'/'development')
3. Global default configuration (venture_id NULL, environment = 'default')

---

## Configuration Management API

**Get Configuration**:
```typescript
getStageConfig(stageId: 5, ventureId?: UUID): StageConfig
```

**Update Configuration** (Chairman only):
```typescript
updateStageConfig(stageId: 5, parameterName: 'roi_threshold_critical', value: 12, ventureId?: UUID)
```

**Reset to Default** (Chairman only):
```typescript
resetStageConfig(stageId: 5, ventureId?: UUID)
```

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| ROI thresholds | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 83-86 |
| Loop prevention | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 96 |
| Chairman controls | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 103-114 |
| Performance SLAs | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 117-120 |
| UI/UX config | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 124-132 |
| Gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 201-207 |
| Progression mode | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 227 |

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
