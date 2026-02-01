# Self-Improving LEO Protocol - Architectural Vision v2

**Created**: 2026-01-31
**Updated**: 2026-01-31 (Post-Triangulation)
**Status**: Triangulated + User-Validated
**Author**: Claude (with Rick Felix input)
**Triangulation Sources**: Claude, GPT-5.2 (x2), AntiGravity

## Executive Summary

Design a closed-loop autonomous improvement system for the LEO Protocol that can:
- Discover its own enhancements
- Log them to a canonical backlog (feedback table)
- Prioritize them via rubrics
- Execute them (plan → execute → validate) with minimal human involvement
- Operate under the **existing** constitution + guardrails (CONST-001 through CONST-011)
- Learn from user feedback
- Audit its recent work for completeness (read-only)

## Key Insight: Existing Infrastructure

**The triangulation initially claimed many gaps that ALREADY EXIST in the codebase.**

### What Already Exists (Use, Don't Rebuild)

| Component | Location | Status |
|-----------|----------|--------|
| **Protocol Constitution** (11 rules) | `protocol_constitution` table | ✅ COMPLETE |
| **Immutable rules** (RLS blocks UPDATE/DELETE) | Database RLS policies | ✅ COMPLETE |
| **Kill switch** (CONST-009 AUTO_FREEZE) | `system_flags` table | ✅ COMPLETE |
| **Rate limiting** (CONST-007: 3/24h) | `constitution-validator.js` | ✅ COMPLETE |
| **Human approval gates** (CONST-001) | AI Quality Judge | ✅ COMPLETE |
| **Audit logging** (CONST-003) | `aegis_violations` table | ✅ COMPLETE |
| **Reversibility requirement** (CONST-004) | Constitution validator | ✅ COMPLETE |
| **Separation of proposer/evaluator** (CONST-002) | Cross-model validation | ✅ COMPLETE |
| **Chesterton's Fence** (CONST-008) | Removal requires retrospective review | ✅ COMPLETE |
| **AEGIS enforcement** (7 constitutions, 45+ rules) | `lib/governance/aegis/` | ✅ COMPLETE |
| **Issue patterns aggregation** | `issue_patterns` table | ✅ EXISTS (verify integration) |
| **Triangulation protocol** | `.claude/commands/triangulation-protocol.md` | ✅ COMPLETE |

### What's Actually Missing (Build These)

| Component | Priority | User Decision |
|-----------|----------|---------------|
| **Feedback Quality Layer** | HIGH | Add (sanitize + enhance quality) |
| **Vetting Process** (feedback → proposals) | HIGH | Needs architectural clarification |
| **Read-Only Self-Audit** | MEDIUM | Reports only, no auto-fixes |
| **Debate Protocol with Judge** | MEDIUM | For conflict resolution |
| **Feature Flag Management Process** | MEDIUM | For hybrid rollback strategy |
| **Prioritization Engine** | MEDIUM | Central Planner model (simpler) |

### What's NOT Needed (User Decision)

| Component | Reason |
|-----------|--------|
| Hysteresis/Damping | Series execution + rate limits sufficient |
| Hard recursion limits | Monitor but don't block; expect burst→taper |
| Token/Cost management | Not a concern at current scale |
| Marketplace prioritization | Central Planner is simpler |

---

## Core Constraints

1. **EHG** = Venture Factory (runtime) - stage workflow is immutable
2. **EHG_Engineering** = Governance plane where LEO lives
3. Self-improvement operates in governance plane only
4. Agent hierarchy is a governance wrapper on top of stage workflow
5. **Agents operate in SERIES, not parallel** - reduces flapping risk

---

## Architecture Diagram (v2 - Triangulation-Hardened)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SELF-IMPROVING LEO PROTOCOL v2                           │
│                    (Triangulation-Hardened)                                 │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────────────────────┐
                    │   EXISTING: PROTOCOL CONSTITUTION │
                    │   (11 Rules - RLS Immutable)      │
                    │                                   │
                    │  CONST-001: Human approval        │
                    │  CONST-002: Proposer ≠ Evaluator  │
                    │  CONST-003: Audit logging         │
                    │  CONST-004: Reversibility         │
                    │  CONST-005: Database-first        │
                    │  CONST-006: Complexity budget     │
                    │  CONST-007: Rate limit (3/24h)    │
                    │  CONST-008: Chesterton's Fence    │
                    │  CONST-009: FREEZE command        │
                    │  CONST-010: Non-manipulation      │
                    │  CONST-011: Value hierarchy       │
                    └───────────────┬──────────────────┘
                                    │ enforces via AEGIS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│   │  Feedback   │  │   Failed    │  │  Recurring  │  │  SD Audit   │       │
│   │  Analyzer   │  │   Tests     │  │  Patterns   │  │  (Recent)   │       │
│   │             │  │  Detector   │  │  Detector   │  │ READ-ONLY   │       │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│          │                │                │                │              │
│          │    DISCOVERY AGENTS (Capability A) - Series      │              │
│          └────────────────┼────────────────┼────────────────┘              │
│                           │                │                               │
│                           ▼                ▼                               │
│                    ┌─────────────────────────────┐                         │
│                    │  NEW: FEEDBACK QUALITY LAYER │                         │
│                    │                              │                         │
│                    │  • Sanitize dangerous input  │                         │
│                    │  • Enhance low-quality items │                         │
│                    │  • Check quality via rubric  │                         │
│                    │  • Aggregate via issue_patterns │                      │
│                    └──────────────┬───────────────┘                         │
│                                   │                                         │
│                                   ▼                                         │
│                    ┌─────────────────────────────┐                         │
│                    │   EXISTING: FEEDBACK TABLE   │  ← "LAKE" (raw)        │
│                    │      (Canonical Intake)      │                         │
│                    │                              │                         │
│                    │  • Raw user feedback         │                         │
│                    │  • Discovery agent findings  │                         │
│                    │  • Audit reports             │                         │
│                    └──────────────┬───────────────┘                         │
│                                   │                                         │
│                                   ▼                                         │
│                    ┌─────────────────────────────┐                         │
│                    │  NEW: VETTING PROCESS        │                         │
│                    │  (Feedback → Proposals)      │                         │
│                    │                              │                         │
│                    │  • Validate structure        │                         │
│                    │  • Score via rubrics         │                         │
│                    │  • Classify risk tier        │                         │
│                    │  • Output: Structured proposal│                        │
│                    └──────────────┬───────────────┘                         │
│                                   │                                         │
│                                   ▼                                         │
│                    ┌─────────────────────────────┐                         │
│                    │   CONSIDER: PROPOSALS TABLE  │  ← "RIVER" (vetted)    │
│                    │   (or status field in feedback)                        │
│                    │                              │                         │
│                    │  • Structured, scoped items  │                         │
│                    │  • Ready for prioritization  │                         │
│                    │  • Lifecycle states          │                         │
│                    └──────────────┬───────────────┘                         │
│                                   │                                         │
│                                   ▼                                         │
│                    ┌─────────────────────────────┐                         │
│                    │  NEW: PRIORITIZATION ENGINE  │                         │
│                    │  (Central Planner Model)     │                         │
│                    │                              │                         │
│                    │  • Single orchestrator       │                         │
│                    │  • Cluster into themes       │                         │
│                    │  • Deduplicate               │                         │
│                    │  • Score via rubrics:        │                         │
│                    │    - value, alignment        │                         │
│                    │    - risk reduction, effort  │                         │
│                    │    - dependency, confidence  │                         │
│                    └──────────────┬───────────────┘                         │
│                                   │                                         │
│                                   ▼                                         │
│                    ┌─────────────────────────────┐                         │
│                    │  EXISTING: RISK ASSESSMENT   │                         │
│                    │  (AEGIS Risk Classifier)     │                         │
│                    │                              │                         │
│                    │  STANDARD → Auto-execute     │                         │
│                    │  CODE → Tests + Lint         │                         │
│                    │  CRITICAL → Human Review     │                         │
│                    └──────────────┬───────────────┘                         │
│                                   │                                         │
│                    ┌──────────────┴──────────────┐                         │
│                    │                             │                          │
│                    ▼                             ▼                          │
│   ┌───────────────────────────┐   ┌───────────────────────────┐            │
│   │  NEW: DEBATE PROTOCOL     │   │      HUMAN REVIEW         │            │
│   │  (Conflict Resolution)    │   │      (Escalation)         │            │
│   │                           │   │                           │            │
│   │  If agents conflict:      │   │  • CRITICAL tier changes  │            │
│   │  → Spawn Judge Agent      │   │  • Constitution conflicts │            │
│   │  → Evaluate arguments     │   │  • Judge deadlocks        │            │
│   │  → Decide or escalate     │   │                           │            │
│   └─────────────┬─────────────┘   └─────────────┬─────────────┘            │
│                 │                               │                           │
│                 └───────────────┬───────────────┘                           │
│                                 │                                           │
│                                 ▼                                           │
│                    ┌─────────────────────────────┐                         │
│                    │  EXISTING: EXECUTION ENGINE  │                         │
│                    │  (/leo assist + SD workflow) │                         │
│                    │                              │                         │
│                    │  ┌─────────┐  ┌─────────┐    │                         │
│                    │  │Quick-Fix│  │   SD    │    │                         │
│                    │  │ (≤50)   │  │ (>50)   │    │                         │
│                    │  └────┬────┘  └────┬────┘    │                         │
│                    │       └─────┬──────┘         │                         │
│                    │             │                │                         │
│                    │   LEAD → PLAN → EXEC         │                         │
│                    └──────────────┬───────────────┘                         │
│                                   │                                         │
│                                   ▼                                         │
│                    ┌─────────────────────────────┐                         │
│                    │  EXISTING: VALIDATION GATES  │                         │
│                    │  (AEGIS + Tests + Linting)   │                         │
│                    │                              │                         │
│                    │  • Unit/integration/e2e      │                         │
│                    │  • Linting/quality gates     │                         │
│                    │  • AEGIS rule enforcement    │                         │
│                    │  • Traceability checks       │                         │
│                    └──────────────┬───────────────┘                         │
│                                   │                                         │
│                                   ▼                                         │
│                    ┌─────────────────────────────┐                         │
│                    │  NEW: HYBRID ROLLBACK        │                         │
│                    │  + Feature Flag Management   │                         │
│                    │                              │                         │
│                    │  UI/Feature: Feature flags   │                         │
│                    │  Infra/Schema: Git revert    │                         │
│                    │  Process: Flag governance    │                         │
│                    └──────────────┬───────────────┘                         │
│                                   │                                         │
│                                   ▼                                         │
│                         ┌─────────────────┐                                │
│                         │     SHIPPED     │                                │
│                         └────────┬────────┘                                │
│                                  │                                          │
│                                  │ feeds back (read-only)                   │
│                                  ▼                                          │
│                    ┌─────────────────────────────┐                         │
│                    │  NEW: SELF-AUDIT (READ-ONLY) │                         │
│                    │                              │                         │
│                    │  • Review SDs from last N days│                        │
│                    │  • Detect gaps/regressions   │                         │
│                    │  • REPORT to feedback table  │                         │
│                    │  • Does NOT create fixes     │                         │
│                    └──────────────┬───────────────┘                         │
│                                   │                                         │
│                                   │ reports to                              │
│                                   ▼                                         │
│                    ┌─────────────────────────────┐                         │
│                    │   FEEDBACK TABLE (loop back) │                         │
│                    └─────────────────────────────┘                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────┐
                    │  EXISTING: LEARNING SYSTEM   │
                    │  (/learn command)            │
                    │                              │
                    │  • Pattern capture           │
                    │  • Rubric tuning             │
                    │  • Creates SDs from patterns │
                    └─────────────────────────────┘
```

---

## Capability Breakdown (Updated)

### Capability A: Discovery Agents → Feedback (PARTIALLY EXISTS)

**Existing Infrastructure:**
- `feedback` table (intake)
- `issue_patterns` table (aggregation)
- `/learn` command (pattern discovery)
- Retrospectives table (post-SD learning)

**What to Add:**
- **Feedback Quality Layer**: Sanitize + enhance + quality-check before intake
- Automated discovery triggers (failed tests → feedback, repeated escalations → feedback)

**Design Decision:** Agents operate in SERIES, not parallel. Rate limit (3/24h) provides natural dampening.

### Capability B: Prioritization Engine (NEW)

**Model:** Central Planner (user decision - simpler than marketplace)

**Responsibilities:**
- Single orchestrator scores and prioritizes all vetted proposals
- Clusters into themes
- Deduplicates
- Scores via rubrics: value, alignment, risk reduction, effort, dependency, confidence

**Output:** Ranked list with rationale, risk tier assigned

### Capability C: Conflict Resolution (NEW)

**Model:** Debate Protocol with Judge Agent

**Process:**
1. Discovery agents submit findings
2. If findings conflict → Spawn Judge Agent
3. Judge evaluates arguments from each side
4. Judge decides OR escalates to human if low confidence

**Integration:** Aligns with existing triangulation protocol (multi-AI verification)

### Capability D: Validation Gates (EXISTS - AEGIS)

**Existing Infrastructure:**
- AEGIS enforcement engine (7 constitutions, 45+ rules)
- 6 validator types (field_check, threshold, role_forbidden, count_limit, custom)
- aegis_violations table (audit log)
- Constitution validator (11 immutable rules)

**No changes needed** - use existing AEGIS system

### Capability E: Self-Audit (NEW - READ-ONLY)

**Design Decision:** Audit is READ-ONLY per user input

**Behavior:**
- Reviews SDs shipped in last N days
- Detects: missing components, incomplete implementations, validation gaps, regression signals
- **REPORTS findings to feedback table**
- **Does NOT autonomously create fixes** (prevents death spiral)

**Rationale:** AntiGravity warned of "Autopilot Death Spiral" where audit creates fixes that break things that audit then finds.

### Capability F: Rollback Strategy (NEW - HYBRID)

**Design Decision:** Hybrid approach per user input

| Code Type | Rollback Method |
|-----------|-----------------|
| UI/Feature code | Feature flags (instant toggle) |
| Infrastructure/Schema | Git revert |

**Requires:** Feature Flag Management Process (governance for flags, not ad-hoc toggles)

---

## Open Questions - Resolved

| Question | Resolution | Source |
|----------|------------|--------|
| Feedback vs proposals table? | **Needs clarification** - vetting layer bridges | User input |
| Prevent runaway self-modification? | **EXISTS** - CONST-001 through CONST-011, AEGIS | Codebase |
| Risk thresholds? | **EXISTS** - AEGIS 3-tier (STANDARD/CODE/CRITICAL) | Codebase |
| Conflicting recommendations? | **Debate Protocol** with Judge Agent | User input |
| Rollback strategy? | **Hybrid** - feature flags + git revert | User input |
| Meta-metrics? | Human Interventions %, MTTR, recurrence rate | Triangulation |

---

## Implementation Plan (Phased)

### Phase 0: Verify Existing Infrastructure (Before Building)
- [ ] Verify `issue_patterns` table integration with feedback
- [ ] Verify AEGIS is enforcing all 11 constitution rules
- [ ] Verify rate limiting (CONST-007) is active
- [ ] Document current `/learn` and `/leo assist` capabilities

### Phase 1: Foundation (LOW RISK)
- [ ] **Feedback Quality Layer** - sanitize + enhance inputs
- [ ] **Vetting Process** - bridge between raw feedback and structured proposals
- [ ] Clarify: separate proposals table vs. status field in feedback

### Phase 2: Prioritization + Audit (MEDIUM RISK)
- [ ] **Prioritization Engine** (Central Planner model)
- [ ] **Self-Audit Loop** (READ-ONLY mode)
- [ ] Connect audit findings → feedback table

### Phase 3: Conflict Resolution (MEDIUM RISK)
- [ ] **Debate Protocol** with Judge Agent
- [ ] Integration with existing triangulation protocol
- [ ] Escalation path to human review

### Phase 4: Rollback Infrastructure (MEDIUM RISK)
- [ ] **Feature Flag Management Process**
- [ ] Integration with existing deployment workflow
- [ ] Hybrid rollback routing (flags vs. git)

### Phase 5: Full Loop (CAREFUL)
- [ ] Connect all components
- [ ] Monitor: expect "burst phase" then taper
- [ ] Track meta-metrics: human interventions %, MTTR

---

## Triangulation Summary

### Rating After Corrections

| Dimension | Original | Corrected | Reason |
|-----------|----------|-----------|--------|
| **Completeness** | 6.5/10 | **8/10** | Much already exists |
| **Feasibility** | 7.5/10 | **8.5/10** | Building on solid foundation |
| **Safety** | 4.75/10 | **7/10** | Constitution + AEGIS already in place |
| **Elegance** | 6.5/10 | **7/10** | Leveraging vs. rebuilding |

### What Triangulation Got Wrong

External AIs (GPT-5.2, AntiGravity) claimed these were missing when they EXIST:
- Meta-Constitution → EXISTS as `protocol_constitution` (11 rules, RLS immutable)
- Kill switch → EXISTS as CONST-009 (AUTO_FREEZE)
- Rate limits → EXISTS as CONST-007 (3/24h)
- Audit logging → EXISTS as CONST-003 + aegis_violations
- Rollback requirement → EXISTS as CONST-004

### What Triangulation Got Right

These are genuinely valuable additions:
- **Feedback Quality Layer** (sanitize + enhance) ✓
- **Read-only self-audit** (prevents death spiral) ✓
- **Debate Protocol** (conflict resolution) ✓
- **Hybrid rollback** (feature flags + git) ✓
- **Lake vs River** concept (needs architectural clarification) ✓

### Lessons Learned

1. **Always verify existing infrastructure** before claiming gaps
2. **Triangulation is valuable** but external AIs lack codebase context
3. **User input essential** for design decisions (series vs parallel, central planner vs marketplace)
4. **Build on what exists** rather than rebuilding from scratch

---

## Related Documentation

- **[Protocol Constitution Guide](../governance/protocol-constitution-guide.md)** - 11 immutable rules
- **[AEGIS System Overview](../01_architecture/aegis-system-overview.md)** - Unified governance
- **[Triangulation Protocol](../../.claude/commands/triangulation-protocol.md)** - Multi-AI verification
- **[LEO Assist](../../.claude/skills/leo.md)** - Current execution engine

---

## Changelog

### v2 (2026-01-31)
- Post-triangulation update
- Corrected infrastructure assessment (much already exists)
- Added user decisions from Q&A session
- Simplified architecture (use existing vs. rebuild)
- Read-only self-audit (user decision)
- Central Planner model (user decision)
- Debate Protocol for conflicts (user decision)
- Hybrid rollback with feature flag management (user decision)

### v1 (2026-01-31)
- Initial architectural vision
- Pre-triangulation draft
