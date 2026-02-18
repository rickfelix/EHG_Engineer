# EHG Vision Gap Analysis

**Vision Document**: VISION-EHG-L1-001 (EHG-2028)
**Architecture Document**: ARCH-EHG-L1-001
**Analysis Date**: 2026-02-18
**SD**: SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-031
**Status**: Acknowledged — active corrective work in progress

---

## Purpose

This document tracks EVA vision alignment gaps identified by the scoring engine (`vision-scorer.js`) that score below the 70-point threshold. Each section documents the current score, root cause, and corrective action plan.

Pattern IDs reference the `issue_patterns` table; SD references point to `strategic_directives_v2`.

---

## HIGH-SEVERITY GAPS

### VGAP-V03 — decision_filter_engine_escalation

| Field | Value |
|---|---|
| **Vision Dimension** | decision_filter_engine_escalation |
| **Current Score** | 22/100 |
| **Threshold** | 70/100 |
| **Severity** | HIGH |
| **Occurrences** | 6 |
| **Trend** | Increasing |

**Root Cause**: EHG_Engineer's current SD workflow focuses on infrastructure tooling (LEO Protocol, EVA scoring, notification systems) without explicit Decision Filter Engine escalation patterns. The vision dimension expects the system to route decisions through a multi-stage filter before Chairman escalation — this flow is partially implicit in the chairman_notifications system but not explicitly architected.

**Current Coverage**: The `chairman_notifications` table and `sendImmediateNotification()` function provide a baseline notification pathway. The EVA Research Command (SD-MAN-INFRA-EVA-RESEARCH-COMMAND-001, PR #1396) adds structured research context to decisions.

**Corrective Action**: SD-MAN-INFRA-EVA-SCORE-COMMAND-001 (EXEC 30%) will add explicit score-gated decision routing. The corrective escalation SDs SD-CORR-VIS-2ED5AE and SD-CORR-VIS-DFB639 are in the queue to address the specific vision dimension gap. Expected score improvement: +30-40 points after completion.

---

### VGAP-V02 — chairman_governance_model

| Field | Value |
|---|---|
| **Vision Dimension** | chairman_governance_model |
| **Current Score** | 28/100 |
| **Threshold** | 70/100 |
| **Severity** | HIGH |
| **Occurrences** | 6 |
| **Trend** | Increasing |

**Root Cause**: The chairman_governance_model dimension expects a structured, explicit governance model where the Chairman's role, authority boundaries, and interaction patterns are formalized. Current infrastructure implements notifications and decision routing but lacks a formal governance protocol document or schema.

**Current Coverage**: The `chairman_preferences` table, quiet hours, and `chairman_decisions` table provide structural governance. The `/eva vision` and `/eva archplan` commands (PRs #1389, #1393) enable Chairman-reviewed vision documentation.

**Corrective Action**: The EVA Vision Governance orchestrator (SD-MAN-ORCH-EVA-VISION-GOVERNANCE-001, EXEC 32%) is the primary corrective vehicle. Children 8-13 of the orchestrator specifically address governance model formalization. Expected score improvement: +25-35 points after orchestrator completion.

---

## MEDIUM-SEVERITY GAPS

### VGAP-A03 — eva_hub_and_orchestration_model

| Field | Value |
|---|---|
| **Vision Dimension** | eva_hub_and_orchestration_model |
| **Current Score** | 44/100 |
| **Threshold** | 70/100 |
| **Severity** | MEDIUM |
| **Occurrences** | 6 |
| **Trend** | Increasing |

**Root Cause**: EVA's role as a central hub orchestrating multiple sub-agents and data flows is architecturally present but not explicitly articulated in scoring-visible artifacts (SDs, PRDs, key_changes). The scoring engine sees the components but not the hub pattern.

**Current Coverage**: SD-MAN-INFRA-EVA-RESEARCH-COMMAND-001 (merged PR #1396) implements tiered research routing through EVA. The EVA Vision Governance orchestrator (32% complete) is building the hub model.

**Referenced SD**: SD-MAN-ORCH-EVA-VISION-GOVERNANCE-001 — orchestrator children 8-13 address EVA hub architecture explicitly.

**Expected Resolution**: After EVA Vision Governance orchestrator completion, re-scoring should show 60-70/100 for this dimension.

---

### VGAP-V04 — analysisstep_active_intelligence

| Field | Value |
|---|---|
| **Vision Dimension** | analysisstep_active_intelligence |
| **Current Score** | 55/100 |
| **Threshold** | 70/100 |
| **Severity** | MEDIUM |
| **Occurrences** | 6 |
| **Trend** | Increasing |

**Root Cause**: Active intelligence in analysis steps means the system proactively generates insights, not just passively records data. The vision-scorer.js, research command, and architecture planner implement active analysis but this pattern is not consistently surfaced in SD descriptions.

**Current Coverage**: SD-MAN-INFRA-EVA-RESEARCH-COMMAND-001 (merged, tiered research with rubric routing), SD-MAN-INFRA-EVA-ARCHITECTURE-PLAN-001 (merged, architecture plan generation with ADR context).

**Referenced SD**: SD-MAN-INFRA-DYNAMIC-VISION-ALIGNMENT-001 (scoring engine, in progress by another session) — when complete, active intelligence in the scoring loop will be explicit.

**Expected Resolution**: After dynamic vision alignment scoring engine ships, re-scoring should reach 65-75/100.

---

### VGAP-A01 — stateless_shared_services

| Field | Value |
|---|---|
| **Vision Dimension** | stateless_shared_services |
| **Current Score** | 58/100 |
| **Threshold** | 70/100 |
| **Severity** | MEDIUM |
| **Occurrences** | 6 |
| **Trend** | Increasing |

**Root Cause**: The stateless_shared_services dimension expects services to be stateless and composable. EHG_Engineer's `lib/notifications/`, `lib/llm/`, and `lib/session-manager.mjs` are largely stateless, but some components (session manager, heartbeat) carry state.

**Current Coverage**: `lib/notifications/` stack (email + Telegram adapters) is fully stateless — each function call is independent. `lib/llm/client-factory.js` is a stateless factory.

**Referenced SD**: SD-MAN-INFRA-VISION-SCORE-GATE-001 (EXEC 30%) will add stateless gate checks to the handoff system, pushing this dimension higher.

**Expected Resolution**: After vision score gate ships, re-scoring should reach 65-72/100.

---

## Trajectory Summary

| Pattern | Now | Target | Corrective SD |
|---|---|---|---|
| VGAP-V03 (decision_filter) | 22 | 60+ | SD-CORR-VIS-2ED5AE, SD-MAN-INFRA-EVA-SCORE-COMMAND-001 |
| VGAP-V02 (chairman_governance) | 28 | 60+ | SD-MAN-ORCH-EVA-VISION-GOVERNANCE-001 (children 8-13) |
| VGAP-A03 (eva_hub) | 44 | 65+ | SD-MAN-ORCH-EVA-VISION-GOVERNANCE-001 |
| VGAP-V04 (active_intelligence) | 55 | 70+ | SD-MAN-INFRA-DYNAMIC-VISION-ALIGNMENT-001 |
| VGAP-A01 (stateless_services) | 58 | 70+ | SD-MAN-INFRA-VISION-SCORE-GATE-001 |

All patterns are acknowledged with active corrective work in progress. Re-scoring after each corrective SD completes will verify improvement.
