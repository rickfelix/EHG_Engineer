# Stage 21 "Integration Testing" -- Claude Response

> Independent response to the Stage 21 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| Stage 20/21 overlap | GUI combines QA+UAT in one stage | Separate stages with overlapping integration scope | **5 Critical** | Stage 20 has integration test suites. Stage 21 has integration points. Two stages testing the same thing differently creates confusion and redundancy. | RECONCEIVE | This is the fundamental question. The answer shapes everything else. |
| No analysisStep | GUI derives from workflow context | None (all user-provided) | **5 Critical** | Users must manually re-enter integration points that Stage 14 already defines. | ADD | Stage 14's architecture layers have integration points between them. |
| No review decision | GUI has sign-off (pending/approved/rejected) | all_passing boolean only | **4 High** | Stage 22 Sprint Review has no structured signal about integration/review quality. A boolean isn't a decision. | ADD | Replace all_passing with a review_decision (approve/conditional/reject). |
| No severity on failures | GUI has severity on bugs | All failures equal weight | **3 Medium** | Can't prioritize: payment gateway failure = logging failure. | ADD | But: most integration failures ARE critical. A "medium" integration failure is usually still a blocker. |
| No architecture reference | GUI implicit in API context | Free-text source/target | **3 Medium** | Can't map integrations to Stage 14 layers. Source/target are opaque strings. | ADD | Use layer names from Stage 14 instead of free text. |
| Environment free text | N/A | Free string | **2 Low** | Minor: "prod" vs "production" vs "Production" inconsistency. | CHANGE | Simple enum or at least validation. |
| No UAT concept | GUI has full UAT (feedback, sentiment, actions) | Nothing | **3 Medium** | No user acceptance testing in the venture lifecycle. But: UAT may not apply to all ventures (some are B2B APIs, not consumer products). | CONDITIONAL | Add lightweight UAT if Stage 21 is reconceived. |

### 2. Stage 20/21 Overlap Resolution

**The fundamental question: what is Stage 21 FOR?**

Stage 20 (per consensus) now has:
- test_suites with type: unit/integration/e2e
- quality_decision: pass/conditional_pass/fail
- ready_for_review boolean

Stage 21 currently has:
- integration points: source → target → pass/fail
- all_passing boolean

**The overlap is clear**: Stage 20's type:integration test suites and Stage 21's integration points are testing the same things. A "Backend → Database" integration test in Stage 20 and a "Backend → Database: pass" integration point in Stage 21 are the same test reported twice.

**Recommendation: Reconceive Stage 21 as "Build Review".**

The BUILD LOOP stages should be:
1. Stage 17: Pre-Build Checklist (are we ready to build?)
2. Stage 18: Sprint Planning (what are we building?)
3. Stage 19: Build Execution (building it)
4. Stage 20: Quality Assurance (testing it)
5. **Stage 21: Build Review** (reviewing the build holistically before sprint review)
6. Stage 22: Sprint Review (sprint retrospective + deployment decision)

**Build Review** scope:
- **Integration verification**: Confirm Stage 14's architecture integration points are connected (derived from Stage 14, verified by Stage 20 integration test results)
- **Quality review**: Assess Stage 20's quality_decision in context. A conditional_pass needs review rationale.
- **Defect triage**: Review open defects from Stage 20. Decide: fix now, defer to next sprint, or accept as-is.
- **Build sign-off**: approve/conditional/reject decision for Stage 22.

This eliminates the overlap: Stage 20 tests, Stage 21 reviews the test results + integration status.

### 3. AnalysisStep Design

**Input (from Stages 14, 19, 20)**:
- Stage 14: architecture layers with integration points (what should be connected)
- Stage 19: completed tasks with architecture_layer_ref, sprint_completion decision
- Stage 20: quality_decision, test suites (including integration results), known defects, uncovered_tasks

**Process (single LLM call)**:

1. **Integration verification**: Cross-reference Stage 14's integration points against Stage 20's integration test results. Flag any architecture integration point that has no corresponding test coverage.

2. **Quality assessment**: Summarize Stage 20's quality_decision. If conditional_pass, explain what conditions exist and whether they're acceptable for this sprint.

3. **Defect review**: Categorize Stage 20's known defects by severity. Identify which are blocking (critical/high open) vs acceptable (medium/low or resolved).

4. **Coverage analysis**: Combine Stage 20's uncovered_tasks with integration point gaps. Produce a holistic "what's tested, what's not" view.

5. **Build sign-off recommendation**: Based on integration status + quality + defects, recommend approve/conditional/reject.

**Output**: integration_status (from Stage 14 cross-ref), quality_summary, defect_summary, coverage_gaps, recommended_decision.

### 4. Review Decision

**Replace `all_passing` with `review_decision`.**

```javascript
review_decision: {
  type: 'object', derived: true,
  properties: {
    decision: { type: 'enum', values: ['approve', 'conditional', 'reject'] },
    rationale: { type: 'string' },
    integration_status: { type: 'string' },     // summary
    quality_assessment: { type: 'string' },     // summary of Stage 20 quality_decision
    open_blockers: { type: 'number' },
    ready_for_sprint_review: { type: 'boolean' },
  },
}
```

**Decision logic**:
- **APPROVE**: All integrations verified + Stage 20 quality_decision = pass + no open critical/high defects → ready_for_sprint_review = true
- **CONDITIONAL**: Minor integration gaps OR Stage 20 quality_decision = conditional_pass OR open medium defects → ready_for_sprint_review = true (with caveats for Stage 22)
- **REJECT**: Critical integration failures OR Stage 20 quality_decision = fail OR open critical defects → ready_for_sprint_review = false

### 5. Integration Severity

**If Stage 21 is reconceived as Build Review, integration severity becomes less relevant.** The integrations[] array becomes a verification checklist (does this connection work?), not a testing artifact.

However, if keeping integration points:

```javascript
integrations[].severity: {
  type: 'enum',
  values: ['critical', 'high', 'medium', 'low'],
}
```

**In practice**: Most integration failures are critical or high. A payment gateway failure is always critical. A logging integration failure is medium. The severity comes from the architecture -- Stage 14 can define which integration points are critical.

### 6. Architecture Layer Reference

**Replace free-text source/target with layer references.**

```javascript
integrations[]: {
  name: { type: 'string', required: true },
  source_layer: { type: 'string', required: true },  // CHANGED: Stage 14 layer name
  target_layer: { type: 'string', required: true },  // CHANGED: Stage 14 layer name
  status: { type: 'enum', values: ['verified', 'failed', 'untested'], required: true },  // CHANGED: verification-focused
  error_message: { type: 'string' },
}
```

Using Stage 14 layer names instead of arbitrary strings enables cross-referencing with the architecture.

### 7. Environment Enum

**Add enum for common environments.**

```javascript
environment: {
  type: 'enum',
  values: ['development', 'staging', 'production'],
  required: true,
}
```

Three values covers the standard deployment pipeline. If a venture has a custom environment, they can specify it (schema allows extension).

### 8. UAT Component Decision

**Add lightweight UAT as part of Build Review, not as a full testing platform.**

The GUI's UAT is a rich interactive experience (test cases with steps, sentiment tracking, action items). The CLI doesn't need this -- UAT in a CLI context is "did a human verify the build?"

```javascript
uat_summary: {
  type: 'object',
  properties: {
    conducted: { type: 'boolean', required: true },
    testers: { type: 'number' },           // How many humans tested
    feedback_summary: { type: 'string' },  // Free-text summary
    blockers_found: { type: 'number' },    // Critical issues from UAT
    sign_off: { type: 'enum', values: ['approved', 'rejected', 'pending'] },
  },
}
```

**This is optional.** Not all ventures need UAT (B2B APIs, infrastructure projects). But when conducted, capturing the result is valuable for Stage 22.

### 9. Stage Identity Recommendation

**Reconceive Stage 21 as "Build Review."**

| Aspect | Current: "Integration Testing" | Proposed: "Build Review" |
|--------|-------------------------------|------------------------|
| Purpose | Test integration points | Review build quality holistically |
| Input | User-defined integrations | Stage 14 integration points + Stage 20 QA results |
| Output | all_passing boolean | review_decision: approve/conditional/reject |
| Relation to Stage 20 | Overlapping (both test integrations) | Complementary (Stage 20 tests, Stage 21 reviews) |
| Relation to Stage 22 | Weak (just passes boolean) | Strong (review_decision gates Sprint Review) |
| UAT | None | Lightweight optional |

### 10. CLI Superiorities (preserve these)

- **Integration point model**: source → target with status is a clean, universal model for verifying system connections. Keep this as the integration verification schema within Build Review.
- **Environment tracking**: Knowing which environment was tested is valuable context. Keep and strengthen.
- **Pass rate metrics**: Numeric metrics (total, passing, rate) are useful for trending.
- **Minimal schema**: Build Review should be lightweight. The actual review happens in Stage 22 Sprint Review.

### 11. Recommended Stage 21 Schema

```javascript
const TEMPLATE = {
  id: 'stage-21',
  slug: 'build-review',
  title: 'Build Review',
  version: '2.0.0',
  schema: {
    // === Reconceived: integration verification (from Stage 14) ===
    integrations: {
      type: 'array', minItems: 1,
      items: {
        name: { type: 'string', required: true },
        source_layer: { type: 'string', required: true },  // CHANGED: Stage 14 layer
        target_layer: { type: 'string', required: true },  // CHANGED: Stage 14 layer
        status: { type: 'enum', values: ['verified', 'failed', 'untested'], required: true },  // CHANGED
        error_message: { type: 'string' },
      },
    },

    // === CHANGED: environment enum ===
    environment: {
      type: 'enum',
      values: ['development', 'staging', 'production'],
      required: true,
    },

    // === NEW: UAT summary (optional) ===
    uat_summary: {
      type: 'object',
      properties: {
        conducted: { type: 'boolean' },
        testers: { type: 'number' },
        feedback_summary: { type: 'string' },
        blockers_found: { type: 'number' },
        sign_off: { type: 'enum', values: ['approved', 'rejected', 'pending'] },
      },
    },

    // === Existing derived (updated) ===
    total_integrations: { type: 'number', derived: true },
    verified_integrations: { type: 'number', derived: true },  // RENAMED from passing
    failed_integrations: { type: 'array', derived: true },
    untested_integrations: { type: 'array', derived: true },  // NEW
    pass_rate: { type: 'number', derived: true },

    // === NEW: review decision (replaces all_passing) ===
    review_decision: {
      type: 'object', derived: true,
      properties: {
        decision: { type: 'enum', values: ['approve', 'conditional', 'reject'] },
        rationale: { type: 'string' },
        integration_status: { type: 'string' },
        quality_assessment: { type: 'string' },
        open_blockers: { type: 'number' },
        ready_for_sprint_review: { type: 'boolean' },
      },
    },

    // === NEW ===
    provenance: { type: 'object', derived: true },
  },
};
```

### 12. Minimum Viable Change (Priority-Ordered)

1. **P0: Reconceive as "Build Review"**. Change slug from 'integration-testing' to 'build-review'. The stage reviews build quality, not re-tests integrations.

2. **P0: Add `analysisStep` consuming Stages 14, 19, 20**. Derive integration verification from Stage 14 integration points. Summarize Stage 20 quality_decision. Cross-reference coverage gaps.

3. **P0: Replace `all_passing` with `review_decision`**. approve/conditional/reject determines ready_for_sprint_review for Stage 22.

4. **P1: Change source/target to source_layer/target_layer**. Reference Stage 14 architecture layers instead of free-text strings.

5. **P1: Change integration status to verified/failed/untested**. "Untested" captures gaps better than "pending" or "skip."

6. **P1: Change environment to enum**. development/staging/production.

7. **P2: Add `uat_summary` optional section**. Lightweight UAT capture: conducted, testers count, feedback summary, blockers, sign-off.

8. **P3: Do NOT add full test case management** (that's Stage 20's scope).
9. **P3: Do NOT add sentiment tracking or trend charts** (GUI presentation concerns).
10. **P3: Do NOT add integration severity** (most integration failures are critical by nature; severity adds little value).

### 13. Cross-Stage Impact

| Change | Stage 20 (QA) | Stage 22 (Sprint Review) | Stage 14 (Architecture) |
|--------|--------------|------------------------|------------------------|
| Reconceive as Build Review | Clear separation: Stage 20 tests, Stage 21 reviews. No overlap. | Sprint Review receives structured review_decision. | Architecture integration points become verification targets. |
| Integration verification from Stage 14 | Stage 20's integration tests map to Stage 14 integration points. | Sprint Review sees architecture → test → review traceability. | Stage 14 integration points are validated in Stage 21. |
| review_decision | Stage 20's quality_decision feeds into review_decision. | Sprint Review gates on ready_for_sprint_review. | N/A |
| UAT summary | Stage 20's test-based QA complemented by human UAT. | Sprint Review has both automated and human quality signals. | N/A |

### 14. Dependency Conflicts (with Stages 1-20 decisions)

**No blocking dependency conflicts.**

| Dependency | Status | Notes |
|-----------|--------|-------|
| Stage 14 → 21 (integration points → verification) | **OK** | Stage 14 defines layers with technologies and integration concerns. Stage 21 verifies these connections exist. |
| Stage 20 → 21 (quality_decision → review context) | **OK** | Stage 20's pass/conditional/fail feeds Stage 21's review assessment. |
| Stage 20 → 21 (known_defects → defect triage) | **OK** | Stage 21 reviews Stage 20's defects and decides which are blocking. |
| Stage 19 → 21 (sprint_completion → build status) | **Soft** | Stage 19's build status provides context but Stage 21 primarily consumes Stage 20. |

**Potential concern**: Renaming Stage 21 from "Integration Testing" to "Build Review" changes the stage's identity. This is a conscious decision, not a conflict. The current name doesn't match the reconceived scope.

### 15. Contrarian Take

**Arguing AGAINST reconceiving Stage 21:**

1. **Keep stages focused, not aggregated.** "Build Review" is vague. It could mean anything. "Integration Testing" is specific and testable. By reconceiving Stage 21 as a review stage, we're making it a catch-all for "everything Stage 20 didn't cover." That's how stages become bloated.

2. **The overlap is fine.** Stage 20 has integration TEST SUITES (automated test results with pass/fail/coverage). Stage 21 has integration VERIFICATION (manual confirmation that system components connect). These are different: one is automated, one is manual/operational. A CI pipeline can report test results (Stage 20), but someone still needs to verify the staging environment's services are actually connected (Stage 21).

3. **UAT in a CLI is awkward.** UAT feedback (sentiment, action items, resolutions) is inherently interactive and human. Capturing it in a JSON structure is clunky. The CLI's strength is automation and data; UAT is the opposite.

4. **What could go wrong**: Reconceiving Stage 21 makes it a "review of Stage 20" rather than an independent verification. If Stage 20's quality_decision is wrong, Stage 21 just rubber-stamps it because it's derived from the same data. Independent stages provide independent verification.

**Counter-argument**: The overlap between Stage 20 type:integration and Stage 21 integration points is real and confusing. "Build Review" gives Stage 21 a clear role: it's the human decision layer between automated QA (Stage 20) and sprint retrospective (Stage 22). Integration verification is PART of build review, not the whole thing. And UAT, while awkward in CLI, can be as simple as `conducted: true, sign_off: 'approved'` -- it doesn't need GUI-level richness.

**Verdict**: Reconceive, but keep the integration verification model as the core. Build Review = integration verification + quality assessment + optional UAT + review decision. Don't make it a vague catch-all.
