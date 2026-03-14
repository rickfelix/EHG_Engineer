# Brainstorm: Automated Codebase Health Scoring

## Metadata
- **Date**: 2026-03-12
- **Domain**: Protocol
- **Phase**: Discovery
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: Cross-cutting — affects all ventures (EHG_Engineer infrastructure)

---

## Problem Statement

The LEO protocol is entirely top-down: all work originates from strategic intent (chairman/EVA). There is no bottom-up signal from the codebase itself. This creates two compounding problems:

1. **Silent accumulation** — Tech debt builds invisibly. 93 tmp-*.cjs files, growing module complexity, eroding test coverage — none of this surfaces as work items.
2. **Strategic crowding** — Even when debt is manually discovered, strategic priorities always win. Maintenance never reaches the top of the queue because there's no objective mechanism to rank it.

Today, codebase health issues are discovered only through manual review — the user periodically inspects the codebase and notices problems. This is unreliable, inconsistent, and doesn't scale.

## Discovery Summary

### Core Design Decisions
- **Response model**: Auto-generate draft SDs when health thresholds are crossed. No human gatekeeping — the scanner is a fully autonomous actor within the LEO protocol.
- **Priority model**: Health SDs compete on equal footing with strategic SDs in the existing priority queue. A new "health urgency" dimension will be added to the priority scorer to ensure health SDs can surface against OKR-aligned work.
- **Top dimensions** (user-selected): Dead code/bloat, test coverage trends, module complexity.

### Key Insight: EVA Pipeline Reuse
The Pragmatist analysis revealed that 80%+ of the required infrastructure already exists:
- `scripts/eva/trend-detector.mjs` — pattern detection from signals
- `scripts/eva/recommendation-engine.mjs` — converts trends into prioritized recommendations
- `scripts/eva/auto-sd-generator.mjs` — converts recommendations into draft SDs with deduplication
- `scripts/eva/corrective-sd-generator.mjs` — generates SDs when EVA scores cross thresholds

The new work is the **measurement layer** — actual codebase static analysis that produces health scores. The plumbing from "threshold crossed" to "draft SD in queue" is already wired.

## Analysis

### Arguments For
- Transforms LEO from a system that must be told about debt into one that discovers it — closing the bottom-up gap
- Reuses 80%+ of existing EVA infrastructure — low net-new code relative to the capability gained
- Eliminates the "guilt queue" anti-pattern where maintenance always loses to strategic work
- Establishes a reusable platform pattern (scan-to-SD pipeline) for future dimensions: dependency freshness, performance regression, documentation staleness
- Health SDs generate retrospectives, creating a feedback loop that calibrates thresholds over time

### Arguments Against
- Priority scorer modification touches a critical path — incorrect health-urgency weighting could distort the entire SD queue
- First-run flood risk: accumulated debt across dimensions could generate 5-10 SDs simultaneously
- Threshold calibration requires iteration — expect false positives in early runs

## Protocol: Friction/Value/Risk Analysis

| Dimension | Score | Notes |
|-----------|-------|-------|
| Friction Reduction | 8/10 | Eliminates manual discovery (5/5) + affects entire codebase lifecycle (3/5) |
| Value Addition | 9/10 | Direct time savings from automated detection (4/5) + platform pattern enables 4+ future dimensions (5/5) |
| Risk Profile | 4/10 | Priority scorer change is contained (2/5) + regression risk mitigated by throttling (2/5) |
| **Decision** | **Implement** | (8 + 9) > 4 * 2 → 17 > 8 |

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. Priority scorer weights OKR alignment at ~47% — health SDs score 25-35 vs strategic SDs at 100+. Without a health dimension, "equal footing" is a fiction. **Resolved**: User chose to add health-urgency dimension to priority scorer.
  2. SD type registration requires 13 sync points — a new health type would be fragile. Consider using existing types (refactor, infrastructure) with a health origin tag instead.
  3. No hysteresis/cooldown mechanism — thresholds that fluctuate around boundaries will generate, cancel, regenerate SDs endlessly.
- **Assumptions at Risk**:
  1. The 93 tmp files are untracked (not committed dead code) — scanner needs git-awareness to distinguish working artifacts from actual dead code.
  2. "No human gatekeeping" still means LEAD phase review for every generated SD — could bottleneck with 15 health SDs.
- **Worst Case**: Scanner floods the queue with low-priority SDs that never execute, cluttering sd:next and creating a worse version of the original problem — loud, unactionable debt signals instead of silent ones.

### Visionary
- **Opportunities**:
  1. LEO becomes its own customer — the first system that governs its own technical health through the same pipeline it uses for feature work.
  2. The background-scoring-to-SD pattern is a platform primitive reusable for dependency scanning, performance regression, documentation staleness, and protocol compliance drift.
  3. Eliminates the psychological "guilt queue" — maintenance becomes data-driven, not willpower-driven.
- **Synergies**: Plugs into EVA trend detector as a new signal source, retrospective system for threshold calibration, Translation Fidelity Gate for health SD scope validation, and /learn for pattern accumulation.
- **Upside Scenario**: Within 60 days, 8-12 health SDs completed autonomously. By month 3, the pattern generalizes to 3+ additional dimensions. LEO becomes a self-maintaining system where the user calibrates thresholds rather than discovering problems.

### Pragmatist
- **Feasibility**: 4/10 (moderate-low difficulty) — most infrastructure exists
- **Resource Requirements**: 2-3 SDs (one per dimension), ~3-5 sessions. Tools: escomplex for AST analysis (free npm), Jest coverage JSON (already generated). Near-zero LLM cost — scoring is deterministic static analysis.
- **Constraints**:
  1. No scheduling mechanism — recommend hooking into sd:next as a pre-check rather than building a true daemon
  2. Threshold calibration requires iteration — reuse corrective SD generator's MIN_OCCURRENCES=2 pattern
  3. Rate limit to 2-3 health SDs per scan cycle to prevent queue flooding
- **Recommended Path**: Start with dead code/bloat scanner (simplest, most visible), wire through existing EVA pipeline, observe for a week, then build dimensions 2 and 3.

### Synthesis
- **Consensus Points**: EVA pipeline reuse makes this buildable; start with dead code; throttle initial deployment
- **Tension Points**: Priority model mismatch is the critical design risk — resolved by adding health-urgency dimension to scorer
- **Composite Risk**: Medium — technically feasible, architecturally sound, but priority scorer modification requires careful calibration

## Open Questions
1. What threshold values for each dimension trigger SD generation? (Requires baseline measurement first)
2. Should health scans run at sd:next time (pre-session hook) or on a true scheduled basis (cron)?
3. Should health SDs use existing SD types (refactor/infrastructure) with origin tagging, or register a new codebase_health type?
4. How does the health scorer handle multi-repo scanning (EHG_Engineer vs ehg app)?

## Suggested Next Steps
1. Create vision document and architecture plan for "Automated Codebase Health Scoring"
2. Build dead code/bloat scanner as the first SD — validates the full pipeline
3. Modify priority scorer to add health-urgency dimension
4. Observe generated SDs for 1 week before adding coverage and complexity dimensions
