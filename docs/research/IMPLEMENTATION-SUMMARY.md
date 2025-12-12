# Dynamic Model Allocation Framework - Complete Research & Implementation Plan

**Status**: RESEARCH COMPLETE, READY FOR IMPLEMENTATION
**Date**: 2025-12-06
**Approval Required**: Chairman sign-off on Haiku-first strategy

---

## What We've Accomplished

### ✅ Phase 1: Complete Research Package

We've completed a comprehensive research effort that includes:

1. **Original Research Report**
   - Location: `/docs/research/DYNAMIC-MODEL-ALLOCATION-RESEARCH.md`
   - Contents: 16 sub-agent inventory, pricing analysis, historical data assessment
   - Status: Updated with Haiku rate limit findings

2. **NEW: Haiku-First Strategy Document**
   - Location: `/docs/research/HAIKU-FIRST-STRATEGY.md` (11 sections, 350+ lines)
   - Contents: Complete model allocation strategy, sub-agent tier assignments, escalation logic, safety guarantees
   - Key insight: Shift from Sonnet-heavy to Haiku-first (700+ available hours/week)

3. **NEW: Phase 0 MVP Implementation Guide**
   - Location: `/docs/research/PHASE-0-MVP-IMPLEMENTATION.md` (6 implementation tasks)
   - Effort estimate: ~1.5 hours total implementation
   - Complexity: LOW (mostly configuration changes)

4. **NEW: Haiku Quick Reference**
   - Location: `/docs/research/HAIKU-QUICK-REFERENCE.md`
   - Purpose: Quick cheat sheet for Chairman during SD execution

5. **Technical Specifications JSON**
   - Location: `/docs/research/dynamic-model-allocation-specs.json`
   - Purpose: Machine-readable specs for programmatic use

---

## The Big Insight: Haiku Opportunity

### Before (Current State)
```
Weekly Allocation:
- Opus:   5% (24-40 hours) - Used sparingly ✓
- Sonnet: 90% (240-480 hours) - Default for everything ✗
- Haiku:  5% (700+ hours UNUSED) - Wasted capacity ❌

Problem: Under-utilizing 700+ hours/week of Haiku budget
```

### After (Haiku-First Strategy)
```
Weekly Allocation:
- Haiku:  60-70% (350-400 hours consumed from 700+ available) ✓
- Sonnet: 25-30% (150-200 hours consumed from 240-480 available) ✓
- Opus:   5-10% (20-40 hours consumed from 24-40 available) ✓

Benefit: Full budget utilization, higher capacity, same quality
```

---

## Model Assignments (Haiku-First)

### TIER 1: Haiku Default (5 agents, 40-45% of executions)

| Agent | Assignment | Reason |
|-------|-----------|--------|
| GITHUB | Haiku | PR operations, deterministic |
| DOCMON | Haiku | Template-based, 83-100% pass |
| RETRO | Haiku | Pattern extraction, 96% pass |
| VALIDATION | Haiku (LEAD) / Sonnet (PLAN/EXEC) | Escalates in critical phases |
| QUICKFIX | Haiku | <50 LOC changes, trivial |

### TIER 2: Sonnet Default (10 agents, 50-55% of executions)

| Agent | Assignment | Escalate to Opus? |
|-------|-----------|------------------|
| TESTING | Sonnet | Yes, for security-critical testing |
| DESIGN | Sonnet | Yes, for novel architectural patterns |
| DATABASE | Sonnet | Yes, for complex RLS policies |
| API | Sonnet | Yes, for security-sensitive endpoints |
| STORIES | Sonnet | No (Sonnet sufficient) |
| RISK | Sonnet | Yes, for security-related risks |
| PERFORMANCE | Sonnet | No (Sonnet sufficient) |
| DEPENDENCY | Sonnet | Yes, for novel vulnerabilities |
| SECURITY_SUB (in other contexts) | Sonnet | Generally, but Opus for critical |
| OTHERS | Sonnet | Case-by-case |

### TIER 3: Opus Only (1 agent, 5-10% of executions, non-negotiable)

| Agent | Assignment | Never Downgrade |
|-------|-----------|-----------------|
| SECURITY | Opus | ✅ YES - Threat analysis non-negotiable |

---

## Budget Zones & Model Recommendations

```
🟢 GREEN   (0-70% consumed)   → Use assigned models freely
🟡 YELLOW  (70-85% consumed)  → Monitor, upgrade cautiously
🟠 ORANGE  (85-95% consumed)  → Haiku-primary, defer non-critical
🔴 RED     (95%+ consumed)    → Haiku-only unless security-critical
```

---

## Phase 0 MVP: What Gets Built This Week

### 6 Implementation Tasks (Total: ~1.25 hours)

**Task 1** (15 mins): Update sub-agent executor
- Change `PHASE_MODEL_OVERRIDES` in `lib/sub-agent-executor.js`
- Assign Haiku to Tier 1 agents, Sonnet to Tier 2, Opus to Tier 3
- Static lookup table: (agent, phase) → model

**Task 2** (15 mins): Create token logger script
- Build `scripts/token-logger.js`
- Manual logging at SD checkpoints
- Weekly log aggregation + display

**Task 3** (25 mins): Create budget display
- Build `scripts/show-budget-status.js`
- Traffic-light status (green/yellow/orange/red)
- Burn rate + projected exhaustion
- Phase/model breakdown

**Task 4** (10 mins): Update CLAUDE.md
- Add "Model Assignment Strategy" section
- Document sub-agent tiers
- Explain budget zones + escalation rules

**Task 5** (10 mins): Create quick reference card
- Build `docs/HAIKU-QUICK-REFERENCE.md`
- Quick commands for Chairman
- Decision trees for escalation
- Never-break rules

**Task 6** (2 mins): Update .gitignore
- Add `.token-log.json` (local tracking, don't commit)

---

## First SD Validation Run

### Selection Criteria
- **Complexity**: 1-2 (trivial to simple)
- **Critical**: NO (not in critical path)
- **Risk**: LOW (use Tier 1 agents only)

### Expected Behavior
1. System recommends Haiku for all eligible tasks
2. Token usage logged at LEAD, PLAN, EXEC
3. Monitor: Does Haiku produce acceptable output?
4. If rework needed, escalate to Sonnet (logged)

### Success Criteria
- Haiku completes work without major rework
- Token logging works correctly
- Budget display is accurate
- Chairman confident in Haiku quality

---

## Weekly Execution Flow

### Before Each SD
```bash
# 1. Check budget status
node scripts/show-budget-status.js

# 2. Get SD recommendation (includes model recommendation)
npm run sd:next

# 3. Log SD start (token estimate)
node scripts/token-logger.js --sd SD-XYZ --phase LEAD --tokens 45000 --model haiku
```

### During Each SD
```bash
# Update token logs as phases complete
node scripts/token-logger.js --sd SD-XYZ --phase PLAN --tokens 78000 --model sonnet
node scripts/token-logger.js --sd SD-XYZ --phase EXEC --tokens 125000 --model haiku
```

### After Each SD
```bash
# Review weekly log
node scripts/token-logger.js --log

# Decide next SD based on budget zone
```

---

## Key Safety Guarantees

### Never Violate (CRITICAL)

❌ **NEVER** downgrade security-agent from Opus
- Security is non-negotiable
- Cost of compromise >> cost of Opus

❌ **NEVER** use Haiku for VALIDATION in PLAN/EXEC phases
- These are quality gates
- Sonnet/Opus required for rigor

❌ **NEVER** downgrade model to save tokens on critical work
- Defer non-critical SDs instead
- Don't compromise quality for budget

### Always Do These

✅ **DO** defer non-critical SDs if budget is tight
- Prefer deferral over downgrade
- Preserve Sonnet/Opus for critical work

✅ **DO** escalate Haiku to Sonnet if output quality is low
- Acceptable rework threshold: <20%
- If >20% rework needed, escalate

✅ **DO** log all model choices and escalations
- Enables calibration + learning
- Provides audit trail

---

## Risk Mitigation

### Top Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Haiku quality too low | Medium | Medium | Start with low-risk agents, monitor rework |
| Escalation logic fails | Low | Medium | Manual override always available |
| Sonnet/Opus budget exhausted | Low | High | Monitor weekly, defer non-critical SDs |
| Forecast inaccurate | Medium | Low | Start conservative, adjust weekly |
| Chairman overrides too often | Medium | Low | Build confidence over 2-3 SDs |

### Escape Hatches (Always Available)

- **Manual override**: Chairman can force any model (with logged reason)
- **Budget reserve**: Set aside % of budget for emergencies
- **Rollback**: Revert to Sonnet-default in 2 minutes if needed
- **Pause system**: Disable automatic recommendations, select manually

---

## Success Metrics (Week 1)

After first 2-3 SDs, measure:

**Quality Metrics**:
- Haiku output acceptability: >80% (target)
- Rework rate: <20% (target)
- Escalation frequency: <10% (target)

**Operational Metrics**:
- Token logging accuracy: 100%
- Budget zone predictions: >80% accurate
- Chairman confidence: Subjective but critical

**If all green**: Proceed to Week 2 (auto-escalation, dashboard)
**If any red**: Investigate, adjust Tier assignments

---

## Next Phases (Weeks 2-4)

### Week 2: Refinement
- [ ] Analyze escalation patterns
- [ ] Add task-type specific escalation rules
- [ ] Implement dashboard showing model breakdown
- [ ] Build escalation alerting (if >15% escalation)

### Week 3: Sophistication
- [ ] Add database schema for token tracking
- [ ] Implement auto-escalation (quality-score based)
- [ ] Build forecasting model (Haiku impact on projections)
- [ ] Create learning loops (calibrate estimates)

### Week 4+: Intelligence
- [ ] ML-based escalation prediction
- [ ] Complexity-aware model selection
- [ ] Budget reserve system
- [ ] Detailed cost-benefit analysis per task type

---

## Files Created/Updated

### New Research Files
- ✅ `/docs/research/HAIKU-FIRST-STRATEGY.md` (11 sections, 350+ lines)
- ✅ `/docs/research/PHASE-0-MVP-IMPLEMENTATION.md` (6 tasks, 80 mins implementation)
- ✅ `/docs/research/HAIKU-QUICK-REFERENCE.md` (cheat sheet for Chairman)
- ✅ `/docs/research/IMPLEMENTATION-SUMMARY.md` (this file)

### Updated Research Files
- ✅ `/docs/research/DYNAMIC-MODEL-ALLOCATION-RESEARCH.md` (Haiku findings added)
- ✅ `/docs/research/dynamic-model-allocation-specs.json` (updated JSON specs)

### To Be Implemented
- `/lib/sub-agent-executor.js` (Task 1)
- `/scripts/token-logger.js` (Task 2)
- `/scripts/show-budget-status.js` (Task 3)
- `/CLAUDE.md` (Task 4)
- `/docs/HAIKU-QUICK-REFERENCE.md` (Task 5)
- `/.gitignore` (Task 6)

---

## Chairman Sign-Off Checklist

**Before implementation, confirm:**

- [ ] **Model assignments** make sense? (Haiku for Tier 1, Sonnet for Tier 2, Opus for Tier 3)
- [ ] **Safety guarantees** are acceptable? (Never downgrade security, etc.)
- [ ] **Budget zones** align with weekly token limit? (700k? 500k? other?)
- [ ] **Haiku as default** is comfortable? (Can escalate if needed)
- [ ] **Token logging** is acceptable? (Manual vs. auto in future)
- [ ] **Timeline** works? (~1.5 hours this week, 2-3 hours week 2+)

---

## Quick Start (After Approval)

**Step 1**: Implement Phase 0 MVP (Tasks 1-6, ~1.5 hours)
**Step 2**: Run first SD with Haiku defaults (validation run)
**Step 3**: Review results, adjust if needed
**Step 4**: Continue normal SDs, tracking tokens weekly
**Step 5**: Plan Week 2 refinements based on Week 1 data

---

## Questions?

Refer to:
- **Model assignments**: `HAIKU-FIRST-STRATEGY.md` Section 2
- **Implementation details**: `PHASE-0-MVP-IMPLEMENTATION.md`
- **Quick commands**: `HAIKU-QUICK-REFERENCE.md`
- **Original research**: `DYNAMIC-MODEL-ALLOCATION-RESEARCH.md`

---

**Status**: ✅ RESEARCH COMPLETE, READY FOR CHAIRMAN APPROVAL & IMPLEMENTATION

**Recommendation**: Move forward with Phase 0 MVP this week. The strategy is sound, risk is minimal (fully reversible), and potential upside is significant (20-30% cost savings + higher capacity).
