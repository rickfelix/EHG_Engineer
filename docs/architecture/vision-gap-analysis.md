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

## Trajectory Summary (LEARN-031 cohort)

| Pattern | Now | Target | Corrective SD |
|---|---|---|---|
| VGAP-V03 (decision_filter) | 22 | 60+ | SD-CORR-VIS-2ED5AE, SD-MAN-INFRA-EVA-SCORE-COMMAND-001 |
| VGAP-V02 (chairman_governance) | 28 | 60+ | SD-MAN-ORCH-EVA-VISION-GOVERNANCE-001 (children 8-13) |
| VGAP-A03 (eva_hub) | 44 | 65+ | SD-MAN-ORCH-EVA-VISION-GOVERNANCE-001 |
| VGAP-V04 (active_intelligence) | 55 | 70+ | SD-MAN-INFRA-DYNAMIC-VISION-ALIGNMENT-001 |
| VGAP-A01 (stateless_services) | 58 | 70+ | SD-MAN-INFRA-VISION-SCORE-GATE-001 |

All patterns are acknowledged with active corrective work in progress. Re-scoring after each corrective SD completes will verify improvement.

---

## LEARN-033 Cohort — Near-Zero Vision Gaps (2026-02-19)

The following gaps were detected by the `/learn` command with scores at or below 20/100. These represent the most critical alignment failures — dimensions that are nearly absent from current SD design patterns.

**SD**: SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-033
**Documented**: 2026-02-19
**Status**: Corrective actions identified

---

### VGAP-V01 — automation_by_default

| Field | Value |
|---|---|
| **Vision Dimension** | automation_by_default |
| **Current Score** | 20/100 |
| **Threshold** | 70/100 |
| **Severity** | HIGH |
| **Occurrences** | 5 (last 30 days) |
| **Trend** | Increasing |

**Root Cause**: Infrastructure SDs in EHG_Engineer are primarily described in terms of *tooling produced* (scripts, commands, protocols) rather than *manual workflows automated*. The `automation_by_default` dimension scores an SD based on whether it explicitly frames the work as replacing or eliminating human manual effort. A script that "adds a command" scores low; a script that "eliminates the need for a human to manually track X" scores high.

**Current Coverage**: SD-MAN-INFRA-PRIORITY-QUEUE-ROUTING-001 partially addresses this by automating SD queue selection. SD-LEO-INFRA-ACTIONABLE-REJECTION-TEMPLATES-001 (in progress) will automate remediation recommendations.

**Corrective Action**: Future SDs must include explicit automation framing in `description`, `key_changes`, and PRD `functional_requirements`. Template: "This SD automates `<manual_workflow>`, eliminating the need for `<human_intervention>` in `<context>`." The `/leo create` wizard should prompt for automation narrative.

**Expected Resolution**: After LEO SD creation templates include automation framing prompts, re-scoring should reach 60-70/100 as new SDs explicitly articulate the manual workflows being automated.

---

### VGAP-V06 — cli_authoritative_workflow

| Field | Value |
|---|---|
| **Vision Dimension** | cli_authoritative_workflow |
| **Current Score** | 5/100 |
| **Threshold** | 70/100 |
| **Severity** | HIGH |
| **Occurrences** | 5 (last 30 days) |
| **Trend** | Increasing |

**Root Cause**: While LEO Protocol is inherently CLI-driven (all workflow transitions use `node scripts/handoff.js`), SDs don't explicitly describe CLI as the *authoritative* interface. The scoring engine looks for language asserting that the CLI is the single source of truth for workflow execution — not a convenience wrapper but the canonical mechanism. Current SDs describe scripts as "utilities" or "helpers" rather than "authoritative workflow commands."

**Current Coverage**: The LEO handoff system (`scripts/handoff.js`) and SD queue (`npm run sd:next`) are effectively the authoritative CLI, but this posture is not articulated in SD descriptions.

**Corrective Action**: Infrastructure SDs that create CLI commands should include explicit CLI-authoritative framing: "This command is the authoritative mechanism for `<workflow>`. No alternative execution path exists." The SD description template should include a "CLI Authority" field. SD-LEO-INFRA-ACTIONABLE-REJECTION-TEMPLATES-001 should frame its templates as authoritative CLI output.

**Expected Resolution**: After SD description templates incorporate CLI-authority language, re-scoring should reach 55-65/100 for future infrastructure SDs.

---

### VGAP-V07 — chairman_dashboard_scope

| Field | Value |
|---|---|
| **Vision Dimension** | chairman_dashboard_scope |
| **Current Score** | 5/100 |
| **Threshold** | 70/100 |
| **Severity** | HIGH |
| **Occurrences** | 5 (last 30 days) |
| **Trend** | Increasing |

**Root Cause**: The `chairman_dashboard_scope` dimension evaluates whether SDs produce data, metrics, or controls that are surfaced in the Chairman Dashboard (EHG app, `src/components/chairman-v2/`). Infrastructure SDs — which dominate recent work — produce tooling artifacts (scripts, DB schema, CLI commands) that have no visual representation in the dashboard. The scoring engine finds no dashboard component references in these SDs.

**Current Coverage**: SD-MAN-ORCH-EVA-VISION-GOVERNANCE-001 has children targeting chairman dashboard features. SD-EVA-FEAT-NOTIFICATION-001 (4 commits) added notification infrastructure, some of which surfaces in the chairman UI.

**Corrective Action**: When infrastructure SDs produce data that *could* be displayed (e.g., SD queue metrics, vision scores, pattern resolution counts), they should explicitly reference dashboard integration as a downstream goal, even if not implemented in the current SD. The EVA Vision Governance orchestrator children that focus on dashboard features are the primary corrective vehicle. Expected SDs: `SD-MAN-ORCH-EVA-VISION-GOVERNANCE-001-K` and later children targeting chairman dashboard metrics.

**Expected Resolution**: After EVA Vision Governance orchestrator dashboard children ship, re-scoring should reach 40-55/100. Achieving 70+ requires dedicated chairman dashboard SDs that explicitly connect infrastructure data to UI widgets.

---

### VGAP-A07 — chairman_governance_gatekeeping

| Field | Value |
|---|---|
| **Vision Dimension** | chairman_governance_gatekeeping |
| **Current Score** | 10/100 |
| **Threshold** | 70/100 |
| **Severity** | HIGH |
| **Occurrences** | 5 (last 30 days) |
| **Trend** | Increasing |

**Root Cause**: The `chairman_governance_gatekeeping` dimension expects the Chairman to be an explicit approval gate in key system workflows — not just a notification recipient. Current infrastructure SDs implement Chairman *notification* (EVA sends alerts) but not Chairman *gatekeeping* (EVA pauses until Chairman approves). The LEO Protocol has human pause points but they are not framed as Chairman governance gates in the scoring-visible artifacts.

**Current Coverage**: The `chairman_decisions` table exists for recording decisions. SD-MAN-ORCH-EVA-VISION-GOVERNANCE-001 (EXEC 32%) includes children targeting governance formalization. The `/eva vision` command creates Chairman-reviewable documents.

**Corrective Action**: SDs that create system-altering workflows should include an explicit "Chairman Approval Gate" in their implementation approach. This means: EVA proposes → Chairman reviews → Chairman approves → execution proceeds. The `chairman_decisions` table should be the mechanism. SD-MAN-ORCH-EVA-VISION-GOVERNANCE-001 children 8-13 are the primary corrective vehicle; they should explicitly implement the gatekeeping pattern, not just documentation.

**Expected Resolution**: After EVA Vision Governance orchestrator children 8-13 implement explicit Chairman approval gates in at least 2 workflows, re-scoring should reach 40-55/100. Achieving 70+ requires Chairman gatekeeping to be the standard pattern for all consequential EVA decisions.

---

### VGAP-V08 — unlimited_compute_posture

| Field | Value |
|---|---|
| **Vision Dimension** | unlimited_compute_posture |
| **Current Score** | 8/100 |
| **Threshold** | 70/100 |
| **Severity** | HIGH |
| **Occurrences** | 5 (last 30 days) |
| **Trend** | Increasing |

**Root Cause**: The `unlimited_compute_posture` dimension scores whether SDs embrace elastic, on-demand AI compute rather than imposing artificial resource limits. Current infrastructure SDs often include timeouts, rate limits, and single-model constraints. These are framed as engineering constraints rather than temporary guardrails on the path to unlimited compute. The scoring engine interprets explicit limits as anti-patterns to the unlimited compute vision.

**Current Coverage**: The LLM client factory (`lib/llm/client-factory.js`) enables model routing but is configured with specific model tiers. The local LLM integration (Ollama `qwen3-coder:30b`) provides compute-local options.

**Corrective Action**: SDs that invoke AI models should frame timeout and limit configurations as *current* constraints with explicit notes about the unlimited compute target: "Current rate limit: X req/min — target: unlimited via elastic provisioning." The `USE_LOCAL_LLM=true` infrastructure should be framed as compute-local unlimited posture. Future SDs should include "unlimited compute pathway" in their architecture section when they involve AI workloads.

**Expected Resolution**: After SDs framing AI workloads with unlimited compute language, re-scoring should reach 40-55/100. Achieving 70+ requires dedicated infrastructure for auto-scaling AI compute (e.g., Anthropic API with no artificial throttling, local model auto-scaling).

---

## Trajectory Summary (LEARN-033 cohort)

| Pattern | Now | Target | Corrective Vehicle |
|---|---|---|---|
| VGAP-V01 (automation_by_default) | 20 | 60+ | SD creation template update + SD-LEO-INFRA-ACTIONABLE-REJECTION-TEMPLATES-001 |
| VGAP-V06 (cli_authoritative_workflow) | 5 | 55+ | SD description template update for CLI-authority framing |
| VGAP-V07 (chairman_dashboard_scope) | 5 | 40+ | SD-MAN-ORCH-EVA-VISION-GOVERNANCE-001 dashboard children |
| VGAP-A07 (chairman_governance_gatekeeping) | 10 | 40+ | SD-MAN-ORCH-EVA-VISION-GOVERNANCE-001 children 8-13 |
| VGAP-V08 (unlimited_compute_posture) | 8 | 40+ | SD AI workload framing convention + elastic compute infrastructure |

All 5 patterns acknowledged with corrective actions identified. Re-scoring after EVA Vision Governance orchestrator completion will verify improvement.
