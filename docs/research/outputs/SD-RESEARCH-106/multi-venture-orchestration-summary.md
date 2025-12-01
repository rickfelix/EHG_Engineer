# Research Summary: Multi-Venture Orchestration Strategy

**SD Reference**: SD-RESEARCH-106 (LEO Protocol Evolution to v5.x)
**Document**: Multi-Venture Orchestration Strategy for AI-Run Venture Portfolio.pdf
**Pages**: 11
**Relevance**: Supporting
**Reviewed**: 2025-11-29

## Executive Summary

Defines strategy for managing 10-50 concurrent ventures through the 40-stage pipeline using Temporal.io workflow orchestration and EVA autonomy levels.

## Key Findings

### Scale Requirements

- Near-term (2025-2026): 1-10 ventures (40-400 active stage workflows)
- Future: Up to 50 ventures (2000+ concurrent workflows)
- Workflows are long-running (months), not high-volume short tasks

### Temporal.io Patterns for Multi-Venture

```typescript
// Venture workflow with autonomy-aware progression
async function ventureWorkflow(ventureId: string, autonomyLevel: AutonomyLevel) {
  for (let stage = 1; stage <= 40; stage++) {
    await executeStage(stage, ventureId);

    if (autonomyLevel >= L2_AUTONOMOUS_NOTIFY) {
      await autoAdvanceWithNotification(stage);
    } else {
      await waitForHumanApproval(stage);
    }
  }
}
```

### Resource Isolation

- Each venture runs as independent workflow
- No cross-venture state contamination
- Shared infrastructure with logical isolation

### EVA Autonomy Integration

| Level | Multi-Venture Behavior |
|-------|------------------------|
| L0 (Advisor) | EVA monitors all ventures, suggests only |
| L1 (Human-Approved) | EVA recommends, human approves per-venture |
| L2 (Autonomous+Notify) | EVA advances routine stages, notifies |
| L3 (Guarded) | EVA autonomous within guardrails |
| L4 (Full) | EVA manages venture lifecycle |

## Impact on SD-RESEARCH-106

Informs the **scalability architecture** for LEO v5.x:

- Temporal namespace per venture vs shared namespace decision
- Worker pool sizing for concurrent workflow execution
- Cross-venture reporting and dashboard requirements

## PRD Generation Notes

- Include capacity planning section
- Define monitoring dashboards for multi-venture overview
- Plan for venture priority/resource allocation

## Cross-References

- **Document 8** (LEO v5.x): Workflow engine selection rationale
- **Document 7** (EVA Autonomy): Level definitions and guardrails
