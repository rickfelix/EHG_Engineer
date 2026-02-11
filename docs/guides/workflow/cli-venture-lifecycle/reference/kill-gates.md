---
Category: Reference
Status: Approved
Version: 1.0.0
Author: DOCMON Sub-Agent
Last Updated: 2026-02-08
Tags: [cli-venture-lifecycle, eva, reference, kill-gates]
Related SDs: [SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001, SD-LEO-INFRA-STAGE-GATES-EXT-001]
---

# Kill Gates Reference

Kill Gates are hard decision points where a venture can be **terminated** ("killed"), **sent back** for revision, or **approved** to proceed. They enforce deterministic thresholds -- not AI predictions -- per Chairman Decision D01.

There are 4 Kill Gates in the 25-stage lifecycle, placed at the boundaries where continuing with a flawed venture would waste significant resources.

## Architecture Overview

```
                     THE TRUTH           THE BLUEPRINT        LAUNCH & LEARN
                    Stages 1-5           Stages 13-16         Stages 23-25
                        |                     |                    |
                   +----+----+           +----+----+          +----+----+
                   |         |           |         |          |         |
                Kill Gate 3  Kill Gate 5  Kill Gate 13      Kill Gate 23
                (Validation) (Profitab.)  (Tech Stack)      (Post-Launch)
                   |         |           |         |          |         |
                   v         v           v         v          v         v
               kill/revise  kill/revise  kill/revise       kill/revise
               /proceed     /proceed     /proceed          /proceed
```

## Common Gate Behavior

All Kill Gates share these characteristics:

- **Chairman involvement**: Required. The Chairman must review and decide.
- **Devil's Advocate review**: Included. GPT-4o provides adversarial counter-arguments before the Chairman decides.
- **Decision options**: Three choices -- kill, revise, or proceed.
- **Recording**: All decisions stored in the `chairman_decisions` table with rationale, timestamp, and decision type.
- **Filter Engine integration**: The Decision Filter Engine evaluates stage output before presenting to Chairman. If thresholds pass and no triggers fire, the Filter Engine recommends auto-proceed. Chairman can override.

## Kill Gate 3: Market Validation

**Stage**: 3 (Validation) -- part of THE TRUTH phase
**Purpose**: Determine if the venture idea has sufficient market validation to warrant further investment in business model development.

### Trigger Conditions

| Metric | Threshold | Scale |
|--------|-----------|-------|
| validation_score | >= 6 to proceed | 1-10 composite |

The validation_score is a composite of 6 sub-metrics, each scored 0-100:

| Sub-Metric | Weight | What It Measures |
|------------|--------|------------------|
| Market Fit | Equal | Does the product solve a real market need? |
| Customer Need | Equal | Is the customer pain point acute enough? |
| Momentum | Equal | Is there evidence of market traction or timing? |
| Revenue Potential | Equal | Can this generate meaningful revenue? |
| Competitive Barrier | Equal | Can the venture defend its position? |
| Execution Feasibility | Equal | Can this team realistically build it? |

The 6 sub-metrics are averaged to produce a composite score on a 1-10 scale.

### Decision Matrix

```
validation_score >= 6
    |
    +-- YES --> Filter Engine evaluates --> Chairman reviews
    |               |                           |
    |               +-- auto_proceed=true ----> PROCEED (auto)
    |               +-- auto_proceed=false ---> Chairman decides
    |                                               |
    |                                          kill / revise / proceed
    |
    +-- NO --> Chairman MUST review
                    |
               kill / revise
```

### On Kill

- Venture status set to `killed` in the `ventures` table
- Kill reason recorded in `chairman_decisions` with `decision_type = 'kill_gate'`
- All venture artifacts preserved for learning (not deleted)
- Cross-venture learning module can later analyze kill patterns

### On Revise

- Venture rolls back to **Stage 1** (Draft Idea)
- Previous artifacts marked `is_current = false` (preserved but superseded)
- Chairman can provide specific revision guidance stored in decision rationale
- Venture re-enters THE TRUTH phase from the beginning

### On Proceed

- Stage advances to Stage 4 (Competitive Intelligence)
- Normal flow continues

### Implementation

- Gate logic: `lib/agents/modules/venture-state-machine/stage-gates.js` (extended by SD-LEO-INFRA-STAGE-GATES-EXT-001)
- Gate checked in: `processStage()` within `lib/eva/eva-orchestrator.js`
- Stage template: `lib/eva/stage-templates/stage-03.js`
- Decision recorded in: `chairman_decisions` table
- Devil's Advocate invoked via: `lib/eva/devils-advocate.js`

---

## Kill Gate 5: Profitability

**Stage**: 5 (Profitability) -- part of THE TRUTH phase
**Purpose**: Determine if the venture has a viable financial model before investing in business model and brand development.

### Trigger Conditions

| Metric | Threshold | Pass Condition |
|--------|-----------|----------------|
| gross_margin | >= 40% | Sufficient margin for growth |
| breakeven_months | <= 18 | Reasonable path to profitability |
| CAC:LTV ratio | >= 1:3 | Customer acquisition economics viable |
| ROI threshold | >= 15% | Returns justify the investment |

All four thresholds must pass for auto-proceed. Failure on ANY threshold triggers Chairman review.

### 3-Year Financial Model

Stage 5 produces a 3-year projection model with:

```
Year 1              Year 2              Year 3
+------------+      +------------+      +------------+
| Revenue    |      | Revenue    |      | Revenue    |
| COGS       |      | COGS       |      | COGS       |
| Gross Marg |      | Gross Marg |      | Gross Marg |
| OpEx       |      | OpEx       |      | OpEx       |
| Net Income |      | Net Income |      | Net Income |
| Cash Flow  |      | Cash Flow  |      | Cash Flow  |
+------------+      +------------+      +------------+
         \               |               /
          \              |              /
           +-- Break-Even Analysis ---+
           +-- Funding Requirements --+
           +-- ROI Calculation -------+
```

### Decision Matrix

```
ALL thresholds pass?
    |
    +-- YES --> Filter Engine evaluates --> Chairman reviews
    |               |                           |
    |               +-- auto_proceed=true ----> PROCEED (auto)
    |               +-- auto_proceed=false ---> Chairman decides
    |
    +-- NO --> Chairman MUST review
                    |
               kill / revise / proceed (with justification)
```

### Chairman Customization

The Chairman can override default thresholds via preferences:

| Preference Key | Default | Customizable |
|----------------|---------|--------------|
| `gate.kill5.gross_margin_min` | 0.40 | Yes |
| `gate.kill5.breakeven_months_max` | 18 | Yes |
| `gate.kill5.cac_ltv_min_ratio` | 3.0 | Yes |
| `gate.kill5.roi_threshold_min` | 0.15 | Yes |

Preferences stored in `chairman_preferences` table, resolved per-venture with global fallback.

### On Kill

- Venture status set to `killed`
- Financial model preserved in `venture_artifacts` for portfolio analysis
- Kill reason: specific threshold(s) that failed, recorded in `chairman_decisions`

### On Revise

- Venture rolls back to **Stage 1** (Draft Idea) -- full re-evaluation needed
- Alternatively, Chairman can direct revision to **Stage 5** only (re-run financials with adjusted assumptions)
- Revision target specified in `chairman_decisions.metadata.rollback_stage`

### On Proceed

- Stage advances to Stage 6 (Risk Matrix)
- Venture crosses from THE TRUTH into THE ENGINE phase
- **Reality Gate** at the 5-to-6 boundary also validates artifact completeness

### Implementation

- Gate logic: `lib/agents/modules/venture-state-machine/stage-gates.js`
- Financial model template: `lib/eva/stage-templates/stage-05.js`
- Threshold evaluation: `lib/eva/decision-filter-engine.js` (cost_threshold trigger type)
- Chairman preferences: `lib/eva/chairman-preference-store.js`
- Reality Gate at boundary: `lib/eva/reality-gates.js` (Stage 5 -> 6 transition)

---

## Kill Gate 13: Tech Stack Feasibility

**Stage**: 13 (Tech Stack) -- part of THE BLUEPRINT phase
**Purpose**: Determine if the venture's technical requirements are feasible to build with available technology, team skills, and budget.

### Trigger Conditions

Stage 13 uses an 8-criterion viability assessment. Each criterion is scored 1-5:

| Criterion | What It Evaluates |
|-----------|-------------------|
| Scalability | Can the stack handle projected growth? |
| Security | Does the stack meet security requirements? |
| Cost | Is the infrastructure cost sustainable? |
| Team Expertise | Does the team have or can acquire the skills? |
| Ecosystem Maturity | Are the technologies production-proven? |
| Integration Complexity | Can components integrate within timeline? |
| Vendor Lock-in Risk | Is the stack portable if needed? |
| Time to Market | Can MVP ship within timeline constraints? |

**Composite threshold**: Average score >= 3.0 (60% of maximum) to proceed.

### Risk Level Classification

```
Average Score         Risk Level       Action
  >= 4.0              LOW              Auto-proceed likely
  3.0 - 3.9           MEDIUM           Chairman review recommended
  2.0 - 2.9           HIGH             Chairman review required
  < 2.0               CRITICAL         Strong kill recommendation
```

### Decision Matrix

```
Average viability score >= 3.0 (60%)?
    |
    +-- YES --> Filter Engine evaluates
    |               |
    |               +-- new_tech_vendor trigger? --> Chairman reviews
    |               +-- no triggers -----------> PROCEED (auto)
    |
    +-- NO --> Chairman MUST review
                    |
               kill / revise / proceed (with risk acceptance)
```

Note: Even when the composite score passes, the `new_tech_vendor` filter trigger may still require Chairman review if unknown technologies are detected.

### On Kill

- Venture status set to `killed`
- Tech stack analysis preserved for cross-venture learning
- Common kill reason: team cannot acquire skills in time, or infrastructure cost exceeds budget

### On Revise

- Venture rolls back to **Stage 13** (re-evaluate with different tech choices)
- Chairman can specify constraints: "Must use existing EHG stack" or "No new vendors"
- Revision constraints stored in `chairman_decisions.metadata.constraints`

### On Proceed

- Stage advances to Stage 14 (Data Model & Architecture)
- Tech stack decisions become binding constraints for stages 14-22

### Implementation

- Gate logic: `lib/agents/modules/venture-state-machine/stage-gates.js`
- Tech stack template: `lib/eva/stage-templates/stage-13.js`
- New tech detection: `lib/eva/decision-filter-engine.js` (new_tech_vendor trigger)
- Chairman approved tech list: `chairman_preferences` with key `approved_technologies`

---

## Kill Gate 23: Production Launch Viability

**Stage**: 23 (Production Launch) -- part of LAUNCH & LEARN phase
**Purpose**: Final Go/No-Go decision before the venture goes live to real users. Evaluates post-build readiness and projected viability.

### Trigger Conditions

Stage 23 is the final kill gate and evaluates multiple dimensions:

| Metric Category | Specific Checks |
|-----------------|-----------------|
| Deployment readiness | All Stage 22 checklist items passed |
| Security posture | No critical/high vulnerabilities open |
| Performance baseline | Response times within SLA targets |
| Monitoring setup | Alerting, logging, incident response configured |
| Financial projections | Updated projections still viable |
| Market timing | Launch window still favorable |

### Go/No-Go Decision Framework

```
+-------------------+     +-------------------+     +-------------------+
|   DEPLOYMENT      |     |   OPERATIONAL     |     |   BUSINESS        |
|   READINESS       |     |   READINESS       |     |   READINESS       |
|                   |     |                   |     |                   |
| - All tests pass  |     | - Monitoring live |     | - Projections OK  |
| - No critical     |     | - Incident plan   |     | - Market timing   |
|   vulnerabilities |     | - Runbooks done   |     | - Team ready      |
| - Performance OK  |     | - On-call set up  |     | - Support plan    |
+--------+----------+     +--------+----------+     +--------+----------+
         |                         |                          |
         +------------+------------+-------------+------------+
                      |                          |
                  ALL PASS?                  ANY FAIL?
                      |                          |
                      v                          v
              Chairman reviews            Chairman MUST review
              (auto-proceed possible)     (kill/revise/proceed)
```

### Post-Launch Monitoring Triggers

If the venture proceeds to launch, Stage 23 also defines the post-launch monitoring thresholds that feed back into the system:

| Post-Launch Metric | Alert Threshold | Kill Reconsideration |
|--------------------|-----------------|----------------------|
| MRR Growth | < 5% month-over-month after month 3 | Chairman review |
| Churn Rate | > 10% monthly | Chairman review |
| Burn Rate | > 120% of projected | Chairman review |
| NPS Score | < 20 after month 2 | Chairman review |

### On Kill

- Venture status set to `killed` -- deployment does NOT proceed
- All infrastructure provisioned during stages 17-22 flagged for decommission
- Kill rationale recorded with specific failing criteria
- Post-mortem automatically captured in cross-venture learning

### On Revise

- Venture rolls back to the specific failing area:
  - Deployment issues --> Roll back to **Stage 22** (Deployment)
  - Security issues --> Roll back to **Stage 20** (Security & Performance)
  - Performance issues --> Roll back to **Stage 20**
  - Operational issues --> Roll back to **Stage 17** (Environment)
  - Financial issues --> Roll back to **Stage 5** (Profitability) for re-evaluation
- Rollback target specified in `chairman_decisions.metadata.rollback_stage`

### On Proceed

- Venture launches to production
- Stage advances to Stage 24 (Analytics)
- Post-launch monitoring begins per the thresholds defined above
- Incident response procedures activate

### Implementation

- Gate logic: `lib/agents/modules/venture-state-machine/stage-gates.js`
- Launch template: `lib/eva/stage-templates/stage-23.js`
- Prerequisite check: Validates Stage 22 Promotion Gate passed
- Post-launch metrics: Fed back through `venture_artifacts` for ongoing tracking

---

## Kill Gate Comparison

| Aspect | Gate 3 | Gate 5 | Gate 13 | Gate 23 |
|--------|--------|--------|---------|---------|
| Phase | THE TRUTH | THE TRUTH | THE BLUEPRINT | LAUNCH & LEARN |
| Focus | Market viability | Financial viability | Technical feasibility | Launch readiness |
| Scoring | 6 metrics, 1-10 | 4 thresholds | 8 criteria, 1-5 | Multi-dimensional |
| Pass threshold | >= 6 | All thresholds | >= 3.0 (60%) | All categories |
| Revise target | Stage 1 | Stage 1 or 5 | Stage 13 | Varies by issue |
| Chairman customizable | Score threshold | All 4 thresholds | Score threshold | Metric thresholds |
| Devil's Advocate | Yes | Yes | Yes | Yes |

## Recovery After Kill

A killed venture is not permanently deleted. Recovery is possible through:

1. **Chairman re-activation**: Chairman can change venture status from `killed` to `ideation` and re-start from Stage 1
2. **Portfolio review**: Cross-venture learning may identify that market conditions changed, prompting re-evaluation
3. **Pivot**: A new venture can be created that builds on learnings from the killed venture, referencing it as prior art

Kill decisions and their rationale are preserved indefinitely in `chairman_decisions` for organizational learning.

## Database Schema

### chairman_decisions Table (Kill Gate Records)

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| venture_id | UUID | Which venture |
| stage_number | INTEGER | Which kill gate stage |
| decision_type | TEXT | 'kill_gate' |
| decision | TEXT | 'kill', 'revise', or 'proceed' |
| rationale | TEXT | Chairman's reasoning |
| devils_advocate_response | JSONB | GPT-4o counter-arguments |
| filter_engine_result | JSONB | What the Filter Engine recommended |
| metadata | JSONB | Rollback target, constraints, etc. |
| created_at | TIMESTAMPTZ | When decision was made |

## Lifecycle Position Diagram

```
Stage:  1    2    3    4    5    6 .. 12   13   14 .. 22   23   24   25
        |    |    |    |    |    |         |    |         |    |    |
        v    v    v    v    v    v         v    v         v    v    v
       [Draft][AI][KILL][Comp][KILL][...]  [KILL][Data]  [KILL][An][Scale]
                  GATE       GATE         GATE          GATE
                   3          5            13            23
                   |          |            |             |
             THE TRUTH        |      THE BLUEPRINT   LAUNCH &
            (Is it worth      |     (Can we build    LEARN
             pursuing?)       |      it?)           (Should we
                              |                      go live?)
                      (Can it make
                       money?)
```
