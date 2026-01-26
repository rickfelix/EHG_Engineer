# Research Summary: EVA Autonomy Levels (L0-L4)


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-04
- **Tags**: api, security, authorization, leo

**SD Reference**: SD-RESEARCH-107 (EVA Intent-vs-Reality Analysis Model)
**Document**: EVA Autonomy Levels (L0–L4) – Safe AI Governance Model.pdf
**Pages**: 21
**Relevance**: Supporting
**Reviewed**: 2025-11-29

## Executive Summary

Defines a graduated 5-level autonomy framework for EVA, from advisory-only (L0) to full autonomous operation (L4), with safety rails, guardrails, and kill-switch mechanisms.

## Key Findings

### Autonomy Level Matrix

| Level | Name | EVA Capability | Human Role |
|-------|------|----------------|------------|
| L0 | Advisor | Analyze, recommend only | All decisions |
| L1 | Human-Approved | Propose actions, await approval | Approve/reject each action |
| L2 | Autonomous+Notify | Execute routine actions, notify | Monitor, override if needed |
| L3 | Guarded Autonomy | Operate within guardrails | Periodic review, set guardrails |
| L4 | Full Autonomy | Full venture lifecycle control | Strategic oversight only |

### Authorization Rules

```typescript
const AUTHORIZATION_MATRIX = {
  L0: { canExecute: false, canRecommend: true, requiresApproval: 'all' },
  L1: { canExecute: true, canRecommend: true, requiresApproval: 'per_action' },
  L2: { canExecute: true, canRecommend: true, requiresApproval: 'exceptions_only' },
  L3: { canExecute: true, canRecommend: true, requiresApproval: 'guardrail_breach' },
  L4: { canExecute: true, canRecommend: true, requiresApproval: 'strategic_only' }
};
```

### Safety Rails (Hard Stops)

Non-negotiable boundaries EVA cannot cross regardless of level:
- Financial commitments above threshold
- Legal/contractual decisions
- Personnel changes
- Public communications
- Security-critical operations

### Guardrails (Soft Boundaries)

Configurable per venture/stage:
- Budget variance tolerance (e.g., ±10%)
- Timeline deviation limits
- Quality metric floors
- Stakeholder notification requirements

### Kill-Switch Patterns (6 Types)

1. **Global Big Red Button**: Halt all EVA operations system-wide
2. **Per-Venture Kill**: Stop EVA for specific venture
3. **Per-Agent Kill**: Disable specific EVA capability
4. **Automatic Circuit Breaker**: Auto-halt on anomaly detection
5. **Scheduled Pause**: Planned maintenance windows
6. **Graduated Rollback**: Step down autonomy level on trigger

### Implementation Roadmap (6 Phases)

1. L0 deployment with monitoring
2. L1 pilot with select ventures
3. L2 rollout with guardrails
4. L3 for mature ventures only
5. L4 experimental/sandbox
6. Full production with all levels

## Impact on SD-RESEARCH-107

Provides the **autonomy framework** that governs intent-vs-reality actions:

| Integration Point | Description |
|-------------------|-------------|
| Confidence thresholds | Different per autonomy level |
| Auto-action permissions | Level determines what EVA can do |
| Kill-switches | Override mechanisms for drift response |
| Guardrails | Configurable boundaries for drift tolerance |

## PRD Generation Notes

- Implement autonomy level as venture configuration
- Build kill-switch UI and API endpoints
- Create guardrail configuration interface
- Design audit logging for all EVA actions by level
- Plan phased rollout starting with L0/L1

## Cross-References

- **Document 5** (Intent-vs-Reality): Drift triggers autonomy-aware responses
- **Document 6** (Security): Kill-switches as security controls
- **Document 8** (LEO v5.x): EVA triggers in Policy Integration Framework
