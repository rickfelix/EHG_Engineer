---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# LEO Protocol Enhancement Proposal



## Table of Contents

- [Metadata](#metadata)
- [Executive Summary](#executive-summary)
- [Part 1: Current State Analysis](#part-1-current-state-analysis)
  - [1.1 What LEO Protocol Does Well](#11-what-leo-protocol-does-well)
  - [1.2 Identified Gaps](#12-identified-gaps)
  - [1.3 Current Playwright Configuration](#13-current-playwright-configuration)
- [Part 2: Research Sources](#part-2-research-sources)
  - [2.1 Source Summary Table](#21-source-summary-table)
  - [2.2 Key Research Insights](#22-key-research-insights)
- [Part 3: Proposed Patches](#part-3-proposed-patches)
  - [3.1 Patch Overview](#31-patch-overview)
  - [3.2 Patch Details](#32-patch-details)
- [Part 4: Implementation Roadmap](#part-4-implementation-roadmap)
  - [4.1 Recommended Sequence (Updated per Cross-AI Review v1.1)](#41-recommended-sequence-updated-per-cross-ai-review-v11)
  - [4.2 Minimum Viable Playwright Changes (Storage-Conscious per Cross-AI Review)](#42-minimum-viable-playwright-changes-storage-conscious-per-cross-ai-review)
- [Part 5: Risk Analysis](#part-5-risk-analysis)
  - [5.1 Risks of Implementing](#51-risks-of-implementing)
  - [5.2 Risks of NOT Implementing](#52-risks-of-not-implementing)
- [Part 6: Questions for Reviewers](#part-6-questions-for-reviewers)
  - [For Anti-Gravity / OpenAI Codex](#for-anti-gravity-openai-codex)
- [Appendix A: Anti-Patterns to Avoid](#appendix-a-anti-patterns-to-avoid)
- [Appendix B: Glossary](#appendix-b-glossary)
- [Document History](#document-history)
- [Appendix E: "LEO 4.4 Lite" Pareto Sprint (v1.4 - FINAL)](#appendix-e-leo-44-lite-pareto-sprint-v14---final)
  - [Overview](#overview)
  - [Final Sprint Plan (5 Days)](#final-sprint-plan-5-days)
  - [Anti-Gravity's Systemic Improvements (v1.4 Additions)](#anti-gravitys-systemic-improvements-v14-additions)
  - [Critical Safety Addition (Anti-Gravity)](#critical-safety-addition-anti-gravity)
  - [Deliverables Checklist](#deliverables-checklist)
  - [Files to Modify](#files-to-modify)
  - [What's Deferred (and Why It's OK)](#whats-deferred-and-why-its-ok)
  - [Success Metrics](#success-metrics)
  - [Anti-Gravity's Risk Assessment](#anti-gravitys-risk-assessment)
- [Appendix C: Cross-AI Review Synthesis (v1.1)](#appendix-c-cross-ai-review-synthesis-v11)
  - [Reviewers](#reviewers)
  - [Consensus Findings](#consensus-findings)
  - [Accepted Changes (Incorporated in v1.1)](#accepted-changes-incorporated-in-v11)
  - [Enforcement Architecture (Codex Request)](#enforcement-architecture-codex-request)
  - [Resolved Questions (Finalized 2025-12-18)](#resolved-questions-finalized-2025-12-18)
- [Appendix D: Reviewer Comments (Verbatim Excerpts)](#appendix-d-reviewer-comments-verbatim-excerpts)
  - [Codex Key Quotes](#codex-key-quotes)
  - [Anti-Gravity Key Quotes](#anti-gravity-key-quotes)

## Metadata
- **Category**: Protocol
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-04
- **Tags**: database, api, testing, e2e

**Document Purpose**: Strategic research summary for cross-AI review
**Author**: Claude Code (Research Lead)
**Date**: 2025-12-18
**Current Protocol Version**: LEO v4.3.3
**Target Protocol Version**: LEO v4.4.x / v4.5.x

---

## Executive Summary

This document proposes enhancements to the LEO Protocol (LEAD → PLAN → EXEC), a database-first AI development workflow with quality gates and sub-agent orchestration. The recommendations are based on research from 14 authoritative sources covering browser automation, agent safety, governance, and evaluation practices from 2025.

**Core Thesis**: LEO currently excels at *verification* (did it pass?) but lacks *learning* (why did it pass/fail, and how do we improve?). The proposed patches close immediate safety and reproducibility gaps, then establish infrastructure for continuous self-improvement.

**Reviewers are asked to critique**:
1. Whether the patch prioritization is correct
2. Whether the learning loop design is sound
3. What risks or blind spots exist in this proposal

---

## Part 1: Current State Analysis

### 1.1 What LEO Protocol Does Well

| Capability | Implementation | Strength |
|------------|----------------|----------|
| **Phase separation** | LEAD → PLAN → EXEC with mandatory handoffs | Clear accountability, prevents premature implementation |
| **Quality gates** | Gates 0, 1, 2, 2.5, 3, Q with scoring | Multi-layer verification before progression |
| **Sub-agent orchestration** | 7 active sub-agents (testing, database, security, etc.) | Specialized expertise with structured outputs |
| **Database-first** | All artifacts in Supabase tables, not markdown files | Single source of truth, queryable, auditable |
| **Test evidence capture** | Custom Playwright reporter writes to `test_runs`/`test_results` | Automatic ingestion with user story mapping |
| **AI quality scoring** | Russian Judge rubrics for SD/PRD/User Story quality | Catches boilerplate and placeholder text |

### 1.2 Identified Gaps

| Gap | Current Behavior | Risk |
|-----|------------------|------|
| **No proof artifacts** | Gate 2.5 checks UI parity but accepts agent's assertion | Agent can claim verification without proof |
| **No input contracts for tools** | Sub-agents have output schemas but tools have no input validation | Tool misuse, injection, dangerous combinations |
| **Binary permissions** | Tools are allowed or blocked, no graduated approval | Can't distinguish read vs. destructive operations |
| **Artifacts only on failure** | Traces/screenshots captured only when tests fail | Can't reproduce passing tests; no baseline for comparison |
| **No hallucination detection** | Sub-agent outputs accepted without checking file/table references | Agent can reference non-existent code or schema |
| **No learning loop** | Evidence captured but never analyzed for patterns | System doesn't improve from experience |

### 1.3 Current Playwright Configuration

```javascript
// Key settings from playwright.config.js
use: {
  trace: 'on-first-retry',        // Gap: No trace for first failure or passing tests
  video: 'retain-on-failure',     // Gap: No video for passing tests
  screenshot: 'only-on-failure',  // Gap: No "before" state captured
  // Missing: recordHar, accessibility snapshots, console logs
}
```

**Assessment**: ~60% of needed artifact capture is in place. Main gaps are capture strategy (too conservative) and missing evidence types.

---

## Part 2: Research Sources

### 2.1 Source Summary Table

| # | Source | Type | Key Finding | Relevance |
|---|--------|------|-------------|-----------|
| 1 | [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp) | Official | Accessibility tree enables deterministic, LLM-friendly verification without vision models | Evidence Pack design |
| 2 | [Playwright Agents System](https://playwright.dev/docs/test-agents) | Official | Planner → Generator → Healer chain provides self-healing tests | Future: auto-repair |
| 3 | [OWASP LLM Top 10 2025](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) | Security | Prompt injection remains #1 vulnerability; multi-layer defense required | Input validation |
| 4 | [OWASP Agentic AI Top 10](https://genai.owasp.org/2025/12/09/owasp-genai-security-project-releases-top-10-risks-and-mitigations-for-agentic-ai-security/) | Security | Tool misuse (ASI02), privilege abuse (ASI03), memory poisoning (ASI06) are critical | Escalation Ladder |
| 5 | [MCP Spec June 2025](https://modelcontextprotocol.io/specification/2025-06-18) | Official | OAuth resource servers, RFC 8707 resource indicators prevent token mis-redemption | Tool Contracts |
| 6 | [Microsoft MCP Security](https://blogs.windows.com/windowsexperience/2025/05/19/securing-the-model-context-protocol-building-a-safer-agentic-future-on-windows/) | Security | Tool poisoning, XPIA, credential leakage identified as primary threats | Defense patterns |
| 7 | [Azure AI Agent Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) | Official | Supervisor pattern provides reasoning transparency and traceability | Orchestration validation |
| 8 | [Google ADK Multi-Agent](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/) | Official | Agents-as-tools enables hierarchical delegation without losing control | Sub-agent design |
| 9 | ["AI Agents That Matter"](https://arxiv.org/html/2407.01502v1) | Research | Agent evaluations lack reproducibility; errors inflate accuracy by 21%+ | Replayable Artifacts |
| 10 | [MCPEval Framework](https://arxiv.org/html/2507.12806v1) | Research | MCP-based automated evaluation standardizes metrics, eliminates manual effort | Evidence automation |
| 11 | [Anthropic Safeguards](https://www.anthropic.com/news/building-safeguards-for-claude) | Security | Hierarchical summarization detects aggregate misuse; hallucination limits autonomous attacks | Output Validation |
| 12 | [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) | Official | CodeInterpreterTool sandboxing, guardrails for I/O validation | Tool Contracts |
| 13 | [MAIF Artifact-Centric](https://arxiv.org/html/2511.15097) | Research | Persistent, verifiable artifacts enable audit trails and EU AI Act compliance | Learning Loop |
| 14 | [Atlassian Flakinator](https://www.atlassian.com/blog/atlassian-engineering/taming-test-flakiness-how-we-built-a-scalable-tool-to-detect-and-manage-flaky-tests) | Practitioner | 21% of build failures from flakiness; statistical detection + quarantine works | Flakiness handling |

### 2.2 Key Research Insights

**Insight 1: Agents Lie About Success** (Sources 11, 6)
> In the November 2025 Anthropic cyber attack, the attacker's agent "claimed to have obtained credentials that did not work and identified 'critical discoveries' that were actually publicly available information."

*Implication*: Agent self-reports of verification cannot be trusted. External, tool-based proof is required.

**Insight 2: Reproducibility Is Broken** (Source 9)
> "Pervasive shortcomings in the reproducibility of WebArena and HumanEval evaluations... errors inflate accuracy estimates and lead to overoptimism about agent capabilities."

*Implication*: Test results without full environment/trace capture are unreliable. Can't distinguish real bugs from flakiness.

**Insight 3: Least Agency Principle** (Source 4)
> "If an agent's role is to summarize, it should not have delete permissions... Deploy minimal agentic behavior needed for the task."

*Implication*: Binary allow/block permissions are insufficient. Need graduated approval based on action risk.

**Insight 4: Learning Requires Artifacts** (Source 13)
> "Current AI systems operate on opaque data structures that lack the audit trails, provenance tracking, or explainability required by emerging regulations."

*Implication*: Evidence capture is necessary but not sufficient. Artifacts must feed back into improvement loops.

---

## Part 3: Proposed Patches

### 3.1 Patch Overview

| Patch | Name | Gap Addressed | Complexity | Dependencies |
|-------|------|---------------|------------|--------------|
| **1** | Browser Evidence Pack | No proof artifacts | Medium | Existing Playwright MCP |
| **2** | Tool Contract Registry | No input validation/risk classification | Medium | None |
| **3** | Escalation Ladder | Binary permissions | Medium | Patch 2 (risk levels) |
| **4** | Replayable Test Artifacts | Artifacts only on failure | Low | Existing LEO reporter |
| **5** | Sub-Agent Output Validation | No hallucination detection | Low | None |
| **6** | Learning Loop | No self-improvement | High | Patches 1, 4, 5 |

### 3.2 Patch Details

#### PATCH 1: Browser Evidence Pack

**Problem**: Gate 2.5 checks UI parity but relies on agent assertion. No immutable proof exists.

**Solution**: Require a bundle of browser artifacts for every user story verification:
- Before/after screenshots
- Accessibility tree snapshot (deterministic, LLM-friendly)
- Console log capture (proves no JS errors)
- Network HAR (optional, for API debugging)
- SHA256 hash of bundle (immutability)

**Gate Change**: Gate 2.5 requires evidence pack ID in handoff artifact.

**Why This Works**: Agent can no longer say "I verified it" without producing the verification. The hash prevents tampering.

---

#### PATCH 2: Tool Contract Registry

**Problem**: Sub-agents have output schemas but tools have no input constraints, risk levels, or combination analysis.

**Solution**: Registry where every tool has:
- Input schema with validation rules
- Output size limits (prevents exfiltration)
- Risk level classification (read_only → low → medium → high → blocked)
- Redaction rules for sensitive data in logs
- Dangerous combination flags (e.g., file_read + network_call = exfiltration risk)

**Why This Works**: Enables graduated governance (Patch 3), prevents tool misuse (OWASP ASI02), aligns with MCP specification.

---

#### PATCH 3: Escalation Ladder

**Problem**: Current system is binary (allowed/blocked). Can't distinguish `browser_click` on "View Details" vs. "Delete All".

**Solution**: 4-level escalation:
- **Level 0 (Auto-approved)**: Read operations, sandboxed actions
- **Level 1 (Logged)**: Low-risk mutations, proceed but record
- **Level 2 (Human approval)**: High-risk changes, wait for confirmation
- **Level 3 (Blocked)**: Destructive operations, never allowed (kill switch)

**Why This Works**: OWASP mandates graduated permissions. Enables nuanced control without stopping every action.

---

#### PATCH 4: Replayable Test Artifacts

**Problem**: LEO reporter captures results but not reproduction state. Can't distinguish real bugs from flakiness.

**Solution**: For every test run, capture:
- Environment snapshot (versions, viewport, base URL, OS)
- Database seed state (which test users, what data)
- Execution trace (every action with timing)
- Playwright trace file (enables Trace Viewer replay)
- Flakiness score (statistical analysis over many runs)

**Auto-quarantine**: Tests with >5% flakiness quarantined from blocking CI.

**Why This Works**: Directly addresses the reproducibility gap from research. Enables post-hoc investigation.

---

#### PATCH 5: Sub-Agent Output Validation

**Problem**: Sub-agent verdicts accepted without checking if referenced files/tables/code exist.

**Solution**: Validation layer after every sub-agent execution:
1. **File reference check**: Every path mentioned must exist (`fs.existsSync`)
2. **Database reference check**: Every table name must be in schema
3. **Code snippet check**: Code must parse without syntax errors
4. **Confidence calibration**: Track outcomes vs. confidence to detect overconfidence

**Remediation**: Failed validation triggers re-execution with clarification, or escalation if persistent.

**Why This Works**: Catches hallucinations before they propagate. Low complexity, immediate safety benefit.

---

#### PATCH 6: Learning Loop (R&D / v4.5+)

**Problem**: Evidence is captured for verification but never analyzed for improvement. System doesn't learn.

**Solution**: Feedback pipeline that aggregates data and updates LEO components:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Evidence Data   │────▶│ Pattern Analysis│────▶│ Component Update│
│ - Evidence packs│     │ - Selector stats│     │ - Skill updates │
│ - Test results  │     │ - Flakiness     │     │ - Gate tuning   │
│ - Sub-agent     │     │ - Confidence    │     │ - Prompt adjust │
│   outputs       │     │   calibration   │     │ - Anti-patterns │
│ - Retrospectives│     │ - Failure modes │     │ - Thresholds    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Learning Mechanisms**:

1. **Selector Reliability**: Which selectors cause failures? Update `test-selectors` skill with data.
2. **Confidence Calibration**: Does 85% confidence actually mean 85% success? Recalibrate sub-agents.
3. **Flakiness Patterns**: What do flaky tests have in common? Auto-generate anti-patterns.
4. **Gate Effectiveness**: Did passing Gate 2.5 predict success? Adjust thresholds.

**Integration with Retrospectives**:
- Current: Retrospectives are human-written, manually extracted to skills
- Proposed: System auto-suggests learnings based on data patterns
- Human reviews and approves before skill/gate updates

**New Table**: `learning_insights`
```sql
CREATE TABLE learning_insights (
  id UUID PRIMARY KEY,
  insight_type TEXT, -- 'selector_pattern', 'confidence_calibration', 'flakiness', 'gate_effectiveness'
  pattern TEXT,
  evidence_count INTEGER,
  confidence FLOAT,
  recommendation TEXT,
  source_sds UUID[], -- Which SDs contributed to this insight
  applied_at TIMESTAMP, -- When incorporated into skills/gates
  applied_to TEXT -- Which skill/gate was updated
);
```

**Why This Works**: Closes the loop from evidence → learning → improvement. Aligns with MAIF artifact-centric paradigm. Makes LEO genuinely self-improving rather than static.

---

## Part 4: Implementation Roadmap

### 4.1 Recommended Sequence (Updated per Cross-AI Review v1.1)

| Phase | Patches | Deliverables | Effort |
|-------|---------|--------------|--------|
| **Phase 1A** | 1+4 (merged) | Evidence Capture: Playwright config + Evidence Pack manifest + Network mocks + LEO reporter enhancement | 2 sprints |
| **Phase 1B** | 5 | Sub-Agent Output Validation: L1+L2 hallucination detection | 1 sprint |
| **Phase 2** | 2 | Tool Contract Registry: Schema + validation middleware | 1.5 sprints |
| **Phase 3** | 3 | Escalation Ladder: 4-level approval + audit logging | 1 sprint |
| **Phase 4** | 6 | Learning Loop: Insights table + PR generation + human review workflow | 2 sprints |

**Key Change**: Patches 1 & 4 merged per Anti-Gravity recommendation ("avoid rewriting the reporter twice")

### 4.2 Minimum Viable Playwright Changes (Storage-Conscious per Cross-AI Review)

To support Patches 1 and 4, the Playwright configuration needs:

```javascript
use: {
  // ALWAYS: Trace (essential for replay, reasonable size ~5-20MB)
  trace: 'on',                    // Was: 'on-first-retry'

  // CONDITIONAL: Video only on failure (large files ~50-200MB)
  video: process.env.CI ? 'retain-on-failure' : 'on-first-retry',

  // CHECKPOINTS: Screenshots at key moments via explicit calls
  screenshot: 'only-on-failure',  // Plus page.screenshot() at test checkpoints

  // FILTERED: HAR only for API calls
  recordHar: {
    path: 'test-results/har/',
    mode: 'minimal',
    urlFilter: '**/api/**',
  },
}
```

Plus test fixtures for:
- Console log capture (`page.on('console')`, `page.on('pageerror')`)
- Accessibility snapshots (`page.accessibility.snapshot()`)
- Evidence Pack manifest generation

**Retention Policy**:
- Passing test artifacts: 48 hours
- Failing test artifacts: 30 days
- Evidence Packs: 7 days (passing), 90 days (failing)

**Effort**: ~6-8 hours for config + fixtures + manifest generation.

---

## Part 5: Risk Analysis

### 5.1 Risks of Implementing

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Storage bloat** | High | Medium | Artifact retention policy (30 days), compression, sampling |
| **Performance overhead** | Medium | Low | Async capture, parallel evidence bundling |
| **False confidence** | Medium | High | Learning loop must include human review before updates |
| **Over-engineering** | Medium | Medium | Start with MVP; don't build full learning loop until Patches 1-5 proven |

### 5.2 Risks of NOT Implementing

| Risk | Likelihood | Impact | Source |
|------|------------|--------|--------|
| **Agent hallucinations undetected** | High | High | Anthropic attack showed agents fabricate results |
| **Flaky tests waste time** | High | Medium | Atlassian: 21% of build failures from flakiness |
| **Tool misuse exploitation** | Medium | High | OWASP ASI02: legitimate tools bent to destructive ends |
| **No improvement over time** | Certain | High | Without learning loop, same mistakes repeat |

---

## Part 6: Questions for Reviewers

### For Anti-Gravity / OpenAI Codex

1. **Patch Prioritization**: Is the recommended sequence (4, 5 → 1, 2 → 3 → 6) correct? Should any patch be higher/lower priority?

2. **Learning Loop Design**: Is the feedback mechanism (aggregate → analyze → update skills/gates) sound? What could go wrong?

3. **Evidence Pack Scope**: Is the proposed bundle (screenshots, a11y, console, HAR) sufficient? What's missing?

4. **Escalation Ladder Levels**: Are 4 levels (auto → log → approve → block) the right granularity? Too many? Too few?

5. **Hallucination Detection**: Is file/table/code reference checking sufficient? What other validation would help?

6. **Integration with Retrospectives**: How should the learning loop interact with human-written retrospectives? Auto-suggest only, or auto-apply with human veto?

7. **Blind Spots**: What risks or failure modes are not addressed in this proposal?

8. **Alternative Approaches**: Are there better solutions to any of these problems that the research missed?

---

## Appendix A: Anti-Patterns to Avoid

Based on research, these patterns should NOT be implemented:

| Anti-Pattern | Why It's Bad | Source |
|--------------|--------------|--------|
| Blind trust in browser actions | Actions may fail silently | Playwright MCP |
| Pixel-based screenshot verification | Fragile, slow, requires vision models | Playwright MCP |
| Task decomposition without context isolation | Attackers break attacks into innocent sub-tasks | Anthropic |
| Combining tools without permission analysis | Benign tools combined can exfiltrate data | Red Hat MCP |
| Shared memory across sessions | Memory poisoning persists | OWASP ASI06 |
| Single-run test evaluation | Flaky tests inflate accuracy | "AI Agents That Matter" |
| Hardcoded timeouts | Race conditions, flakiness | Atlassian |
| OAuth tokens without resource indicators | Token mis-redemption | MCP Spec 2025 |
| Agent execution without kill switch | Runaway damage | OWASP |
| Trusting agent self-reports | Agents hallucinate success | Anthropic |

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **LEO Protocol** | LEAD → PLAN → EXEC workflow for AI-assisted development |
| **Evidence Pack** | Immutable bundle of browser artifacts proving verification occurred |
| **Tool Contract** | Schema defining tool inputs, outputs, risk level, and constraints |
| **Escalation Ladder** | Graduated approval system based on action risk |
| **Flakiness Score** | Statistical measure of test reliability across runs |
| **Learning Loop** | Feedback mechanism from evidence → pattern analysis → component updates |
| **Gate** | Quality checkpoint that must pass before phase transition |
| **Sub-Agent** | Specialized AI component (testing, database, security) with structured output |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-18 | Initial research and proposal |
| 1.1 | 2025-12-18 | Incorporated cross-AI review feedback (Codex + Anti-Gravity) |
| 1.2 | 2025-12-18 | Resolved open questions, added network mocks to Phase 1A |
| 1.3 | 2025-12-18 | Added "LEO 4.4 Lite" Pareto sprint (Anti-Gravity approved with reservations) |
| **1.4** | 2025-12-18 | **FINALIZED** - Added Anti-Gravity's systemic improvements (DB audit logging, IPC robustness) |

---

## Appendix E: "LEO 4.4 Lite" Pareto Sprint (v1.4 - FINAL)

### Overview

Pareto analysis identified that **20% of the proposed work delivers 80% of the value**. This "Lite" sprint is the recommended first implementation, approved by Anti-Gravity with reservations.

**Verdict**: Agree with Reservations (Proceed, but add trace cleanup + DB audit logging)

### Final Sprint Plan (5 Days)

| Day | Deliverable | Effort | Value | Notes |
|-----|-------------|--------|-------|-------|
| **1** | Playwright config (`trace: 'on'` + `recordHar: minimal`) + Console fixture | 1 day | 40% | HAR is "free" effort, adds API debugging |
| **2** | Trace cleanup script + Evidence Pack manifest generator | 1 day | 15% | **CRITICAL**: Prevents disk explosion |
| **3** | L1 Hallucination check (file existence) | 0.5 day | 10% | `fs.existsSync()` |
| **3** | L2 Hallucination check (symbol grep) | 0.5 day | 10% | Regex/grep based (naive but catches 80%) |
| **4** | **DB Audit Logging fix** (auto-run-subagents.js) | 0.5 day | **15%** | **CRITICAL**: Fixes database-first principle break |
| **4** | File-based IPC for sub-agents | 0.5 day | 5% | Replaces fragile stdout regex parsing |
| **5** | Artifact cleaner npm script + integration testing | 0.5 day | 5% | Quality of life + validation |
| | **Total** | **5 days** | **100%** | |

### Anti-Gravity's Systemic Improvements (v1.4 Additions)

#### 1. DB Audit Logging Fix (CRITICAL)

**Finding**: `scripts/auto-run-subagents.js` (lines 37-69) runs sub-agents via `execAsync` and parses stdout, but **never writes results to `subagent_activations` table**.

**Risk**: Hallucination checks pass in console but leave no DB record. Gate 2.5 fails because it looks for DB records.

**Fix**: Update `auto-run-subagents.js` to INSERT into `subagent_activations`:
```javascript
await supabase.from('subagent_activations').insert({
  sd_id: sdId,
  subagent_code: agentCode,
  status: 'completed',
  execution_results: parsedResult,
  triggered_by: 'auto-run-subagents',
  completed_at: new Date().toISOString()
});
```

**Effort**: 1 hour (~20 lines)

#### 2. File-based IPC (Robustness)

**Finding**: `auto-run-subagents.js` (line 48) uses `stdout.match(/\{[\s\S]*\}/)` to parse results.

**Risk**: If sub-agent prints debug JSON or library warnings, parsing breaks. "Fragile Scraping".

**Fix**: Standardize sub-agents to accept `--outfile` argument:
```bash
node scripts/my-agent.js --outfile=./temp/result.json
```
Orchestrator reads file instead of stdout. Guarantees 100% JSON validity.

**Effort**: 2 hours

#### 3. Artifact Cleaner Script (Quality of Life)

**Finding**: `.gitignore` ignores `test-results/` but no cleanup mechanism exists.

**Fix**: Add npm script:
```json
"clean:artifacts": "rimraf test-results/artifacts/* && rimraf test-results/trace/*"
```

**Effort**: 15 minutes

### Critical Safety Addition (Anti-Gravity)

> "The Trap: Enabling `trace: 'on'` for all tests (passing and failing) is dangerous without a cleanup policy. A 100MB trace x 100 tests = 10GB per run. This will crash your CI pipeline within a week."

**Required**: Auto-delete passing traces > 24 hours

### Deliverables Checklist

```
□ Day 1: Playwright Config + Console Fixture
  □ playwright.config.js
    □ trace: 'on'
    □ recordHar: { path: 'test-results/har/', mode: 'minimal', urlFilter: '**/api/**' }
  □ tests/e2e/fixtures/console-capture.ts
    □ page.on('console') handler
    □ page.on('pageerror') handler
    □ Attach to test results

□ Day 2: Trace Cleanup + Evidence Pack
  □ scripts/cleanup-passing-traces.js
    □ Delete traces for passed tests > 24h
    □ Run as post-test hook or cron
  □ lib/evidence/manifest-generator.js
    □ JSON schema implementation
    □ SHA256 hash generation
    □ Required fields validation

□ Day 3: Hallucination Detection
  □ lib/validation/hallucination-check.js
    □ L1: fs.existsSync() for file paths
    □ L2: Regex grep for symbols (function/class/const)
    □ Integration with execute-subagent.js

□ Day 4: DB Audit Logging + IPC Fix (CRITICAL)
  □ scripts/auto-run-subagents.js
    □ INSERT into subagent_activations table on completion
    □ Add --outfile argument support for sub-agents
    □ Read result from file instead of stdout regex

□ Day 5: Cleanup + Integration Testing
  □ package.json
    □ Add "clean:artifacts" npm script
  □ Integration testing
    □ Verify traces captured for all tests
    □ Verify DB records created for sub-agent runs
    □ Verify hallucination check blocks invalid references
```

### Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `playwright.config.js` | Add `trace: 'on'`, `recordHar` config | Day 1 |
| `scripts/auto-run-subagents.js` | **DB audit logging** + file-based IPC | Day 4 (CRITICAL) |
| `lib/reporters/leo-playwright-reporter.js` | Enhance to generate Evidence Pack manifest | Day 2 |
| `scripts/execute-subagent.js` | Add hallucination validation before accepting output | Day 3 |
| `package.json` | Add `clean:artifacts` script | Day 5 |
| **NEW**: `tests/e2e/fixtures/console-capture.ts` | Console/error capture fixture | Day 1 |
| **NEW**: `scripts/cleanup-passing-traces.js` | Trace retention policy enforcement | Day 2 |
| **NEW**: `lib/evidence/manifest-generator.js` | Evidence Pack manifest creation | Day 2 |
| **NEW**: `lib/validation/hallucination-check.js` | L1+L2 reference validation | Day 3 |

### What's Deferred (and Why It's OK)

| Item | Risk Level | Rationale |
|------|------------|-----------|
| Tool Registry | Low | "Sub-agents are trusted internal scripts" |
| Escalation Ladder | Low | "No destructive agents currently active" |
| Learning Loop | Medium | "System won't auto-improve, but verifying > improving" |
| Network Mocks | Low | HAR Lite + Trace covers 90% of debugging |
| DOM Snapshots | Low | "Trace viewer provides DOM snapshot equivalent" |

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Trace coverage | 100% of test runs | All tests produce traces |
| Console error detection | >90% of JS errors caught | Compare against manual audit |
| Hallucination detection rate | >80% of false refs caught | Sample validation of sub-agent outputs |
| Storage growth | <500MB/day retained | Monitor test-results/ directory |
| Time-to-reproduce | <10 min for any failure | Track from report to replay |

### Anti-Gravity's Risk Assessment

> "Since your sub-agents are internal scripts, they are 'trusted code'. They aren't arbitrary LLMs executing random bash commands. Graduated permissions are critical only when you start allowing 'Open Ended' agents."

**Conclusion**: Governance layers (Tool Contracts, Escalation Ladder) can safely wait until after the Lite sprint proves the evidence capture foundation.

---

## Appendix C: Cross-AI Review Synthesis (v1.1)

### Reviewers
- **OpenAI Codex**: Focus on implementation details, enforcement architecture, cost/storage
- **Anti-Gravity**: Focus on codebase verification, strategic critique, semantic validation

### Consensus Findings

Both reviewers independently identified:

1. **Core thesis validated**: "Verification without learning" framing is accurate and actionable
2. **Patch sequence mostly correct**: Minor adjustment to merge Patches 1 & 4
3. **Storage explosion risk**: "Always-on" video/trace will generate GBs quickly
4. **Learning loop needs governor**: Auto-updates risk model collapse and policy drift
5. **Evidence Pack needs schema**: Without manifest, pack becomes "folder of blobs"

### Accepted Changes (Incorporated in v1.1)

#### Change 1: Merge Patches 1 & 4 → "Evidence Capture" Sprint

**Rationale** (Anti-Gravity): "Both require Playwright config changes + storage logic. Avoid rewriting the reporter twice."

**New Phase 1**:
| Sprint | Patches | Deliverables |
|--------|---------|--------------|
| **Phase 1A** | 4 + 1 (merged) | Evidence Capture: Replayable artifacts + Evidence Pack |
| **Phase 1B** | 5 | Sub-Agent Output Validation |

#### Change 2: Storage-Conscious Playwright Config

**Rationale** (Codex): "trace/video/screenshot: 'on' will explode storage... video is the largest driver."

**Revised MVP Config**:
```javascript
use: {
  // ALWAYS: Trace (essential for replay, reasonable size)
  trace: 'on',

  // SAMPLED: Video (large files; sample 10% of passing, 100% of failing)
  video: process.env.CI ? 'retain-on-failure' : 'on-first-retry',

  // CHECKPOINTS: Screenshots at key moments, not every action
  screenshot: 'only-on-failure',  // Plus explicit page.screenshot() at checkpoints

  // FILTERED: HAR only for API calls, not static assets
  recordHar: {
    path: 'test-results/har/',
    mode: 'minimal',
    urlFilter: '**/api/**',
  },
}
```

**Retention Policy** (per Anti-Gravity):
| Artifact Type | Passing Tests | Failing Tests |
|---------------|---------------|---------------|
| Trace | 48 hours | 30 days |
| Video | Not captured | 30 days |
| Screenshots | 48 hours | 30 days |
| HAR | 48 hours | 30 days |
| Evidence Pack | 7 days | 90 days |

#### Change 3: Evidence Pack Manifest Schema

**Rationale** (Codex): "Define a minimal JSON manifest... without this, pack becomes folder of blobs hard to validate."

```json
{
  "$schema": "evidence-pack-v1",
  "pack_id": "uuid",
  "created_at": "ISO8601",
  "git_sha": "abc123",
  "base_url": "http://localhost:3001",

  "test_context": {
    "sd_id": "SD-XXX-001",
    "story_id": "US-001",
    "test_file": "tests/e2e/auth/login.spec.ts",
    "test_name": "US-001: User can login"
  },

  "artifacts": {
    "screenshot_before": { "path": "...", "hash": "sha256:...", "captured_at": "..." },
    "screenshot_after": { "path": "...", "hash": "sha256:...", "captured_at": "..." },
    "accessibility_snapshot": { "path": "...", "hash": "sha256:..." },
    "console_log": { "path": "...", "hash": "sha256:...", "error_count": 0 },
    "network_har": { "path": "...", "hash": "sha256:...", "redacted": true },
    "dom_snapshot": { "path": "...", "hash": "sha256:..." }
  },

  "redaction_status": {
    "har_redacted": true,
    "console_redacted": true,
    "redaction_rules_version": "1.0"
  },

  "integrity": {
    "manifest_hash": "sha256:...",
    "verification_status": "complete"
  }
}
```

**Required Fields** (must be present for valid pack):
- `pack_id`, `created_at`, `git_sha`
- `test_context.sd_id`, `test_context.story_id`
- `artifacts.accessibility_snapshot`
- `artifacts.console_log` with `error_count`
- `integrity.manifest_hash`

**Optional but Recommended**:
- `artifacts.screenshot_before/after`
- `artifacts.network_har`
- `artifacts.network_mocks` (Phase 1 scope: enables true replay determinism)
- `artifacts.dom_snapshot` (per Anti-Gravity: "needed for layout debugging")

#### Change 4: PII/Secret Redaction Rules

**Rationale** (Codex): "HARs and console logs often contain tokens, emails, addresses."

**Redaction Policy**:
```javascript
const REDACTION_RULES = {
  // Headers to redact in HAR
  har_headers: ['Authorization', 'Cookie', 'X-API-Key', 'X-Auth-Token'],

  // Patterns to mask in console/HAR bodies
  patterns: [
    { name: 'jwt', regex: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, replacement: '[REDACTED:JWT]' },
    { name: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[REDACTED:EMAIL]' },
    { name: 'uuid', regex: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, replacement: '[REDACTED:UUID]' },
    { name: 'api_key', regex: /(?:api[_-]?key|apikey|key)[=:]\s*["']?[\w-]{20,}/gi, replacement: '[REDACTED:API_KEY]' },
  ],

  // Domains allowed in HAR (whitelist approach)
  har_domain_allowlist: ['localhost', '*.supabase.co', 'api.example.com'],
};
```

#### Change 5: Learning Loop Governor

**Rationale** (Both): "Automated updates could lead to model collapse" / "System should generate PRs, not auto-commit"

**Hard Requirements for Patch 6**:

1. **No auto-apply for first 3 months**: All `learning_insights` require `human_verified = true` before action
2. **PR-based updates**: Skill/gate changes generate Pull Requests, not direct commits
3. **Pre-registered learning types** (per Codex):
   ```
   ALLOWED_LEARNING_TYPES = [
     'selector_recommendation',    // Suggest selector change
     'retry_strategy',             // Suggest retry config
     'test_tag_change',            // Suggest quarantine/tag
     'gate_threshold_suggestion',  // Suggest threshold adjustment
     'anti_pattern_detection',     // Flag potential anti-pattern
   ]
   ```
4. **Forbidden early** (no free-form prompt updates from noisy data):
   - Sub-agent prompt modifications
   - Gate removal or bypass
   - Skill deprecation

**Schema Update**:
```sql
ALTER TABLE learning_insights ADD COLUMN human_verified BOOLEAN DEFAULT false;
ALTER TABLE learning_insights ADD COLUMN pr_url TEXT;  -- Link to generated PR
ALTER TABLE learning_insights ADD COLUMN applied_method TEXT CHECK (applied_method IN ('manual', 'pr_merged', 'auto'));
```

#### Change 6: Enhanced Hallucination Detection

**Rationale** (Anti-Gravity): "File exists doesn't catch semantic errors (wrong function in right file)"

**Validation Levels**:

| Level | Check | Example | Complexity |
|-------|-------|---------|------------|
| **L1** | File exists | `/src/foo.ts` exists | Low (fs.existsSync) |
| **L2** | Symbol exists | `function bar` in `/src/foo.ts` | Medium (grep/regex) |
| **L3** | Signature match | `bar(x: string, y: number)` matches usage | High (ts-morph/parser) |

**MVP Implementation** (Patches 4+5):
- L1: Required (blocking)
- L2: Required (blocking)
- L3: Future enhancement (warning only initially)

**L2 Implementation Sketch**:
```javascript
async function validateSymbolExists(filePath, symbolName) {
  const content = await fs.readFile(filePath, 'utf-8');
  const patterns = [
    new RegExp(`function\\s+${symbolName}\\s*\\(`),        // function foo(
    new RegExp(`const\\s+${symbolName}\\s*=`),             // const foo =
    new RegExp(`class\\s+${symbolName}\\s*[{<]`),          // class Foo {
    new RegExp(`interface\\s+${symbolName}\\s*[{<]`),      // interface Foo {
    new RegExp(`export\\s+(?:default\\s+)?${symbolName}`), // export foo
  ];
  return patterns.some(p => p.test(content));
}
```

#### Change 7: Success Metrics Per Patch

**Rationale** (Codex): "Define success metrics per patch"

| Patch | Metric | Target | Measurement |
|-------|--------|--------|-------------|
| **1+4 (Evidence)** | % of Gate 2.5 passes with valid manifest | >95% | Query `browser_evidence_packs` |
| **1+4 (Evidence)** | Median time-to-reproduce for failures | <10 min | Track from report to replay |
| **5 (Validation)** | Hallucination detection rate | >80% of false refs caught | Manual audit sample |
| **5 (Validation)** | False positive rate | <5% | Track overturned validations |
| **2 (Contracts)** | Contract coverage | 100% of MCP tools | Count registered vs used |
| **3 (Escalation)** | Level 2+ approval response time | <5 min median | Query `escalation_decisions` |
| **6 (Learning)** | Insights accepted rate | >30% | `human_verified = true` / total |
| **6 (Learning)** | Flaky test trend | Decreasing | Week-over-week quarantine rate |

### Enforcement Architecture (Codex Request)

**Policy Decision Point (PDP)** for Tool Contracts:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Tool Invocation Flow                        │
└─────────────────────────────────────────────────────────────────┘

  Sub-Agent          Contract          Escalation         Tool
  Request            Validator         Engine             Execution
     │                  │                  │                  │
     │  invoke(tool)    │                  │                  │
     ├─────────────────▶│                  │                  │
     │                  │                  │                  │
     │            ┌─────┴─────┐            │                  │
     │            │ Validate  │            │                  │
     │            │ - Input   │            │                  │
     │            │ - Output  │            │                  │
     │            │   limits  │            │                  │
     │            │ - Combos  │            │                  │
     │            └─────┬─────┘            │                  │
     │                  │                  │                  │
     │                  │  risk_level      │                  │
     │                  ├─────────────────▶│                  │
     │                  │                  │                  │
     │                  │            ┌─────┴─────┐            │
     │                  │            │ Level 0-1 │──────────▶│ Execute
     │                  │            │ Level 2   │──────────▶│ Await Approval
     │                  │            │ Level 3   │──────────▶│ Block + Log
     │                  │            └───────────┘            │
     │                  │                  │                  │
```

**Enforcement Points**:
1. `scripts/execute-subagent.js` → calls Contract Validator before tool use
2. Contract Validator → checks `tool_contracts` table for schema + risk level
3. Escalation Engine → routes based on risk level to auto/log/approve/block
4. Audit Logger → writes to `tool_invocation_log` with decision + rationale

### Resolved Questions (Finalized 2025-12-18)

| Question | Decision | Implication |
|----------|----------|-------------|
| **Gate 2.5 execution** | Playwright-driven | Evidence Pack strengthens existing automation; not adding new process overhead |
| **Network mocks** | Phase 1 (now) | Include mock capture alongside HAR for true replay determinism |
| **DOM Snapshots** | Optional (recommended) | Capture when test requests; balance storage vs debugging value |

**Impact on Phase 1A Scope**:
- Network mock capture added to Evidence Capture deliverables
- DOM snapshot helper available but not required in manifest

---

## Appendix D: Reviewer Comments (Verbatim Excerpts)

### Codex Key Quotes

> "Clear core thesis: 'verification without learning' is a sharp, accurate framing."

> "PII/secret handling: HARs and console logs often contain tokens, emails, addresses. You'll need redaction rules."

> "The biggest risk is positive feedback loops on sub-optimal behavior."

> "Define the 'Policy Decision Point': what component intercepts tool calls and applies the contract? This is the make-or-break detail."

### Anti-Gravity Key Quotes

> "Correcting 'Agent Hallucinations' (Patch 5) is a security/reliability baseline. You cannot build a Learning Loop on hallucinated data."

> "The system should generate Pull Requests for skill updates, not auto-commit them, at least for the first 3 months."

> "File exists doesn't catch semantic errors (referencing the wrong function in the right file)."

> "Approval: I recommend proceeding with Phase 1 (Patches 4 & 5) immediately."

---

*End of Document*
