# Intelligent Validation Framework

**Version:** 1.0.0
**Created:** 2025-10-28
**Part of:** SD-INTELLIGENT-THRESHOLDS (001-006)

## Overview

The Intelligent Validation Framework is a context-aware, adaptive system that validates Strategic Directive (SD) implementations across 4 gates in the LEAD→PLAN→EXEC→PLAN→LEAD workflow.

**Key Features:**
- ✅ **Adaptive Thresholds** (70-100%) based on risk, performance, and maturity
- ✅ **Phase-Aware Weighting** (gate-specific priorities)
- ✅ **Non-Negotiable Blockers** (6 critical checks)
- ✅ **Hybrid Validation** (Phase 1: blockers, Phase 2: scoring)
- ✅ **Pattern Tracking** (maturity bonuses after 10 similar SDs)
- ✅ **Complete Traceability** (all results stored in handoff metadata)

---

## Architecture

### 4 Validation Gates

| Gate | Handoff | Purpose | Focus |
|------|---------|---------|-------|
| **Gate 1** | PLAN→EXEC | Readiness Check | Is EXEC ready to start? |
| **Gate 2** | EXEC→PLAN | Implementation Fidelity | Did EXEC do it correctly? |
| **Gate 3** | PLAN→LEAD | End-to-End Traceability | Is work traceable & complete? |
| **Gate 4** | LEAD Final | Strategic Value | Should we approve this? |

### Hybrid Validation Logic

Each gate uses 2-phase validation:

**Phase 1: Non-Negotiable Blockers (Binary Pass/Fail)**
- Checks critical requirements (e.g., tests executed, no stubbed code)
- If ANY Phase 1 check fails → **immediate block**, no scoring
- No wasted validation cycles on obviously incomplete work

**Phase 2: Weighted Scoring (Negotiable Checks)**
- Only runs if ALL Phase 1 blockers pass
- Scores using phase-aware weights (CRITICAL/MAJOR/MINOR)
- Compares score against adaptive threshold
- Pass if: `score >= adaptiveThreshold`

---

## SD Type-Aware Thresholds (v1.1.0)

**NEW**: Gate pass thresholds now vary by SD type in addition to risk-based adaptive thresholds.

### SD Type Base Thresholds

| SD Type | Base Threshold | Rationale |
|---------|----------------|-----------|
| **feature** | 85% | Full validation (UI, E2E, integration) |
| **database** | 75% | Schema-focused, may skip UI-dependent E2E |
| **infrastructure** | 80% | Tooling/protocols, reduced code validation |
| **security** | 90% | Higher bar for security-critical work |
| **documentation** | 60% | No code changes, minimal validation |
| **orchestrator** | 70% | Coordination layer, user stories in children |
| **refactor** | 80% | Behavior preservation focus |
| **bugfix** | 80% | Targeted fix validation |
| **performance** | 85% | Measurable impact verification |

### SD Type-Aware Validator Applicability (v1.2.0)

**Added**: SD-LEO-FIX-REMEDIATE-TYPE-AWARE-001 (2026-01-24)

Different SD types have different validation requirements. The SD-Type-Aware Validation Policy defines which validators are REQUIRED, NON_APPLICABLE, or OPTIONAL for each SD type.

**Policy Module**: `scripts/modules/handoff/validation/sd-type-applicability-policy.js`

**Key Concept**: Validators that are NON_APPLICABLE for an SD type are automatically skipped with SKIPPED status, counting as passed (100/100) without execution.

#### Validator Applicability Matrix

| Validator | Feature | Refactor | Infrastructure | Database | Documentation |
|-----------|---------|----------|----------------|----------|---------------|
| TESTING | REQUIRED | NON_APPLICABLE | NON_APPLICABLE | REQUIRED | NON_APPLICABLE |
| DESIGN | REQUIRED | NON_APPLICABLE | NON_APPLICABLE | NON_APPLICABLE | NON_APPLICABLE |
| REGRESSION | OPTIONAL | **REQUIRED** | OPTIONAL | OPTIONAL | NON_APPLICABLE |
| GITHUB | REQUIRED | REQUIRED | NON_APPLICABLE | REQUIRED | NON_APPLICABLE |
| DATABASE | OPTIONAL | NON_APPLICABLE | OPTIONAL | REQUIRED | NON_APPLICABLE |
| DOCMON | REQUIRED | OPTIONAL | **REQUIRED** | OPTIONAL | REQUIRED |
| STORIES | REQUIRED | NON_APPLICABLE | OPTIONAL | OPTIONAL | NON_APPLICABLE |

**Note**: See full SD type policy in [Handoff System Guide - Section 9](../leo/handoffs/handoff-system-guide.md#9-gate-spotlight-sd-type-aware-validation-policy)

#### Integration with Adaptive Thresholds

SD-type-aware validation works alongside adaptive thresholds:

1. **Gate Composition**: Validators are filtered by SD type BEFORE gate execution
2. **Score Calculation**: SKIPPED validators contribute 100% to weighted score
3. **Threshold Comparison**: Final score compared against SD-type-specific threshold
4. **Pass Criteria**: `(score >= sdTypeThreshold) AND (all_required_validators_passed)`

**Example**:
```javascript
// Refactor SD at Gate 2 (EXEC-TO-PLAN)
const sdType = 'refactor';
const threshold = 80%;  // Base threshold for refactor

// Validators executed:
TESTING: SKIPPED (100/100) - Non-applicable
DESIGN: SKIPPED (100/100) - Non-applicable
REGRESSION: PASS (95/100) - REQUIRED, must pass
GITHUB: PASS (100/100) - REQUIRED, must pass

// Final score: 98.75/100 (97.5% weighted)
// Result: PASS (97.5% >= 80% threshold)
```

### Orchestrator SD Handling

Parent orchestrator SDs (those with child SDs) have special validation logic:
- **USER_STORY_EXISTENCE_GATE**: Bypassed (user stories are in child SDs)
- Gate validates child SD progress and completion instead of parent user stories
- Detection query: `SELECT COUNT(*) FROM strategic_directives_v2 WHERE parent_sd_id = :sd_id`

### Priority: SD Type vs Risk-Based

1. **SD Type threshold** is checked first (from `getThreshold(sd.sd_type)`)
2. **Risk-based modifiers** can still apply on top
3. **Special case minimums** (security, production) take precedence

---

## Adaptive Thresholds

### How It Works

Thresholds are calculated dynamically using 5 factors:

```javascript
finalThreshold = baseThreshold + performanceMod + maturityMod
finalThreshold = Math.max(finalThreshold, specialCaseMinimum)
finalThreshold = Math.min(finalThreshold, 100) // Cap at 100%
```

### 1. Base Threshold (from Risk Level)

| Risk Level | Base Threshold |
|------------|----------------|
| LOW | 70% |
| MEDIUM | 80% |
| HIGH | 90% |
| CRITICAL | 95% |

Risk level is stored in `strategic_directives_v2.risk_level` column.

### 2. Performance Modifier (±5%)

Adjusts based on prior gate scores in THIS SD:

```javascript
average = (gate1Score + gate2Score + ...) / gateCount

if (average >= 90%) → -5%  // Strong performance → easier
if (average < 75%)  → +5%  // Weak performance → harder
else                → 0%   // Average → no change
```

### 3. Maturity Modifier (+5%)

Raises the bar after mastering a pattern:

```javascript
if (sdCount > 10 && avgROI > 85%) → +5%
else                              → 0%
```

Pattern = `categories (sorted) | risk_level`
Example: `"database,design|high"`

### 4. Special Case Minimums

Certain scenarios enforce minimum thresholds:

| Scenario | Minimum |
|----------|---------|
| Production Deployment | 90% |
| Security/Authentication | 95% |
| Critical Database Schema | 95% |
| Compliance/Legal | 95% |
| Emergency Hotfix | 100% |

### 5. Final Cap

No threshold can exceed 100%.

### Example Calculation

```javascript
SD: {
  risk_level: 'HIGH',
  categories: ['database', 'security'],
  is_production_deployment: true
}

Prior gates: [92, 88]  // Gate 1: 92%, Gate 2: 88%
Pattern stats: { sdCount: 12, avgROI: 89 }

Step 1: Base = 90% (HIGH risk)
Step 2: Performance = -5% (avg 90% >= 90%)
Step 3: Maturity = +5% (12 SDs > 10 && 89% > 85%)
Step 4: Special case = max(95%, 90%) = 95% (security)
Step 5: Final = min(95%, 100%) = 95%

Result: Threshold = 95%
```

---

## Phase-Aware Weighting

Each gate has different priorities based on its purpose:

### Gate 1: Readiness Focus
**CRITICAL = 70% | MAJOR = 20% | MINOR = 10%**

Front-load critical prerequisites (DESIGN/DATABASE execution).

Example weights:
- DESIGN executed: 20 pts (CRITICAL)
- DATABASE executed: 20 pts (CRITICAL)
- PRD metadata complete: 15 pts (CRITICAL)
- PRD via script: 10 pts (MAJOR)
- Schema docs consulted: 2 pts (MINOR)

### Gate 2: Correctness Focus
**CRITICAL = 40% | MAJOR = 43% | MINOR = 17%**

Heavy penalty for technical failures (migrations, E2E tests).

Example weights:
- Migration execution: 20 pts (CRITICAL)
- E2E tests: 20 pts (CRITICAL)
- RLS policies: 5 pts (MINOR)

### Gate 3: Fidelity Focus
**CRITICAL = 60% | MAJOR = 25% | MINOR = 15%**

Focus on fidelity (A+B) over meta-analysis (D+E).

Example weights:
- Recommendation adherence: 30 pts (CRITICAL)
- Implementation quality: 30 pts (CRITICAL)
- Traceability mapping: 25 pts (MAJOR)
- Sub-agent effectiveness: 10 pts (MINOR)
- Lessons captured: 5 pts (MINOR)

### Gate 4: Strategic Value Focus
**CRITICAL = 65% | MAJOR = 25% | MINOR = 10%**

Strategic value over process (value+pattern 65 pts, process 10 pts).

Example weights:
- Value delivered: 35 pts (CRITICAL)
- Pattern effectiveness: 30 pts (CRITICAL)
- Executive validation: 25 pts (MAJOR)
- Process adherence: 10 pts (MINOR)

---

## Non-Negotiable Blockers

### Gate 1 (Phase 1 Blockers)

1. **DESIGN sub-agent executed** - Can't implement without UX analysis
2. **DATABASE sub-agent executed** - Can't implement without schema analysis

### Gate 2 (Phase 1 Blockers)

3. **Unit tests executed & passing** (#9) - TESTING sub-agent verdict = PASS
4. **Application directory verified** (#10) - Working in correct codebase
5. **Ambiguity resolved** (#11) - No FIXME/HACK/TODO? comments
6. **Server restarted & verified** (#14) - TESTING confirms server operational
7. **No stubbed code** (#20) - No "not implemented" or empty functions

### Gate 3 (Phase 1 Blockers)

8. **Gate 2 passed** - Can't verify traceability if implementation failed

### Gate 4 (Phase 1 Blockers)

9. **Strategic validation gate** (#19) - LEAD answers 6 strategic questions:
   - Does this solve a real business problem?
   - Is this the simplest solution?
   - Are we building what's needed vs. nice-to-have?
   - Did EXEC over-engineer this?
   - What's the ROI/complexity ratio?
   - Should this be approved?

---

## Pattern Tracking

### How Patterns Work

**Pattern Signature:** `categories (sorted, comma-separated) | risk_level`

Examples:
- `"database,design|high"`
- `"security,authentication|critical"`
- `"ui,ux|medium"`

### What Gets Tracked

1. **Historical SDs:** Last 100 completed SDs queried
2. **Pattern Matching:** Filter SDs with same signature
3. **ROI Calculation:** Average all gate scores (Gates 1-4) from handoffs
4. **Maturity Bonus:** If `sdCount > 10 && avgROI > 85%` → **+5% threshold**

### Why It Matters

After 10 successful SDs with a pattern, the system "knows" this pattern well and raises the bar:
- ✅ Rewards consistency and mastery
- ✅ Prevents complacency on well-known patterns
- ✅ System gets smarter over time

### Performance

- **In-memory cache:** 5-minute TTL to avoid repeated queries
- **Efficient queries:** Limits to 100 most recent completed SDs
- **Graceful degradation:** Returns null on error (no crash)

---

## Gate Result Storage

All gate results are stored in handoff metadata for future access:

### Gate 1 Results
```javascript
// Stored in: sd_phase_handoffs (handoff_type: PLAN-TO-EXEC)
metadata: {
  gate1_validation: {
    passed: true,
    score: 85,
    max_score: 100,
    issues: [],
    warnings: [],
    details: { ... },
    adaptive_threshold: { ... }
  }
}
```

### Gate 2 Results
```javascript
// Stored in: sd_phase_handoffs (handoff_type: EXEC-TO-PLAN)
metadata: {
  gate2_validation: {
    passed: true,
    score: 92,
    max_score: 100,
    issues: [],
    warnings: [],
    details: { ... },
    adaptive_threshold: { ... }
  }
}
```

### Gates 3 & 4 Results
```javascript
// Stored in: product_requirements_v2.metadata.plan_handoff
metadata: {
  plan_handoff: {
    handoff_id: "...",
    validation: { ... },
    gate3_validation: { ... },
    gate4_validation: { ... }
  }
}
```

---

## Testing the Framework

### Test Script

```bash
# Test individual gates
node scripts/test-validation-framework.js gate1 SD-2025-001
node scripts/test-validation-framework.js gate2 SD-2025-001
node scripts/test-validation-framework.js gate3 SD-2025-001
node scripts/test-validation-framework.js gate4 SD-2025-001

# Test all gates in sequence
node scripts/test-validation-framework.js all SD-2025-001
```

### What the Script Shows

- ✅/❌ Pass/fail status
- 📈 Score (X/100 points, Y%)
- 🎯 Adaptive threshold + reasoning
- 📊 Pattern statistics (if applicable)
- ❌ Blocking issues
- ⚠️ Warnings
- 📋 Score breakdown by check

---

## Debugging Validation Failures

### Common Issues

#### Gate 1 Fails
**Symptoms:** DESIGN or DATABASE sub-agent not executed

**Fix:**
```bash
node scripts/execute-subagent.js --code DESIGN --sd-id SD-ID
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>
```

#### Gate 2 Fails
**Symptoms:** Non-negotiable checks failing

**Fixes:**
- **Unit tests:** Run `npm test` and fix failures
- **App directory:** Ensure you're in the EHG_Engineer project root
- **Ambiguity:** Remove FIXME/HACK/TODO? comments
- **Server restart:** Restart dev server and run E2E tests
- **Stubbed code:** Implement all placeholder functions

#### Gate 3 Fails
**Symptoms:** Gate 2 didn't pass or handoff missing

**Fix:** Re-run EXEC→PLAN handoff after fixing Gate 2

#### Gate 4 Fails
**Symptoms:** Low ROI, over-engineering detected

**Fix:** Review strategic questions and simplify implementation if needed

### Checking Validation Results

```javascript
// Query handoff metadata
const { data: handoffs } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .eq('sd_id', 'SD-2025-001')
  .order('created_at', { ascending: false });

// Gate 1 results
handoffs.find(h => h.handoff_type === 'PLAN-TO-EXEC')?.metadata?.gate1_validation

// Gate 2 results
handoffs.find(h => h.handoff_type === 'EXEC-TO-PLAN')?.metadata?.gate2_validation

// Gates 3 & 4 results
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('metadata')
  .eq('directive_id', 'SD-2025-001')
  .single();

prd.metadata.plan_handoff.gate3_validation
prd.metadata.plan_handoff.gate4_validation
```

---

## Module Reference

### Core Modules

| Module | Purpose | LOC |
|--------|---------|-----|
| `adaptive-threshold-calculator.js` | Calculates context-aware thresholds | 323 |
| `pattern-tracking.js` | Tracks SD patterns for maturity bonuses | 186 |
| `design-database-gates-validation.js` | Gate 1 validation | ~500 |
| `implementation-fidelity-validation.js` | Gate 2 validation | ~920 |
| `traceability-validation.js` | Gate 3 validation | ~670 |
| `workflow-roi-validation.js` | Gate 4 validation | ~660 |

### Integration Points

- **unified-handoff-system.js** - Orchestrates gate execution during handoffs
- **TESTING sub-agent (lib/sub-agents/testing.js)** - Enforces test execution
- **orchestrate-phase-subagents.js** - Triggers sub-agents before gates

---

## Configuration

### Risk Level (strategic_directives_v2)

Set during directive creation:
```sql
UPDATE strategic_directives_v2
SET risk_level = 'HIGH'  -- or LOW, MEDIUM, CRITICAL
WHERE id = 'SD-2025-001';
```

### Special Case Flags

```sql
UPDATE strategic_directives_v2
SET
  is_production_deployment = true,  -- Minimum 90%
  is_emergency_hotfix = true        -- Minimum 100%
WHERE id = 'SD-2025-001';
```

### Categories

Categories influence pattern matching:
```sql
UPDATE strategic_directives_v2
SET category = ARRAY['database', 'security']
WHERE id = 'SD-2025-001';
```

---

## Performance

### Metrics

- **Gate 1:** ~0.5-1.5s (sub-agent queries)
- **Gate 2:** ~2-4s (git operations + TESTING check + preflight)
- **Gate 3:** ~1-2s (handoff queries + traceability)
- **Gate 4:** ~1-2s (git stats + strategic gate)
- **Pattern tracking:** ~0.2-0.5s (cached after first query)

### Optimization Tips

1. **Pattern cache:** Automatic 5-minute TTL, no action needed
2. **Parallel queries:** Use Promise.all() for independent checks
3. **Limit historical queries:** Already limited to 100 SDs
4. **Index usage:** Ensure indexes on `sd_id`, `handoff_type` in `sd_phase_handoffs`

---

## Migration Guide

### From Fixed 80% Threshold

**Before:**
```javascript
if (score >= 80) {
  validation.passed = true;
}
```

**After:**
```javascript
const thresholdResult = calculateAdaptiveThreshold({
  sd: sdData,
  priorGateScores,
  patternStats,
  gateNumber: 1
});

const requiredThreshold = thresholdResult.finalThreshold;

if (score >= requiredThreshold) {
  validation.passed = true;
}
```

### From No Phase 1/2 Split

**Before:**
```javascript
// All checks treated equally, no early exit
const score = calculateAllChecks();
return score >= threshold;
```

**After:**
```javascript
// Phase 1: Non-negotiable blockers
if (!designExecuted) {
  return { passed: false, issues: ['DESIGN not executed'] };
}

// Phase 2: Weighted scoring (only if Phase 1 passes)
const score = calculateWeightedScore();
return score >= adaptiveThreshold;
```

---

## Changelog

### v1.2.0 (2026-01-24)
- ✅ SD-type-aware validator applicability (SD-LEO-FIX-REMEDIATE-TYPE-AWARE-001)
- ✅ SKIPPED status for non-applicable validators
- ✅ Validator applicability matrix
- ✅ Integration with adaptive thresholds
- ✅ Cross-reference to handoff system guide

### v1.1.0 (2025-11-15)
- ✅ SD type-specific base thresholds
- ✅ Orchestrator SD handling

### v1.0.0 (2025-10-28)
- ✅ Initial release
- ✅ Adaptive thresholds (70-100%)
- ✅ Phase-aware weighting
- ✅ 6 non-negotiable blockers
- ✅ Hybrid validation (Phase 1/2)
- ✅ Pattern tracking with maturity bonuses
- ✅ Complete gate result storage
- ✅ Test script + documentation

---

## Support

### Questions?

1. **Test your validation:** `node scripts/test-validation-framework.js all SD-ID`
2. **Check gate results:** Query `sd_phase_handoffs` table
3. **Review this doc:** You're already here!
4. **Ask LEAD:** Escalate persistent issues

### Common Pitfalls

❌ **Don't bypass Phase 1 checks** - They're non-negotiable for a reason
❌ **Don't hardcode thresholds** - Always use `calculateAdaptiveThreshold()`
❌ **Don't skip pattern tracking** - It enables learning over time
❌ **Don't ignore warnings** - They indicate potential issues

### Best Practices

✅ **Run tests before handoff** - Catch issues early
✅ **Resolve ambiguities** - Remove TODO?/FIXME comments
✅ **Set risk level** - Ensures appropriate thresholds
✅ **Document patterns** - Use meaningful categories
✅ **Test with script** - Verify before production handoff

---

**End of Documentation**
