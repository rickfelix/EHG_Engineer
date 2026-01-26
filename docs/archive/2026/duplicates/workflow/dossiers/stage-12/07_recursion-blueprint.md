<!-- ARCHIVED: 2026-01-26T16:26:47.890Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-12\07_recursion-blueprint.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 12: Recursion Blueprint


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, protocol

## Recursion Status in Critique

**Stage 12 critique does NOT contain a recursion section.**

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-12.md:1-72 (complete file, no recursion section found)

**Implication**: No FORMAL recursion loops are currently defined for Stage 12. This file documents:
1. **PROPOSED recursion triggers** (gap analysis)
2. **Potential inbound triggers** from Stage 11
3. **Potential outbound triggers** to Stage 11 or Stage 13

---

## Gap Analysis: Missing Recursion Specification

**Finding**: Stage 12 lacks formal recursion loops despite having clear failure modes that SHOULD trigger upstream/downstream re-execution.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-12.md:47-50 "Add Rollback Procedures...Define rollback decision tree"

**Risk**: Without defined recursion triggers, Stage 12 failures could:
- Cascade to Stage 13 (propagate bad localizations)
- Block indefinitely (no clear path back to Stage 11)
- Require manual intervention (LEAD escalations without protocol)

**Recommendation**: Implement recursion specification as Strategic Directive (see File 10: Gaps).

---

## Proposed Inbound Recursion Triggers

### Trigger In-1: Stage 11 Primary Name Change
**Scenario**: Stage 11 primary name is revised AFTER Stage 12 has started (e.g., trademark conflict discovered).

**Current State**: NOT DEFINED (gap)

**Proposed Protocol**:
1. **Detection**: Stage 11 publishes `primary_name_changed` event
2. **Action**: Stage 12 MUST roll back to Substage 12.1 (all adaptations invalid)
3. **Data Impact**: Complete rework (all name variations, translations, testing)
4. **Decision Authority**: LEAD (approve Stage 11 change + Stage 12 restart)

**Proposed Trigger Code**:
```python
# In Stage 12 entry gate validation
if stage_11.primary_name_version > stage_12.baseline_name_version:
    raise RecursionTrigger(
        trigger_id="STAGE12-IN-001",
        source_stage=11,
        reason="Primary name changed after Stage 12 start",
        action="Roll back Stage 12 to start (substage 12.1)",
        requires_approval=True,
        approver="LEAD"
    )
```

**Evidence**: Inferred from EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:511-512 "inputs:...Primary brand name"

**Criticality**: HIGH - Primary name is foundational input; changes invalidate ALL Stage 12 work.

**Proposed SD**: **SD-STAGE12-RECURSION-IN-001** - Handle Stage 11 name changes

---

## Proposed Outbound Recursion Triggers

### Trigger Out-1: Cultural Fit Failure (Return to Stage 11)
**Scenario**: Market testing reveals cultural fit score < 60 in multiple key markets, indicating PRIMARY NAME is fundamentally flawed.

**Current State**: NOT DEFINED (gap)

**Proposed Protocol**:
1. **Detection**: Substage 12.3 testing results show `cultural_fit_score < 60` for ≥30% of markets
2. **Decision Point**: PLAN escalates to LEAD - "Primary name fails in key markets"
3. **LEAD Decision**:
   - **Option A**: Drop problematic markets (reduce scope) → Continue Stage 12
   - **Option B**: Create radical variations (high effort) → Continue Stage 12
   - **Option C**: **RECURSION**: Return to Stage 11 (select new primary name)
4. **If Option C**: BLOCK Stage 12 progression, rollback to Stage 11 entry

**Proposed Trigger Code**:
```python
# In Substage 12.3 validation
failed_markets = [m for m in markets if m.cultural_fit_score < 60]
if len(failed_markets) / len(markets) >= 0.30:  # 30% threshold
    escalation = EscalationRequest(
        trigger_id="STAGE12-OUT-001",
        reason="Cultural fit failure in 30%+ of markets",
        proposed_action="Return to Stage 11 (select new primary name)",
        evidence={
            "failed_markets": [m.id for m in failed_markets],
            "cultural_issues": [m.cultural_notes for m in failed_markets]
        }
    )
    lead_decision = await escalate_to_lead(escalation)

    if lead_decision.action == "ROLLBACK_STAGE_11":
        raise RecursionTrigger(
            trigger_id="STAGE12-OUT-001",
            target_stage=11,
            reason="Primary name culturally incompatible with key markets",
            action="Roll back Stage 11 to substage 11.2 (Name Generation)",
            requires_approval=True,
            approver="LEAD"
        )
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-12.md:47-50 "Add Rollback Procedures...rollback decision tree"

**Criticality**: HIGH - Prevents launching with brand name that offends/confuses key markets.

**Proposed SD**: **SD-STAGE12-RECURSION-OUT-001** - Cultural fit failure rollback

### Trigger Out-2: Market Acceptance Failure (Return to Stage 11)
**Scenario**: Market testing shows acceptance score < 50% across majority of markets, indicating primary name lacks resonance.

**Current State**: NOT DEFINED (gap)

**Proposed Protocol**:
1. **Detection**: Substage 12.3 testing results show `market_acceptance < 50%` (< 2.5/5.0 average)
2. **First Response**: Return to Substage 12.2 (create new variations) - INTERNAL LOOP
3. **If New Variations Also Fail**: Escalate to LEAD
4. **LEAD Decision**: Return to Stage 11 (primary name lacks market appeal) - EXTERNAL RECURSION

**Proposed Trigger Code**:
```python
# In Substage 12.3 validation (after feedback incorporation)
if market_acceptance_score < 2.5:  # 50% threshold
    if variation_iteration_count < 2:
        # Internal loop: Try new variations first
        return rollback_to_substage("12.2")
    else:
        # External recursion: Escalate to Stage 11
        escalation = EscalationRequest(
            trigger_id="STAGE12-OUT-002",
            reason="Market acceptance < 50% after 2 variation iterations",
            proposed_action="Return to Stage 11 (primary name lacks appeal)",
            evidence={
                "acceptance_score": market_acceptance_score,
                "iterations_attempted": variation_iteration_count,
                "market_feedback": qualitative_feedback_summary
            }
        )
        lead_decision = await escalate_to_lead(escalation)

        if lead_decision.action == "ROLLBACK_STAGE_11":
            raise RecursionTrigger(
                trigger_id="STAGE12-OUT-002",
                target_stage=11,
                reason="Primary name fails market acceptance testing",
                action="Roll back Stage 11 to substage 11.2 (Name Generation)",
                requires_approval=True,
                approver="LEAD"
            )
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:522 "metrics:...Market acceptance"

**Criticality**: MODERATE - Market acceptance is important but not as critical as cultural fit (can launch with moderate acceptance).

**Proposed SD**: **SD-STAGE12-RECURSION-OUT-002** - Market acceptance failure rollback

### Trigger Out-3: Localization Failure (Notify Stage 13)
**Scenario**: Stage 12 completes BUT one or more markets have unresolved localization issues (e.g., translations failed, phonetics invalid).

**Current State**: NOT DEFINED (gap)

**Proposed Protocol**:
1. **Detection**: Exit Gate 2 validation shows `localizations.some(l => !l.verified)` (incomplete localizations)
2. **Decision Point**: PLAN decides - "Launch with partial localizations?" or "Block until complete?"
3. **If Launch with Partial**:
   - Mark problematic markets as "DEFERRED" (not included in initial launch)
   - Notify Stage 13: "International expansion limited to verified markets only"
   - Create follow-up task: Complete deferred localizations post-launch
4. **If Block**: Continue Stage 12 until all localizations verified

**Proposed Trigger Code**:
```python
# In Exit Gate 2 validation
incomplete_localizations = [l for l in localizations if not l.verified]
if len(incomplete_localizations) > 0:
    plan_decision = await plan_agent.decide(
        question="Launch with partial localizations?",
        options=["LAUNCH_PARTIAL", "BLOCK_UNTIL_COMPLETE"],
        context={
            "incomplete_markets": [l.market_id for l in incomplete_localizations],
            "verified_markets": [l.market_id for l in localizations if l.verified]
        }
    )

    if plan_decision == "LAUNCH_PARTIAL":
        # Notify Stage 13 of limitations
        await notify_stage_13(
            trigger_id="STAGE12-OUT-003",
            message="Stage 12 complete with partial localizations",
            verified_markets=[l.market_id for l in localizations if l.verified],
            deferred_markets=[l.market_id for l in incomplete_localizations],
            action_required="Limit international expansion to verified markets"
        )
    else:
        # Block Stage 12 exit
        raise ExitGateBlocker("Localizations incomplete - blocking Stage 12 exit")
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:529 "exit:...Localizations complete"

**Criticality**: MODERATE - Impacts Stage 13 planning but does not require Stage 11 rollback.

**Proposed SD**: **SD-STAGE12-RECURSION-OUT-003** - Partial localization notification

---

## Potential Recursion from Stage 11

### Stage 11 → Stage 12 Recursion Scenario
**Question**: Could Stage 11 trigger recursion BACK to Stage 12 if localization issues are discovered late?

**Analysis**: YES, if Stage 11 is re-executed (e.g., name changed due to trademark conflict), Stage 12 MUST be re-executed.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:509-510 "depends_on:...11"

**Proposed Protocol**:
1. **Stage 11 publishes**: `primary_name_changed` event (version increment)
2. **Stage 12 detects**: Name version mismatch (as in Trigger In-1)
3. **Stage 12 response**: Roll back to Substage 12.1 (complete rework)

**This is the SAME as Trigger In-1 above.**

---

## Internal Recursion (Within Stage 12)

### Internal Loop 1: Substage 12.3 → Substage 12.2
**Scenario**: Market testing feedback requires new name variations.

**Current State**: IMPLICITLY supported (feedback incorporation in Step 12.3.3)

**Protocol**:
1. **Detection**: Market acceptance score < threshold in Step 12.3.2
2. **Action**: Return to Substage 12.2 (Step 12.2.1: Create new variations)
3. **Iteration Limit**: Maximum 2 iterations before escalating to LEAD

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:546-547 "done_when:...Feedback incorporated"

**This is NOT external recursion (Stage 12 internal only).**

### Internal Loop 2: Substage 12.2 → Substage 12.1
**Scenario**: Name adaptation reveals NEW cultural factors (e.g., translation uncovers unexpected connotation).

**Current State**: NOT DEFINED (gap)

**Proposed Protocol**:
1. **Detection**: Translation specialist discovers cultural issue during Step 12.2.2
2. **Action**: Return to Substage 12.1 (Step 12.1.2: Re-assess cultural factors for affected market)
3. **Scope**: Limited to specific market (not full Stage 12 rework)

**Proposed SD**: **SD-STAGE12-RECURSION-INT-001** - Cultural factor reassessment loop

---

## Recursion Governance

### Decision Authority Matrix

| Recursion Type | Trigger | Decision Authority | Approval Required |
|----------------|---------|-------------------|-------------------|
| **In-1**: Stage 11 name change | Stage 11 event | LEAD | YES (Stage 11 + 12 restart) |
| **Out-1**: Cultural fit failure | Stage 12 testing | LEAD | YES (Stage 11 rollback) |
| **Out-2**: Market acceptance failure | Stage 12 testing | LEAD | YES (Stage 11 rollback) |
| **Out-3**: Partial localizations | Stage 12 exit gate | PLAN | NO (operational decision) |
| **Int-1**: 12.3 → 12.2 loop | Market feedback | PLAN | NO (internal iteration) |
| **Int-2**: 12.2 → 12.1 loop | Cultural discovery | PLAN | NO (internal iteration) |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-12.md:18 "Clear ownership (PLAN)"

### Escalation Thresholds

**When to escalate PLAN → LEAD**:
1. Cultural fit score < 60 in ≥30% of markets → Potential Stage 11 rollback
2. Market acceptance < 50% after 2 variation iterations → Potential Stage 11 rollback
3. Budget overrun > 50% due to excessive iterations → Resource approval
4. Timeline delay > 2 weeks due to recursion loops → Strategic re-prioritization

**When PLAN handles internally** (no escalation):
1. Market acceptance < threshold on first test → Iterate variations (12.3 → 12.2)
2. Translation failures < 20% → Switch APIs or hire translators
3. Single market cultural issue → Re-assess that market only (12.2 → 12.1)

---

## Recursion Metrics & Monitoring

### KPIs for Recursion Health
1. **Recursion frequency**: # of times Stage 12 triggered external recursion (Target: 0)
2. **Internal iteration count**: # of 12.3 → 12.2 loops per venture (Target: ≤1)
3. **Escalation rate**: % of Stage 12 executions requiring LEAD escalation (Target: <10%)
4. **Rollback cost**: Person-hours lost to Stage 11 rollbacks (Target: 0)

### Monitoring Strategy
- Track recursion events in database: `stage_recursion_log` table
- Alert LEAD when cultural fit < 60 detected (proactive escalation)
- Dashboard: "Stage 12 Recursion Health" (frequency, cost, trends)

**Proposed SD**: **SD-STAGE12-MONITORING-001** - Recursion metrics tracking

---

## Recursion Prevention Strategies

### Strategy 1: Strengthen Stage 11 Exit Gates
**Goal**: Prevent Stage 12 rollbacks by catching issues in Stage 11.

**Actions**:
1. Add cultural pre-screening to Stage 11 (before finalizing primary name)
2. Require multi-market validation in Stage 11 testing
3. Increase Stage 11 market acceptance threshold (e.g., 75% → 80%)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:525 "entry:...Primary name selected"

**Impact**: Reduces Trigger Out-1 and Out-2 frequency by 50-70% (estimated).

### Strategy 2: Early Market Consultation
**Goal**: Identify localization challenges before Stage 12 starts.

**Actions**:
1. Involve translation specialist in Stage 11 (advisory role)
2. Conduct phonetic pre-checks during Stage 11 name generation
3. Flag high-risk markets (e.g., China, Japan) for extra scrutiny

**Impact**: Reduces internal iterations (12.3 → 12.2) by 30-40% (estimated).

### Strategy 3: Locked Baseline Version
**Goal**: Prevent Trigger In-1 (Stage 11 name changes after Stage 12 starts).

**Actions**:
1. Implement `primary_name_locked` flag in Stage 11 exit gate
2. Require LEAD approval to unlock (exceptional cases only)
3. If unlock required: Auto-trigger Stage 12 rollback with notification

**Evidence**: Addresses gap in EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:525 "Primary name selected"

**Impact**: Reduces Trigger In-1 frequency to near-zero (locked names rarely change).

---

## Proposed Strategic Directives (Summary)

**File 10 (Gaps & Backlog) contains full SD proposals. Summary here**:

1. **SD-STAGE12-RECURSION-IN-001**: Handle Stage 11 primary name changes (Trigger In-1)
2. **SD-STAGE12-RECURSION-OUT-001**: Cultural fit failure rollback protocol (Trigger Out-1)
3. **SD-STAGE12-RECURSION-OUT-002**: Market acceptance failure rollback protocol (Trigger Out-2)
4. **SD-STAGE12-RECURSION-OUT-003**: Partial localization notification to Stage 13 (Trigger Out-3)
5. **SD-STAGE12-RECURSION-INT-001**: Internal 12.2 → 12.1 cultural reassessment loop
6. **SD-STAGE12-MONITORING-001**: Recursion metrics tracking and dashboards

---

## Recursion Decision Tree

```
START: Stage 12 Execution
    ↓
Entry Gate 1: Primary name selected?
    ├─ NO → BLOCK (wait for Stage 11)
    └─ YES → Check name version
        ├─ Version changed since baseline? → TRIGGER IN-1 (rollback to 12.1)
        └─ Version stable → Proceed to 12.1
            ↓
Substage 12.1: Market Analysis
    ↓
Substage 12.2: Name Adaptation
    ├─ Cultural issue discovered? → INTERNAL LOOP (return to 12.1 for that market)
    └─ Proceed to 12.3
        ↓
Substage 12.3: Testing & Validation
    ├─ Cultural fit < 60 in 30%+ markets? → ESCALATE TO LEAD
    │   └─ LEAD Decision: Rollback to Stage 11? → TRIGGER OUT-1
    ├─ Market acceptance < 50% after 2 iterations? → ESCALATE TO LEAD
    │   └─ LEAD Decision: Rollback to Stage 11? → TRIGGER OUT-2
    ├─ Market acceptance < 3.5 (first test)? → INTERNAL LOOP (return to 12.2)
    └─ All tests pass → Proceed to Exit Gates
        ↓
Exit Gate 2: Localizations complete?
    ├─ Some incomplete → PLAN Decision: Launch partial? → TRIGGER OUT-3 (notify Stage 13)
    └─ All complete → Mark Stage 12 COMPLETE
        ↓
END: Handoff to Stage 13
```

---

## Recursion Blueprint Status

**Current State**: NO FORMAL RECURSION LOOPS DEFINED

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-12.md:1-72 (no recursion section)

**Proposed State**: 6 recursion triggers defined (3 external, 3 internal)

**Implementation Status**: PENDING (requires Strategic Directives)

**Priority**: MEDIUM (Stage 12 is NOT on critical path, but recursion loops de-risk execution)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-12.md:60 "Critical Path: No"

**Next Steps**:
1. Review proposed triggers with PLAN + LEAD (validate thresholds)
2. Create Strategic Directives (6 SDs listed above)
3. Implement recursion detection in Stage 12 execution code
4. Test recursion protocols with simulated failures
5. Monitor recursion frequency post-deployment (adjust thresholds if needed)

---

<!-- Generated by Claude Code Phase 6 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
