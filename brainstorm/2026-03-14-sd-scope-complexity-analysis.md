# Brainstorm: SD Scope Complexity Analysis

## Metadata
- **Date**: 2026-03-14
- **Domain**: Protocol
- **Phase**: Discovery
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Chairman Review**: 2 items reviewed, 2 accepted, 0 flagged, 0 research-needed
- **Source**: EVA Intake (Todoist task f079efba)

---

## Problem Statement
Nearly 4 in 10 SDs (39%) are follow-up corrections, and 22% of all SDs get cancelled. The chairman observed that features are often built but never wired together — large orchestrators create narrow children that each pass their gates independently but fail to integrate as a whole. This creates a costly rework loop where follow-up SDs are created just to fix integration gaps.

## Discovery Summary

### Data Evidence
| Metric | Value | Signal |
|--------|-------|--------|
| Total SDs | 1,000 | Large corpus |
| Follow-up/fix/corrective SDs | 391 (39%) | Nearly 4 in 10 are corrections |
| Wire/integration SDs | 122 (12%) | Significant integration rework |
| Cancelled SDs | 221 (22%) | 1 in 5 abandoned |
| Orchestrators | 204 | Complex scope is common |
| Avg children per orchestrator | 5.4 | Moderate decomposition |
| High-cancel orchestrators (>30%) | 3 | Rare but notable |

### Root Cause
Both hypotheses confirmed — they compound:
1. **Scope too large**: Orchestrators try to do too much
2. **Integration gaps**: Each child passes its gates but nobody verifies they wire together

When wiring fails, a follow-up SD gets created to fix it — this is the primary cost.

### Desired State
- Integration verification after orchestrator completion
- Smaller default scope to reduce compounding

## Analysis

### Arguments For
- 39% follow-up rate is objectively high — data-validated
- Integration verification catches wiring gaps before they become follow-up SDs
- Smaller default scope reduces the compounding problem at the source
- Data-driven approach means improvement is measurable

### Arguments Against
- Adding gates may slow down AUTO-PROCEED autonomy
- Scope heuristics are domain-specific — one rule won't fit all tracks
- Risk of false positives flagging legitimate large-scope work
- 391 follow-up SDs already exist — new rules only prevent future ones

## Team Perspectives

### Challenger
- **Blind Spots**: Trigger ordering fragility (adding more triggers to an already crowded ecosystem); scope provenance ledgers become unused compliance artifacts; soft-kill patterns harder to detect than cancellation
- **Assumptions at Risk**: Architecture phases as first-class IDs may break existing orchestrators; LEAD authority bounds could create communication bottleneck; audit trail may go unused without real-time dashboard
- **Worst Case**: Rigid authority bounds cause LEAD to stop touching scope, letting misaligned children proceed through PLAN→EXEC, creating 50 follow-up SDs instead of 3 cancellations

### Visionary
- **Opportunities**: Post-orchestrator integration verification gate (catches 12% wiring gaps); scope right-sizing protocol (auto-calculate composition risk score); chaining + integration context injection
- **Synergies**: Integration gates become EVA dimension (traceability scoring); orchestrators become reliability guarantees; supports Skunkworks R&D patterns
- **Upside Scenario**: Follow-ups drop from 39% to 22%, cancellations from 22% to 12% — 170 fewer SDs/year, 850 hours saved, 45% rework reduction

### Pragmatist
- **Feasibility**: 7/10
- **Resource Requirements**: 11-16 days across 3 phases, 3-4 weeks total
- **Constraints**: Backward compatibility (only applies to new SDs); gate scoring threshold (hard-block vs advisory); domain-specific heuristics needed per track
- **Recommended Path**: Phase 1 (Week 1): integration verification gate. Phase 2 (Week 2): scope heuristics in leo-create-sd.js. Phase 3 (Week 3): validate on 3-5 new SDs.

### Synthesis
- **Consensus**: Post-orchestrator integration verification is highest-value intervention
- **Tension**: Challenger warns about gate complexity vs Visionary's hard gates
- **Composite Risk**: Medium

## Open Questions
- What specific wiring patterns fail most often? (Need retrospective data)
- Should gates be advisory-only or hard-blocking?
- How do scope heuristics differ across A/B/C tracks?

## Suggested Next Steps
- Create vision + architecture documents for the solution
- Target: integration verification gate as Phase 1 SD
- Scope right-sizing heuristics as Phase 2 SD
