# Stage 23 "Launch Execution" -- Claude Response

> Independent response to the Stage 23 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| analysisStep missing | N/A | None | **5 Critical** | Stage 23 should synthesize Stage 22's release packet into a launch readiness brief. Without it, the kill gate decision has no automated context. Users decide go/no-go without seeing the sprint summary, quality results, or known issues. | ADD | Stage 23 is the inflection point: everything before was "build it right." Now it's "should we launch?" The analysisStep provides the decision brief. |
| Kill gate quality | Weighted scoring (80% threshold) + blockers + chairman | Presence-based only (are 3 text fields filled?) | **4 High** | A presence check doesn't assess readiness. "asdfasdfasdf" passes the current gate. Kill decisions should consider upstream quality signals, not just text existence. | ENHANCE | Don't import GUI's weighted scoring. The CLI already has quality signals from Stages 20-22. Use those instead of reinventing scores. |
| Launch task status free text | Structured checklist with categories | Free text string | **3 Medium** | Can't determine if all tasks are complete. Free text "working on it" vs "done" is ambiguous. | ENUM | Simple enum: pending/in_progress/done/blocked. Consistent with Stage 19's task status pattern. |
| No launch type | soft/beta/hard/GA enum | None | **3 Medium** | Stage 24 doesn't know what kind of launch happened. Metrics expectations differ: beta launch → lower DAU targets. | ADD | Venture-appropriate launch types. Affects Stage 24 metric interpretation. |
| No success criteria | Success criteria text field | None | **4 High** | Stage 24 (Metrics & Learning) has no baseline to measure against. "Was the launch successful?" has no definition. | ADD | Success criteria defined at launch time, measured at Stage 24. This is the learning loop contract. |
| No launch metrics targets | 5 target metrics with tracking | None | **3 Medium** | Stage 24 can't compare actual vs target if targets weren't set. | ADD | Keep venture-level (revenue, users, satisfaction). Skip operational metrics (error rate, uptime). |
| No post-launch plan | postLaunchPlan, rollbackTriggers as structured fields | 3 unstructured text blobs | **2 Low** | Text blobs are fine for plans. Structure adds overhead without proportional value. | KEEP | The CLI's text fields are adequate. Plans don't need machine-readable structure -- they're read by humans. |
| No stakeholder approval | Chairman approval required | None | **2 Low** | Chairman approval is a governance concern specific to the GUI's organization. The CLI's go_decision IS the approval. | SKIP | The go_decision enum is already a human decision. Adding another approval layer is redundant for a venture lifecycle tool. |
| launch_date free text | Datetime picker | Free text string | **2 Low** | Parsing issues, inconsistent formats. Minor. | FIX | Validate as ISO date. Consider separate planned_date and actual_date. |
| No deployment readiness criteria | 12 weighted criteria | None | **2 Low** | The GUI's 12 criteria are operational checklists. The CLI shouldn't prescribe what "ready to launch" means -- it varies by venture. | SKIP | The CLI captures the decision. The criteria behind the decision are the user's domain. |

### 2. AnalysisStep Design

**Input (from Stage 22 -- the Release Packet)**:
- Stage 22: promotion_gate (pass/fail + warnings), release_decision (release/hold/cancel + rationale), sprint_summary (planned vs completed, quality, integration, key issues), sprint_retrospective (went_well, went_poorly, action_items)
- Stage 17: build_readiness (for pre-build context)
- Stage 14: technical architecture (for deployment context)

**Process (single LLM call)**:

1. **Launch Readiness Brief**: Synthesize Stage 22's release packet into a decision-ready summary. Highlight: promotion gate result (pass with N warnings vs fail), release decision (release/hold/cancel), quality assessment (from sprint_summary), known risks (from retrospective action_items), unresolved issues (from sprint_summary.key_issues).

2. **Risk Assessment for Launch**: Using the venture's full journey context (Stages 1-22), assess launch risks. Flag: market risks (from Stage 3), profitability concerns (from Stage 5), competitive pressures (from Stage 4), technical risks (from Stage 6), any issues that survived through BUILD LOOP.

3. **Success Criteria Suggestion**: Based on Stages 7 (pricing), 8 (business model), 11 (go-to-market), suggest appropriate success criteria and metric targets. For example: if Stage 8's revenue model is subscription, suggest MRR and churn targets.

4. **Launch Readiness Score**: Compute a readiness score based on:
   - Promotion gate passed? (+30)
   - Release decision = release? (+20)
   - Quality decision = pass? (+20) / conditional_pass? (+10)
   - Review decision = approve? (+15) / conditional? (+8)
   - Sprint completion = complete? (+15) / partial? (+8)

   This gives the user a quantified readiness signal without requiring the GUI's 12-criteria checklist.

**Output**: launch_readiness_brief, risk_assessment, suggested_success_criteria[], suggested_metrics[], readiness_score (0-100), launch_recommendation (go/caution/no_go).

### 3. Kill Gate Enhancement

**Update the kill gate to be decision-aware, not just presence-aware.**

```javascript
function evaluateKillGate({ go_decision, incident_response_plan, monitoring_setup, rollback_plan, stage22 }) {
  const reasons = [];
  const warnings = [];

  // Core decision (unchanged)
  if (go_decision !== 'go') {
    reasons.push({
      type: 'no_go_decision',
      message: go_decision === 'no-go'
        ? 'Launch decision is no-go'
        : 'Go/no-go decision not set',
    });
  }

  // Operational readiness (enhanced from presence to quality check)
  if (go_decision === 'go') {
    if (!incident_response_plan || incident_response_plan.trim().length < 10) {
      reasons.push({ type: 'missing_incident_response', message: 'Incident response plan required' });
    }
    if (!monitoring_setup || monitoring_setup.trim().length < 10) {
      reasons.push({ type: 'missing_monitoring', message: 'Monitoring setup required' });
    }
    if (!rollback_plan || rollback_plan.trim().length < 10) {
      reasons.push({ type: 'missing_rollback', message: 'Rollback plan required' });
    }
  }

  // NEW: Upstream signal checks (warnings, not blockers)
  if (stage22) {
    if (!stage22.promotion_gate?.pass) {
      reasons.push({ type: 'promotion_gate_failed', message: 'Stage 22 promotion gate did not pass' });
    }
    if (stage22.release_decision?.decision !== 'release') {
      reasons.push({ type: 'release_not_approved', message: `Release decision is "${stage22.release_decision?.decision}", not "release"` });
    }
    if (stage22.promotion_gate?.warnings?.length > 0) {
      warnings.push(...stage22.promotion_gate.warnings.map(w => ({
        type: 'upstream_warning', message: w
      })));
    }
  }

  const decision = reasons.length > 0 ? 'kill' : 'pass';
  return { decision, blockProgression: decision === 'kill', reasons, warnings };
}
```

**Key changes**:
- Still checks go_decision and 3 plans (existing behavior preserved)
- NEW: Validates Stage 22 promotion gate passed
- NEW: Validates Stage 22 release_decision = 'release'
- NEW: Surfaces Stage 22 warnings (conditional states)
- Reasons = hard kill, Warnings = informational (don't block but flag)

This ensures the kill gate can't pass if the upstream promotion gate failed or if the release was on hold/cancelled. The presence checks remain -- but now they're supplemented by upstream signal validation.

### 4. Launch Type

**Add launch_type enum.**

```javascript
launch_type: {
  type: 'enum',
  values: ['soft_launch', 'beta', 'general_availability'],
  required: true,
}
```

Three types, not four:
- **soft_launch**: Limited audience, testing market response. Lower metric targets.
- **beta**: Public but "beta" labeled. Feature-complete but expectations managed.
- **general_availability**: Full public launch. Full metric targets.

Skip "hard launch" -- it's just GA with marketing push. That's a marketing decision, not a lifecycle state.

**Launch type affects Stage 24**: metric target interpretation. A beta launch with 100 users is fine; a GA launch with 100 users is a problem.

### 5. Launch Tasks

**Change status to enum. Add category.**

```javascript
launch_tasks: {
  type: 'array', minItems: 1,
  items: {
    name: { type: 'string', required: true },
    status: { type: 'enum', values: ['pending', 'in_progress', 'done', 'blocked'], required: true },
    owner: { type: 'string' },
    category: { type: 'enum', values: ['technical', 'operational', 'communication', 'legal'] },
  },
}
```

Status enum matches Stage 19's task status pattern. Category is optional -- helps organize tasks but doesn't gate anything.

### 6. Success Criteria & Launch Metrics

**Add success_criteria as the contract between Stage 23 and Stage 24.**

```javascript
success_criteria: {
  type: 'array', minItems: 1,
  items: {
    metric: { type: 'string', required: true },
    target: { type: 'string', required: true },
    measurement_window: { type: 'string', required: true },  // "30 days", "first week"
    priority: { type: 'enum', values: ['primary', 'secondary'] },
  },
}
```

This is the learning loop contract: Stage 23 defines what success looks like; Stage 24 measures it.

**Do NOT add real-time metric tracking** (DAU, error rate, etc.). That's operational monitoring, not venture lifecycle data. The CLI captures definitions, not live dashboards.

### 7. Post-Launch Plan

**Keep text fields. Add one structured field.**

The CLI's incident_response_plan, monitoring_setup, and rollback_plan text fields are adequate -- these are plans for humans, not machine-readable data.

Add one structured field:

```javascript
rollback_triggers: {
  type: 'array',
  items: {
    condition: { type: 'string', required: true },
    action: { type: 'string', required: true },
  },
}
```

This structures rollback conditions: "IF error rate > 5% THEN revert to previous version." Stage 24 can reference these triggers to determine if rollback was warranted.

### 8. Stakeholder Approval

**Do NOT add separate stakeholder approval.**

The go_decision enum IS the approval mechanism:
- `go` = stakeholders approve launch
- `no-go` = stakeholders do not approve

Adding a separate "chairman approval" field duplicates this decision. The CLI should trust that whoever sets go_decision has the authority. Governance about WHO can make this decision is an access control concern, not a lifecycle data concern.

### 9. launch_date Fix

**Rename to `planned_launch_date`. Validate as ISO date. Add `actual_launch_date`.**

```javascript
planned_launch_date: { type: 'string', format: 'date', required: true },  // YYYY-MM-DD
actual_launch_date: { type: 'string', format: 'date' },  // Set when launch happens
```

Two dates because launches slip. Stage 24 can compare planned vs actual for velocity insights.

### 10. CLI Superiorities (preserve these)

- **evaluateKillGate() as pure function**: Clean, deterministic, testable. The GUI's weighted scoring with 12 criteria and chairman approval is over-engineered for most ventures.
- **Operational plan capture**: The CLI's 3 text fields (incident response, monitoring, rollback) are concise and practical. Plans don't need weighted scores.
- **Kill gate architecture**: pass/kill with reasons array is a clean pattern. The reasons explain WHY, which is more valuable than a score.
- **Separation of concerns**: Stage 22 handles readiness assessment. Stage 23 handles launch decision. This is cleaner than the GUI's monolithic "Production Launch."

### 11. Recommended Stage 23 Schema

```javascript
const TEMPLATE = {
  id: 'stage-23',
  slug: 'launch-execution',
  title: 'Launch Execution',
  version: '2.0.0',
  schema: {
    // === Updated: launch type (NEW) ===
    launch_type: { type: 'enum', values: ['soft_launch', 'beta', 'general_availability'], required: true },

    // === Existing (updated) ===
    go_decision: { type: 'enum', values: ['go', 'no-go'], required: true },
    incident_response_plan: { type: 'string', minLength: 10, required: true },
    monitoring_setup: { type: 'string', minLength: 10, required: true },
    rollback_plan: { type: 'string', minLength: 10, required: true },

    // === Updated: launch tasks with status enum ===
    launch_tasks: {
      type: 'array', minItems: 1,
      items: {
        name: { type: 'string', required: true },
        status: { type: 'enum', values: ['pending', 'in_progress', 'done', 'blocked'], required: true },  // CHANGED
        owner: { type: 'string' },
        category: { type: 'enum', values: ['technical', 'operational', 'communication', 'legal'] },  // NEW
      },
    },

    // === Updated: dates ===
    planned_launch_date: { type: 'string', format: 'date', required: true },  // RENAMED + validated
    actual_launch_date: { type: 'string', format: 'date' },  // NEW

    // === NEW: success criteria (contract with Stage 24) ===
    success_criteria: {
      type: 'array', minItems: 1,
      items: {
        metric: { type: 'string', required: true },
        target: { type: 'string', required: true },
        measurement_window: { type: 'string', required: true },
        priority: { type: 'enum', values: ['primary', 'secondary'] },
      },
    },

    // === NEW: structured rollback triggers ===
    rollback_triggers: {
      type: 'array',
      items: {
        condition: { type: 'string', required: true },
        action: { type: 'string', required: true },
      },
    },

    // === Derived (updated) ===
    decision: { type: 'enum', values: ['pass', 'kill'], derived: true },
    blockProgression: { type: 'boolean', derived: true },
    reasons: { type: 'array', derived: true },
    warnings: { type: 'array', derived: true },  // NEW: conditional states from Stage 22

    // === NEW: derived ===
    total_tasks: { type: 'number', derived: true },
    completed_tasks: { type: 'number', derived: true },
    blocked_tasks: { type: 'number', derived: true },
    provenance: { type: 'object', derived: true },
  },
};
```

### 12. Minimum Viable Change (Priority-Ordered)

1. **P0: Add `analysisStep` synthesizing Stage 22 release packet into launch readiness brief.** This provides the decision context for the kill gate. Without it, go/no-go is blind.

2. **P0: Enhance kill gate to validate upstream signals.** Add Stage 22 promotion gate pass + release_decision = 'release' as kill gate prerequisites. Ensures the kill gate can't pass if upstream signals are negative.

3. **P1: Add `success_criteria` array.** Contract with Stage 24. Defines what "successful launch" means. Without this, Stage 24 has no baseline.

4. **P1: Add `launch_type` enum.** soft_launch/beta/general_availability. Affects Stage 24 metric interpretation.

5. **P1: Change launch_tasks status to enum.** pending/in_progress/done/blocked. Consistent with Stage 19 pattern.

6. **P2: Rename launch_date to planned_launch_date + add actual_launch_date.** ISO date validation. Planned vs actual comparison for Stage 24.

7. **P2: Add `rollback_triggers` structured array.** Condition/action pairs. Referenced by Stage 24 if rollback occurred.

8. **P3: Do NOT add weighted scoring** (GUI-specific operational assessment).
9. **P3: Do NOT add chairman approval** (redundant with go_decision).
10. **P3: Do NOT add real-time metric tracking** (operational, not lifecycle).

### 13. Cross-Stage Impact

| Change | Stage 22 (Release Readiness) | Stage 24 (Metrics & Learning) | Overall Pipeline |
|--------|------------------------------|-------------------------------|-----------------|
| Kill gate consuming Stage 22 | Stage 22's promotion_gate and release_decision are validated at kill gate. Pipeline integrity preserved. | Stage 24 knows launch was properly gated. | Clean chain: promotion gate → release decision → kill gate. |
| Success criteria | N/A | Stage 24 measures actual vs target from Stage 23's criteria. Learning loop closes. | Traceability from launch intent to measured outcome. |
| Launch type | N/A | Stage 24 interprets metrics in context of launch type. Beta ≠ GA expectations. | Prevents false negatives (low beta numbers ≠ failure). |
| analysisStep | Consumes Stage 22's release packet. | Stage 24 has Stage 23's readiness brief for context. | Decision context flows through the pipeline. |

### 14. Dependency Conflicts (with Stages 1-22 decisions)

**No conflicts. Clean additions only.**

| Dependency | Status | Notes |
|-----------|--------|-------|
| Stage 22 → 23 (promotion_gate) | **NEW** | Kill gate now validates Stage 22 promotion gate passed. Addition, not conflict. |
| Stage 22 → 23 (release_decision) | **NEW** | Kill gate validates release_decision = 'release'. Addition, not conflict. |
| Stage 22 → 23 (sprint_summary) | **NEW** | analysisStep consumes sprint summary for launch brief. Addition, not conflict. |
| Stage 23 → 24 (success_criteria) | **NEW** | Stage 24 measures against Stage 23's criteria. Forward contract. |
| Stage 23 → 24 (launch_type) | **NEW** | Stage 24 interprets metrics in launch type context. Forward contract. |

All Stage 22 consensus fields are consumed read-only. No field renaming, type changes, or semantic conflicts.

### 15. Contrarian Take

**Arguing AGAINST enhancing the kill gate to validate upstream signals:**

1. **Defense in depth or defense in redundancy?** Stage 22's promotion gate already validates Stages 17-21. The release_decision already captures human judgment. If Stage 23's kill gate ALSO checks these, we have three layers checking the same thing: promotion gate → release_decision → kill gate. Each layer adds decision fatigue without adding safety.

2. **Kill gates should be simple.** The kill gates at Stages 3, 5, and 13 are clean: check a condition, pass or kill. Making Stage 23's kill gate consume upstream state transforms it from a "launch decision" into a "meta-validation of prior decisions." If Stage 22 said "release" and the kill gate says "but promotion gate had warnings," we're second-guessing a settled decision.

3. **The user already decided.** By the time someone sets go_decision = 'go', they've reviewed the release packet. The analysisStep shows them the readiness brief. Adding kill reasons for "Stage 22 had warnings" is the system overruling a human who already saw those warnings and decided to proceed.

4. **What could go wrong**: The kill gate becomes a bureaucratic obstacle. The user knows their venture is ready. Stage 22 passed. They set go_decision = 'go'. But the kill gate says 'kill' because of a Stage 22 warning about "conditional quality pass." The user has to go back to Stage 22, change a field they've already reviewed, just to satisfy a meta-check. This is exactly the kind of process theater that kills velocity.

**Counter-argument**: The upstream checks are guard rails against corrupted pipeline state, not against informed human decisions. If go_decision is 'go' but the promotion gate failed, something is structurally wrong -- the venture skipped the BUILD LOOP somehow. The kill gate is the last chance to catch pipeline integrity issues before launch. And warnings don't block -- they inform. Only hard failures (promotion gate fail, release decision not 'release') block, which are genuine pipeline integrity checks.

**Verdict**: Keep upstream validation for hard failures (promotion gate fail, release not approved) as BLOCKERS. Keep upstream warnings as INFORMATIONAL only. The kill gate remains a clean decision point with safety rails, not a bureaucratic review.
