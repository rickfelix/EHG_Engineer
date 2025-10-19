# SD-VIF-REFINE-001: RAID Tracking Integration

**Strategic Directive**: SD-VIF-REFINE-001 (Recursive Refinement Loop)
**Integration**: RAID Tracking Framework (Risks, Assumptions, Issues, Dependencies)
**Created**: 2025-10-18
**Status**: IMPLEMENTED (Pending Migration Application)

---

## Table of Contents

1. [Overview](#overview)
2. [RAID Database Schema](#raid-database-schema)
3. [RAID Items for SD-VIF-REFINE-001](#raid-items-for-sd-vif-refine-001)
4. [Dynamic RAID Logging](#dynamic-raid-logging)
5. [UI Integration](#ui-integration)
6. [Migration & Deployment](#migration--deployment)
7. [Monitoring & Metrics](#monitoring--metrics)

---

## Overview

The RAID tracking integration connects the Recursive Refinement Loop (SD-VIF-REFINE-001) with the enterprise RAID logging framework. This provides full traceability of risks, assumptions, issues, and dependencies throughout the refinement process.

### Key Features

- **Static RAID Items**: Pre-documented Risks, Assumptions, and Dependencies seeded into database
- **Dynamic RAID Logging**: Automatic logging of Issues and Actions during recursion execution
- **EscalationPanel Integration**: Real-time RAID display in Chairman escalation UI
- **Audit Trail**: Complete history of all RAID events for retrospective analysis

---

## RAID Database Schema

### Table: `raid_log`

```sql
CREATE TABLE IF NOT EXISTS raid_log (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- RAID type and classification
  type VARCHAR(20) NOT NULL CHECK (type IN ('Risk', 'Assumption', 'Issue', 'Dependency', 'Action', 'Decision')),
  title VARCHAR(500) NOT NULL,
  description TEXT,

  -- Severity scoring (1-10 scale for all types)
  severity_index INTEGER CHECK (severity_index >= 1 AND severity_index <= 10),

  -- Status and lifecycle
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN (
    'ACTIVE', 'MONITORING', 'MITIGATED', 'RESOLVED', 'ACCEPTED', 'CLOSED', 'ESCALATED'
  )),

  -- Type-specific fields
  mitigation_strategy TEXT,      -- For Risks
  validation_approach TEXT,       -- For Assumptions
  resolution_details TEXT,        -- For Issues
  dependency_sd VARCHAR(100),     -- For Dependencies
  dependency_status VARCHAR(30),  -- For Dependencies

  -- Categorization
  category VARCHAR(50),  -- e.g., 'Technical', 'Business', 'Process', 'Database'
  owner VARCHAR(100),    -- e.g., 'EXEC', 'PLAN', 'LEAD', 'DATABASE', 'CHAIRMAN'

  -- Traceability
  venture_id UUID,      -- FK to ventures (optional)
  sd_id VARCHAR(100),   -- Reference to strategic_directives_v2
  prd_id VARCHAR(100),  -- Reference to product_requirements_v2

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Migration File**: `database/migrations/20251018_create_raid_log.sql`
**Supabase Migration**: `supabase/migrations/017_create_raid_log.sql`

---

## RAID Items for SD-VIF-REFINE-001

### Risks (3)

#### 1. Quality Metric Inconsistency
- **Severity**: 8/10 (High)
- **Status**: MITIGATED
- **Impact**: HIGH
- **Probability**: 0.3
- **Description**: Quality scores may vary between intelligence analysis runs, leading to unreliable convergence detection and incorrect iteration decisions.
- **Mitigation**: Use deterministic quality calculation algorithm in recursionLoop.ts. Average STA + GCIA scores. Validate with unit tests.
- **Implementation**: `src/services/recursionLoop.ts:calculateQualityDelta()`

#### 2. Chairman Override Abuse
- **Severity**: 6/10 (Medium)
- **Status**: MONITORING
- **Impact**: MEDIUM
- **Probability**: 0.4
- **Description**: Chairman may frequently skip refinement iterations to save time, undermining the quality improvement process and reducing venture success rates.
- **Mitigation**: Log all skip actions to raid_log. Track skip rate in ideation_experiments table. Alert if skip rate >30%.
- **Monitoring**: Skip rate metric tracked in `recursionLoop.ts:skipRefinement()`
- **Threshold**: 30% skip rate triggers alert

#### 3. Performance Degradation with Large Quality Evaluations
- **Severity**: 4/10 (Low)
- **Status**: ACCEPTED
- **Impact**: LOW
- **Probability**: 0.2
- **Description**: Intelligence analysis (STA + GCIA) may take >30 seconds for complex ventures, causing iteration timeouts and poor user experience.
- **Mitigation**: Async processing with progress indicators. Cache quality evaluation results. Set 30s timeout per iteration.
- **Timeout**: `RECURSION_RULES.ITERATION_TIMEOUT_MS = 30000`

### Assumptions (2)

#### 4. Intelligence Agents Provide Reliable Quality Scores
- **Severity**: 7/10
- **Status**: ACTIVE
- **Description**: Assumes STA and GCIA agents return consistent, reliable quality scores between 0-100 that accurately reflect venture quality.
- **Validation**: Monitor quality score variance across multiple runs. Validate against manual quality assessments.
- **Dependency**: SD-VIF-INTEL-001 (Intelligence Agents)
- **Test Coverage**: `tests/e2e/recursive-refinement.spec.ts:US-001`

#### 5. Tier 2 Ventures Benefit from Refinement
- **Severity**: 6/10
- **Status**: ACTIVE
- **Description**: Assumes that deep research (Tier 2) ventures gain significant quality improvement from 2 iterations, justifying the additional time cost.
- **Validation**: Track median quality delta for Tier 2 ventures. Target +15-20% improvement.
- **Target**: 15% median quality improvement for Tier 2
- **Monitoring**: `quality_improvement_median` metric

### Dependencies (3)

#### 6. SD-VIF-TIER-001: Tiered Ideation Engine
- **Severity**: 9/10 (Critical)
- **Status**: RESOLVED
- **Description**: Requires tier classification system to identify Tier 2 (deep research) ventures that should use recursive refinement.
- **Resolution**: SD-VIF-TIER-001 completed and deployed. Tier metadata available in ventures.metadata.tier.
- **Integration Point**: `src/components/ventures/VentureCreationDialog.tsx:217`

#### 7. SD-VIF-INTEL-001: Intelligence Agents
- **Severity**: 9/10 (Critical)
- **Status**: RESOLVED
- **Description**: Requires STA and GCIA intelligence agents to provide quality scores for each iteration.
- **Resolution**: SD-VIF-INTEL-001 completed. Intelligence agents integrated via IntelligenceDrawer component.
- **Integration Point**: `src/pages/VentureDetailEnhanced.tsx:handleAnalysisComplete()`

#### 8. Ventures Table Metadata JSONB Field
- **Severity**: 10/10 (Blocking)
- **Status**: RESOLVED
- **Description**: Requires ventures.metadata JSONB column to store recursion_state for iteration tracking.
- **Resolution**: Ventures table has metadata JSONB column. RecursionState interface defined in recursionLoop.ts.
- **Schema**: `src/services/recursionLoop.ts:RecursionState`

---

## Dynamic RAID Logging

### Issue Logging: Escalation Trigger

**When**: Quality improvement <10% after 2 iterations
**Function**: `recursionLoop.ts:escalateToChairman()`

```typescript
await logRAIDItem({
  type: 'Issue',
  title: 'Venture Refinement Below Quality Threshold - Escalated',
  description: `Venture "${venture.name}" completed 2 refinement iterations but quality improvement (${qualityDelta?.toFixed(1)}%) was below the 10% threshold.`,
  severity_index: 8, // High severity - requires Chairman attention
  status: 'ESCALATED',
  category: 'Quality',
  owner: 'CHAIRMAN',
  venture_id: ventureId,
  sd_id: 'SD-VIF-REFINE-001',
  metadata: {
    escalated_at: new Date().toISOString(),
    iterations_completed: 2,
    quality_scores: [72, 78], // Example
    quality_delta: 8.3,
    threshold_required: 10,
    escalation_reason: 'BELOW_THRESHOLD',
  },
});
```

### Action Logging: Chairman Skip

**When**: Chairman manually skips refinement loop
**Function**: `recursionLoop.ts:skipRefinement()`

```typescript
await logRAIDItem({
  type: 'Action',
  title: 'Chairman Skipped Recursive Refinement',
  description: `Chairman manually skipped refinement loop at iteration ${iteration}. Quality scores: ${quality_scores.join(', ')}%.`,
  severity_index: 5, // Medium impact - Chairman override
  status: 'CLOSED',
  category: 'Process',
  owner: 'CHAIRMAN',
  venture_id: ventureId,
  sd_id: 'SD-VIF-REFINE-001',
  metadata: {
    skipped_by: userId,
    skipped_at: new Date().toISOString(),
    iteration: 1,
    quality_scores: [72],
    monitoring_metric: 'skip_rate',
  },
});
```

### Decision Logging: Chairman Approval/Rejection

**When**: Chairman approves or rejects escalated venture
**Function**: `EscalationPanel.tsx:handleDecision()`

**Note**: Decision logging to be implemented when EscalationPanel is integrated into Chairman dashboard route.

---

## UI Integration

### EscalationPanel Component

**File**: `src/components/ventures/EscalationPanel.tsx`
**Enhancement**: Added RAID Items Display section

#### Features

1. **RAID Item Fetch**: Automatic query for venture-related RAID items
   ```typescript
   const { data, error } = await supabase
     .from('raid_log')
     .select('*')
     .or(`venture_id.eq.${ventureId},sd_id.eq.SD-VIF-REFINE-001`)
     .order('created_at', { ascending: false });
   ```

2. **Type-Specific Icons**:
   - Risk: ⚠️ AlertTriangle (amber)
   - Assumption: ❓ FileQuestion (blue)
   - Issue: 🚨 AlertOctagon (red)
   - Dependency: 🔗 GitBranch (purple)
   - Action: ✅ CheckCircle (green)
   - Decision: ℹ️ Info (indigo)

3. **Severity Color Coding**:
   - **8-10**: Red (High severity)
   - **5-7**: Amber (Medium severity)
   - **1-4**: Green (Low severity)

4. **Metadata Display**:
   - Implementation file references
   - Mitigation status
   - Additional context from metadata JSONB

#### UI Location

```
EscalationPanel
├── Venture Overview
├── Escalation Reason Alert
├── Quality Score Trend Chart
├── Iteration Details (4 metrics)
├── Iteration History
├── **RAID Items Display** ← NEW
└── Chairman Decision Controls
```

---

## Migration & Deployment

### Step 1: Apply Database Migration

**Option A**: Supabase SQL Editor (RECOMMENDED)
1. Open Supabase Dashboard: https://supabase.com/dashboard
2. Select project: `dedlbzhpgkmetvhbkyzq` (EHG_Engineer)
3. Navigate to: SQL Editor
4. Copy contents of: `database/migrations/20251018_create_raid_log.sql`
5. Paste and execute SQL

**Option B**: Supabase CLI
```bash
# Note: May conflict with existing migrations
supabase db push --local  # Test locally first
supabase db push          # Apply to production
```

**Verification**:
```bash
node scripts/apply-raid-log-migration.mjs
# Should show: ✅ Table already exists!
```

### Step 2: Seed Initial RAID Items

```bash
node scripts/seed-raid-items-vif-refine.mjs
```

**Expected Output**:
```
✅ Risk: Quality Metric Inconsistency (Severity: 8/10)
✅ Risk: Chairman Override Abuse (Severity: 6/10)
✅ Risk: Performance Degradation (Severity: 4/10)
✅ Assumption: Intelligence Agents Provide Reliable Quality Scores (Severity: 7/10)
✅ Assumption: Tier 2 Ventures Benefit from Refinement (Severity: 6/10)
✅ Dependency: SD-VIF-TIER-001 (Severity: 9/10)
✅ Dependency: SD-VIF-INTEL-001 (Severity: 9/10)
✅ Dependency: Ventures Table Metadata JSONB (Severity: 10/10)

Total: 8 items seeded successfully
```

### Step 3: Verify RAID Logging

**Test Dynamic Logging**:
1. Create a Tier 2 venture
2. Trigger refinement loop
3. Manually skip refinement (if Chairman override available)
4. Check `raid_log` table for Action entry
5. Complete 2 iterations with <10% improvement
6. Check `raid_log` table for Issue entry (escalation)

---

## Monitoring & Metrics

### Key Metrics

1. **Skip Rate**:
   - **Definition**: % of ventures where Chairman skipped refinement
   - **Threshold**: >30% triggers alert (Risk #2)
   - **Query**:
     ```sql
     SELECT
       COUNT(*) FILTER (WHERE skipped = true) * 100.0 / COUNT(*) as skip_rate
     FROM ventures
     WHERE metadata->'recursion_state' IS NOT NULL;
     ```

2. **Escalation Rate**:
   - **Definition**: % of Tier 2 ventures escalated to Chairman
   - **Expected**: 10-20% escalation rate
   - **Query**:
     ```sql
     SELECT
       COUNT(*) FILTER (WHERE escalated = true) * 100.0 / COUNT(*) as escalation_rate
     FROM ventures
     WHERE metadata->>'tier' = '2'
       AND metadata->'recursion_state' IS NOT NULL;
     ```

3. **Quality Improvement Median** (Tier 2):
   - **Definition**: Median quality delta for Tier 2 ventures
   - **Target**: +15% improvement
   - **Assumption**: #5 (Tier 2 Ventures Benefit from Refinement)

### RAID Item Queries

**All Active Risks**:
```sql
SELECT * FROM raid_log
WHERE type = 'Risk'
  AND status IN ('ACTIVE', 'MONITORING')
  AND sd_id = 'SD-VIF-REFINE-001'
ORDER BY severity_index DESC;
```

**Escalation Issues**:
```sql
SELECT * FROM raid_log
WHERE type = 'Issue'
  AND status = 'ESCALATED'
  AND sd_id = 'SD-VIF-REFINE-001'
ORDER BY created_at DESC;
```

**Chairman Skip Actions**:
```sql
SELECT * FROM raid_log
WHERE type = 'Action'
  AND title LIKE '%Skipped%'
  AND sd_id = 'SD-VIF-REFINE-001'
ORDER BY created_at DESC;
```

---

## Files Modified

### New Files Created

1. **Migration**:
   - `database/migrations/20251018_create_raid_log.sql` (89 LOC)
   - `supabase/migrations/017_create_raid_log.sql` (89 LOC, copy)

2. **Scripts**:
   - `scripts/seed-raid-items-vif-refine.mjs` (227 LOC)
   - `scripts/apply-raid-log-migration.mjs` (70 LOC)

3. **Documentation**:
   - `docs/SD-VIF-REFINE-001-RAID-INTEGRATION.md` (THIS FILE)

### Modified Files

1. **recursionLoop.ts** (+45 LOC):
   - Added `RAIDLogEntry` interface
   - Added `logRAIDItem()` helper function
   - Enhanced `skipRefinement()` with Action logging
   - Enhanced `escalateToChairman()` with Issue logging

2. **EscalationPanel.tsx** (+85 LOC):
   - Added `RAIDItem` interface
   - Added RAID items state and fetch logic
   - Added RAID Items Display UI section
   - Type-specific icons and severity color coding

---

## Total Implementation

- **LOC Added**: ~505 lines of code
- **Database Tables**: 1 (raid_log)
- **RAID Items**: 8 seeded (3 Risks, 2 Assumptions, 3 Dependencies)
- **Dynamic Logging**: 2 triggers (skip, escalation)
- **UI Enhancement**: 1 component (EscalationPanel)

---

## Next Steps

1. **Apply Migration**: Execute `20251018_create_raid_log.sql` via Supabase SQL Editor
2. **Seed RAID Items**: Run `node scripts/seed-raid-items-vif-refine.mjs`
3. **Create Chairman Route**: Build `/chairman/escalations/[id]` page
4. **Integrate EscalationPanel**: Wire component into Chairman route
5. **Test E2E**: Validate RAID logging with full refinement workflow
6. **Monitor Metrics**: Track skip rate, escalation rate, quality improvement

---

**Status**: ✅ RAID Integration Complete (Pending Migration Application)
**Documentation Updated**: 2025-10-18
**Author**: EXEC Agent (SD-VIF-REFINE-001)
