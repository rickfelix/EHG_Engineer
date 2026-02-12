# Stage 22 "Release Readiness" -- Claude Response

> Independent response to the Stage 22 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| analysisStep missing | Deployment context from prior stages | None (all user-provided) | **5 Critical** | Stage 22 should synthesize the entire BUILD LOOP. Without it, users manually create release items with no connection to what was actually built/tested. | ADD | The BUILD LOOP (17-21) generates rich data. Stage 22 should consume all of it. |
| Promotion gate stale contracts | N/A (different gate structure) | References quality_gate_passed + all_passing | **5 Critical** | Gate uses boolean checks that have been replaced by decision-based contracts. Gate will always fail or produce incorrect results. | UPDATE | Must update to use quality_decision and review_decision. |
| No sprint review/retrospective | N/A | Nothing | **4 High** | The BUILD LOOP ends without reflection. No "what went well, what didn't." Stage 23+ starts without sprint learnings. | ADD | Stage 22 is the natural place for sprint retrospective. Keeps it within the BUILD LOOP. |
| Release item category free text | 4 structured check categories | Free string | **3 Medium** | Can't aggregate or filter by category. Inconsistent categorization. | CHANGE | Simple enum covers common categories. |
| No sprint summary | Deployment execution summary | Nothing | **4 High** | Stage 23+ has no record of what the sprint accomplished. Planned vs actual is invisible. | ADD | Derive from Stages 18-21: what was planned, what was built, what passed QA. |
| No release decision | Chairman approval + promotion | Just promotion gate | **3 Medium** | Promotion gate checks structural completion. A human should also decide: release/hold/cancel. | ADD | The gate is mechanical; the decision is judgment. Both are needed. |
| No deployment readiness | 14 pre-deployment checks | Nothing | **2 Low** | Deployment readiness varies by stack. The CLI shouldn't prescribe infrastructure checks. | SKIP | Deployment execution is operational, not lifecycle. Stage 22 confirms readiness; Stage 23 handles launch specifics. |
| target_date not validated | N/A | Free string | **2 Low** | "tomorrow" vs "2026-03-01" inconsistency. Minor. | FIX | Validate as ISO date string (YYYY-MM-DD). |

### 2. AnalysisStep Design

**Input (from Stages 17-21 -- the entire BUILD LOOP)**:
- Stage 17: build_readiness, blocker_count, readiness_pct
- Stage 18: sprint items, story_points, sprint_goal, phase_ref
- Stage 19: sprint_completion, completion_pct, layer_progress, sd_execution_summary, issues
- Stage 20: quality_decision, overall_pass_rate, coverage_pct, total_failures, defects_by_severity
- Stage 21: review_decision, integration verification, uat_summary

**Process (single LLM call)**:

1. **Sprint summary generation**: Compare Stage 18 planned items with Stage 19 completed tasks. Calculate: items planned vs completed, story points planned vs delivered, quality metrics from Stage 20, integration status from Stage 21.

2. **Release readiness assessment**: Evaluate: Did the sprint achieve its goal (Stage 18 sprint_goal)? Are quality gates passed? Is the build reviewed and approved?

3. **Release item derivation**: Generate suggested release_items from the sprint's completed work. Each completed task with passing QA becomes a release candidate.

4. **Retrospective data**: Aggregate issues by type (bugs, blockers, tech_debt). Calculate: time-to-quality (how many defects found during QA), integration gap count (from Stage 21 untested integrations), velocity (story points delivered).

5. **Promotion gate pre-check**: Run the updated gate logic and surface any blockers before the user reviews.

**Output**: sprint_summary, suggested_release_items[], retrospective_data, promotion_gate_preview, release_readiness_assessment.

### 3. Promotion Gate Update

**Update the gate to use new decision-based contracts.**

```javascript
function evaluatePromotionGate({ stage17, stage18, stage19, stage20, stage21, stage22 }) {
  const blockers = [];
  const warnings = [];

  // Stage 17: build_readiness must be go or conditional_go
  if (!['go', 'conditional_go'].includes(stage17?.build_readiness)) {
    blockers.push('Pre-build readiness not achieved');
  }

  // Stage 18: ≥ 1 sprint item (unchanged)
  if ((stage18?.items?.length || 0) < 1) {
    blockers.push('No sprint items defined');
  }

  // Stage 19: sprint_completion decision (UPDATED from completion_pct + blocked_tasks)
  const sprintDecision = stage19?.sprint_completion?.decision;
  if (sprintDecision === 'blocked') {
    blockers.push('Sprint completion is BLOCKED');
  } else if (sprintDecision === 'partial') {
    warnings.push('Sprint completion is PARTIAL -- not all items completed');
  }
  // 'complete' = OK

  // Stage 20: quality_decision (UPDATED from quality_gate_passed boolean)
  const qualityDecision = stage20?.quality_decision?.decision;
  if (qualityDecision === 'fail') {
    blockers.push('Quality Assurance FAILED');
  } else if (qualityDecision === 'conditional_pass') {
    warnings.push('Quality Assurance is CONDITIONAL -- review known defects');
  }
  // 'pass' = OK

  // Stage 21: review_decision (UPDATED from all_passing boolean)
  const reviewDecision = stage21?.review_decision?.decision;
  if (reviewDecision === 'reject') {
    blockers.push('Build Review REJECTED');
  } else if (reviewDecision === 'conditional') {
    warnings.push('Build Review is CONDITIONAL');
  }
  // 'approve' = OK

  // Stage 22: release_decision (NEW -- replaces all_approved)
  if (stage22?.release_decision?.decision === 'hold') {
    warnings.push('Release is on HOLD');
  } else if (stage22?.release_decision?.decision === 'cancel') {
    blockers.push('Release has been CANCELLED');
  }

  const pass = blockers.length === 0;
  return {
    pass,
    rationale: pass
      ? `Phase 5 complete. ${warnings.length} warning(s).`
      : `Phase 5 blocked: ${blockers.length} blocker(s).`,
    blockers,
    warnings,
  };
}
```

**Key changes from current gate**:
- Uses decision enums instead of booleans
- Adds warnings for conditional states (partial completion, conditional QA, conditional review)
- Allows promotion with warnings (conditional states don't block, but are flagged)
- Stage 22 uses release_decision instead of all_approved

### 4. Sprint Review / Retrospective

**Add lightweight retrospective as part of Stage 22.**

```javascript
sprint_retrospective: {
  type: 'object',
  properties: {
    went_well: { type: 'array', items: { type: 'string' } },
    went_poorly: { type: 'array', items: { type: 'string' } },
    action_items: { type: 'array', items: { type: 'string' } },
  },
}
```

Three lists: what went well, what went poorly, action items for next sprint. This is the minimal viable retrospective. It doesn't need story points, velocity charts, or burndown data -- those are derived in sprint_summary.

### 5. Release Item Categories

**Add enum for release item categories.**

```javascript
release_items[].category: {
  type: 'enum',
  values: ['feature', 'bugfix', 'infrastructure', 'documentation', 'configuration'],
}
```

Five categories mapping to common release components. These align with the SD types used in the LEO Protocol (feature/bugfix/enhancement/refactor/infra simplified to release-level categories).

### 6. Release Decision

**Add release_decision as a human judgment layer.**

```javascript
release_decision: {
  type: 'object',
  properties: {
    decision: { type: 'enum', values: ['release', 'hold', 'cancel'], required: true },
    rationale: { type: 'string', required: true },
    approver: { type: 'string' },
  },
}
```

- **RELEASE**: Go to LAUNCH & LEARN. Promotion gate must also pass.
- **HOLD**: Sprint work is acceptable but not ready for launch (timing, dependencies, market conditions).
- **CANCEL**: Sprint work is inadequate. Do not proceed.

The promotion gate checks structural completion. The release_decision is the human judgment. Both must align for Phase 5→6 transition.

### 7. Sprint Summary

**Derive sprint summary from Stages 18-21.**

```javascript
sprint_summary: {
  type: 'object', derived: true,
  properties: {
    sprint_goal: { type: 'string' },           // From Stage 18
    items_planned: { type: 'number' },          // Stage 18 items count
    items_completed: { type: 'number' },        // Stage 19 tasks with status = done
    story_points_planned: { type: 'number' },   // Stage 18 total
    story_points_delivered: { type: 'number' },  // Stage 19 completed tasks' points
    quality_assessment: { type: 'string' },     // Stage 20 quality_decision summary
    integration_status: { type: 'string' },     // Stage 21 review_decision summary
    key_issues: { type: 'array' },              // Open critical/high issues from 19+20
    layer_progress: { type: 'object' },         // From Stage 19
  },
}
```

This gives Stage 23+ a clear record of what the sprint accomplished.

### 8. Deployment Readiness Decision

**Do NOT add deployment readiness checks to Stage 22.**

The GUI's 14 pre-deployment checks (SSL certs, DNS, monitoring, etc.) are operational concerns that vary by technology stack. A CLI venture lifecycle tool should not prescribe infrastructure checks.

Stage 22 confirms RELEASE READINESS (is the build good enough to launch?). Stage 23 (Launch Preparation) handles DEPLOYMENT READINESS (is the infrastructure ready?).

### 9. target_date Fix

**Rename to `target_release_date`. Validate as ISO date.**

```javascript
target_release_date: {
  type: 'string',
  format: 'date',  // YYYY-MM-DD
  required: true,
}
```

### 10. CLI Superiorities (preserve these)

- **Promotion gate as pure function**: `evaluatePromotionGate()` is a clean, deterministic function that checks all BUILD LOOP stages. This is excellent architecture.
- **Release item approval model**: pending/approved/rejected per item with approver is a solid approval workflow.
- **Phase transition gate**: The concept of a promotion gate between phases is correct and important.
- **Structural simplicity**: Release readiness should be simple. The GUI's 14-check deployment platform is over-engineered for a venture lifecycle tool.

### 11. Recommended Stage 22 Schema

```javascript
const TEMPLATE = {
  id: 'stage-22',
  slug: 'release-readiness',
  title: 'Release Readiness',
  version: '2.0.0',
  schema: {
    // === Updated: release items with category enum ===
    release_items: {
      type: 'array', minItems: 1,
      items: {
        name: { type: 'string', required: true },
        category: { type: 'enum', values: ['feature', 'bugfix', 'infrastructure', 'documentation', 'configuration'], required: true },  // CHANGED
        status: { type: 'enum', values: ['pending', 'approved', 'rejected'], required: true },
        approver: { type: 'string' },
      },
    },

    // === Existing (updated) ===
    release_notes: { type: 'string', minLength: 10, required: true },
    target_release_date: { type: 'string', format: 'date', required: true },  // RENAMED + validated

    // === NEW: release decision (human judgment) ===
    release_decision: {
      type: 'object',
      properties: {
        decision: { type: 'enum', values: ['release', 'hold', 'cancel'], required: true },
        rationale: { type: 'string', required: true },
        approver: { type: 'string' },
      },
    },

    // === NEW: sprint retrospective ===
    sprint_retrospective: {
      type: 'object',
      properties: {
        went_well: { type: 'array', items: { type: 'string' } },
        went_poorly: { type: 'array', items: { type: 'string' } },
        action_items: { type: 'array', items: { type: 'string' } },
      },
    },

    // === Existing derived (updated) ===
    total_items: { type: 'number', derived: true },
    approved_items: { type: 'number', derived: true },

    // === NEW: sprint summary ===
    sprint_summary: {
      type: 'object', derived: true,
      properties: {
        sprint_goal: { type: 'string' },
        items_planned: { type: 'number' },
        items_completed: { type: 'number' },
        story_points_planned: { type: 'number' },
        story_points_delivered: { type: 'number' },
        quality_assessment: { type: 'string' },
        integration_status: { type: 'string' },
        key_issues: { type: 'array' },
        layer_progress: { type: 'object' },
      },
    },

    // === Updated: promotion gate with new contracts ===
    promotion_gate: {
      type: 'object', derived: true,
      properties: {
        pass: { type: 'boolean' },
        rationale: { type: 'string' },
        blockers: { type: 'array' },
        warnings: { type: 'array' },          // NEW: conditional states
      },
    },

    // === NEW ===
    provenance: { type: 'object', derived: true },
  },
};
```

### 12. Minimum Viable Change (Priority-Ordered)

1. **P0: Update promotion gate to use new contracts**. Replace quality_gate_passed with quality_decision, all_passing with review_decision. Add warnings for conditional states. This is BLOCKING -- the current gate produces incorrect results.

2. **P0: Add `analysisStep` synthesizing BUILD LOOP (Stages 17-21)**. Sprint summary derivation, release readiness assessment, retrospective data aggregation, promotion gate pre-check.

3. **P0: Add `release_decision`** (release/hold/cancel). Human judgment layer separate from the mechanical promotion gate. Both must align for Phase 5→6.

4. **P1: Add `sprint_summary` derived field**. Planned vs completed items, story points, quality/integration summaries, key issues.

5. **P1: Change release item category to enum**. feature/bugfix/infrastructure/documentation/configuration.

6. **P2: Add `sprint_retrospective`**. went_well/went_poorly/action_items. Minimal viable retrospective.

7. **P2: Rename target_date to target_release_date and validate as date**.

8. **P3: Do NOT add deployment readiness checks** (operational, belongs in Stage 23).
9. **P3: Do NOT add chairman approval** (GUI-specific governance concern).
10. **P3: Do NOT add deployment execution tracking** (Stage 23's scope).

### 13. Cross-Stage Impact

| Change | Stages 17-21 (BUILD LOOP) | Stage 23 (Launch Prep) | Overall Pipeline |
|--------|--------------------------|----------------------|-----------------|
| Updated promotion gate | All BUILD LOOP decisions feed into gate correctly. | Stage 23 starts only when gate passes. | Phase transition is reliable. |
| Sprint summary | Stages 18-21 data aggregated into single summary. | Stage 23 knows what was built and its quality. | Traceability from plan to delivery. |
| Release decision | BUILD LOOP quality signals inform decision. | Stage 23 knows release status (release/hold/cancel). | Human judgment captured. |
| Sprint retrospective | BUILD LOOP learnings captured. | Stage 23+ benefits from action items. | Iterative improvement enabled. |

### 14. Dependency Conflicts (with Stages 1-21 decisions)

**One critical conflict requiring resolution:**

| Dependency | Status | Notes |
|-----------|--------|-------|
| Stage 19 → 22 (sprint_completion) | **UPDATE** | Gate currently checks completion_pct + blocked_tasks. Should check sprint_completion.decision. |
| Stage 20 → 22 (quality_decision) | **UPDATE** | Gate currently checks quality_gate_passed boolean. Must use quality_decision.decision. |
| Stage 21 → 22 (review_decision) | **UPDATE** | Gate currently checks all_passing boolean. Must use review_decision.decision. |
| Stage 17 → 22 (build_readiness) | **UPDATE** | Gate currently checks readiness_pct + categories. Should check build_readiness decision. |
| Stage 18 → 22 (sprint items) | **OK** | ≥1 sprint item check is still valid. |

**The stale gate contracts are the ONLY dependency conflict in this entire analysis.** All other dependencies are clean additions. The promotion gate function must be rewritten to use the new decision-based contracts.

### 15. Contrarian Take

**Arguing AGAINST adding sprint retrospective to Stage 22:**

1. **Retrospectives are a process, not data.** A went_well/went_poorly/action_items structure captures output but not the retrospective process itself. Real retrospectives involve team discussion, prioritization, and commitment. Storing three lists in JSON is a pale shadow.

2. **Stage 22 is already doing too much.** With the analysisStep, sprint summary, release decision, AND promotion gate, adding a retrospective makes Stage 22 a "kitchen sink" stage. It's trying to be: sprint review + release approval + phase gate + retrospective. That's four distinct activities.

3. **Action items have no enforcement.** went_poorly items and action_items are captured but nothing in Stages 23-25 references them. They're written and forgotten. Without downstream consumption, it's documentation theater.

4. **What could go wrong**: Teams fill in retrospective fields perfunctorily because they're required for the promotion gate. "Went well: everything. Went poorly: nothing. Action items: none." The structure exists but adds zero value.

**Counter-argument**: Even perfunctory retrospectives capture something. The action_items list is available for the next sprint's Stage 17 (Pre-Build Checklist) to seed from -- unresolved action items become checklist items. And the went_poorly list provides context for Stage 23+ if issues arise during launch. The retrospective is lightweight (3 optional lists) and its downstream value grows as the venture iterates through multiple sprints.

**Verdict**: Keep retrospective but make it truly optional (not required for promotion gate). The promotion gate should not check retrospective completeness -- it should only check structural completion and quality gates.
