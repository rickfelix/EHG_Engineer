# Self-Improving LEO Protocol - Implementation Plan

**Created**: 2026-01-31
**Status**: Triangulated + Ready for SD Creation
**Triangulation Sources**: OpenAI GPT-5.2 (x2), AntiGravity
**Base Document**: self-improving-leo-architecture-v2.md

## Executive Summary

This implementation plan transforms the Self-Improving LEO Protocol vision (v2) into actionable phases. The plan has been triangulated with external AIs and incorporates user decisions on architecture.

---

## Universal Consensus (All 3 Sources Agree)

| Decision | OpenAI (A) | OpenAI (B) | AntiGravity |
|----------|------------|------------|-------------|
| **Separate proposals table** (not status field) | ✅ Preferred | ✅ Preferred | ✅ "Do not overload feedback" |
| **Parallelize Phase 4** (Self-Audit can start earlier) | ✅ After Phase 2 | ✅ After Phase 2 | ✅ "Start immediately alongside Phase 1" |
| **Feature Flags earlier** | ✅ Can parallel | ✅ Can parallel | ✅ "Phase 1.5" |
| **Schema churn = highest risk** | ✅ High/High | ✅ High/High | ✅ High/High |
| **Rubric versioning critical** | ✅ Versioned tables | ✅ Versioned tables | ✅ Implicit |
| **Quarantine vs hard reject** | ✅ | ✅ | ✅ "Human-in-the-Loop Gate" |
| **Use existing AEGIS** | ✅ | ✅ | ✅ "Judge = agentic wrapper around Constitution" |
| **Pre-commit hook for generated files** | ✅ Implicit | ✅ Implicit | ✅ Explicit recommendation |

---

## Unique Valuable Insights

| Source | Insight | Action |
|--------|---------|--------|
| **OpenAI (A)** | Phase 0.5: Data contracts before Phase 1 | Add to plan |
| **OpenAI (A)** | Event log schema for integration | Add `leo_events` table |
| **OpenAI (A)** | Smoke wiring checkpoints after each phase | Add to plan |
| **OpenAI (B)** | Split Phase 7 into 7a (data-plane) + 7b (control-plane) | Add to plan |
| **OpenAI (B)** | State machine docs for proposals/flags | Add to documentation |
| **AntiGravity** | "Fire-and-Forget" async pattern for feedback | Add to Phase 1 design |
| **AntiGravity** | Version Check in session_prologue | Add to Phase 0 |
| **AntiGravity** | "Break Glass" emergency manual override doc | Add to documentation |
| **AntiGravity** | MTTI metric (Mean Time To Improvement) | Add to success criteria |
| **AntiGravity** | `/status` command for loop health | Add new command |
| **AntiGravity** | `propose_improvement` skill | Add new skill |
| **AntiGravity** | Store agent prompts in DB | Add `leo_prompts` consideration |
| **AntiGravity** | Regeneration race condition risk | Add version check |

---

## Risk Matrix (Consolidated)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Schema churn/rework** | HIGH | HIGH | Phase 0.5 data contracts, lock schemas early, versioned rubrics |
| **Quality layer over-filtering** | MEDIUM | HIGH | Quarantine class, before/after logging, human review |
| **Prioritization bias/instability** | MEDIUM | HIGH | Rubric versioning, replay tests, stability thresholds |
| **Regeneration race conditions** | HIGH | HIGH | Version check in session_prologue, warn if stale |
| **Feedback loop amplification** | MEDIUM | CRITICAL | Human-in-the-Loop gate for schema/protocol changes |
| **Schema/code drift** | MEDIUM | HIGH | Pre-commit hook rejecting generated file edits |

---

## Phase Overview

```
Phase 0 ──► Phase 0.5 ──┬──► Phase 1 ──► Phase 2a ──► Phase 2b ──► Phase 3a ──► Phase 3b ──► Phase 5
                        │                                                              │
                        └──► Phase 1.5 ────────────────────────────────────────► Phase 6
                        │
                        └──► Phase 4 (parallel, read-only) ────────────────────────────┘
                                                                                       │
                                                                               Phase 7a ──► Phase 7b
```

---

## Phase 0: Verify Existing Infrastructure

**Duration**: 1-2 sessions

**Tasks:**
- [ ] Verify issue_patterns integration with feedback
- [ ] Verify AEGIS enforcing all 11 constitution rules
- [ ] Verify rate limiting (CONST-007) active
- [ ] Document current /learn and /leo assist capabilities
- [ ] Create dependency graph: commands ↔ DB tables ↔ generators
- [ ] Add version check to session_prologue (detect stale protocol)
- [ ] Add pre-commit hook rejecting edits to CLAUDE*.md files

**Database Updates:** None (verification only)

**Documentation Output:**
- Gap report
- Dependency graph
- Current state documentation

**Success Criteria:** Evidence report proves AEGIS coverage, rate limit enforcement, dependency map complete

---

## Phase 0.5: Data Contracts

**Duration**: 1 session

**Tasks:**
- [ ] Define `leo_proposals` schema (lifecycle states, rubric fields, ownership)
- [ ] Define `leo_vetting_rubrics` schema (versioned, weighted)
- [ ] Define `leo_prioritization_config` schema
- [ ] Define `leo_audit_config` schema
- [ ] Define `leo_feature_flags` schema (states, ownership, expiry)
- [ ] Define `leo_events` schema (common event log)
- [ ] Define API contracts for each phase
- [ ] Lock schemas before Phase 1 begins

**Database Updates:**
- Create migration files (not executed yet, just defined)
- Add schema documentation

**Documentation Output:**
- `docs/reference/schema/proposals.md`
- `docs/reference/schema/feature-flags.md`
- `docs/reference/data-contracts.md`
- State machine diagrams for proposals and flags

**Success Criteria:** All schemas reviewed and locked, migration files ready

---

## Phase 1: Feedback Quality Layer

**Duration**: 2-3 sessions
**Can Parallel With**: Phase 6 (Feature Flags)

**Tasks:**
- [ ] Add sanitization for dangerous patterns (prompt injection guard)
- [ ] Add quality enhancement for low-quality items
- [ ] Use "Fire-and-Forget" async pattern (ACK immediately, process in background)
- [ ] Implement "Quarantine" class (not hard reject)
- [ ] Integrate with existing issue_patterns for aggregation
- [ ] Log before/after transformations for review

**Database Updates:**
- Execute `leo_proposals` migration
- Add `feedback_quality_config` entries
- Add sub-agent trigger keywords: "sanitize", "redact", "feedback quality"
- Add to `leo_protocol_sections`

**CLAUDE.md Updates:**
- Add section to CLAUDE_CORE.md explaining quality layer
- Add trigger keywords to sub-agent config
- Regenerate CLAUDE.md family

**Documentation:**
- `docs/guides/feedback-quality-layer.md`
- Schema reference update

**Success Criteria:**
- ≥90% dangerous inputs sanitized
- <5% false quarantine rate
- Quality score improves for low-quality items

---

## Phase 1.5: Feature Flag Foundation

**Duration**: 1-2 sessions
**Can Parallel With**: Phase 1

**Tasks:**
- [ ] Execute `leo_feature_flags` migration
- [ ] Implement basic flag registry
- [ ] Add flag evaluation API
- [ ] Integrate with kill switch (CONST-009)
- [ ] Add rollback capability for Phase 1 quality layer

**Database Updates:**
- `leo_feature_flags` table
- `leo_feature_flag_policies` table
- Add to `leo_protocol_sections`

**CLAUDE.md Updates:**
- Add feature flag section to CLAUDE_EXEC.md
- Regenerate

**Documentation:**
- `docs/guides/feature-flag-management.md`
- Rollback procedure

**Success Criteria:** Flags control at least one live capability (quality layer), rollback test passes

---

## Phase 2a: Proposals Schema + Vetting Rules

**Duration**: 1-2 sessions

**Tasks:**
- [ ] Execute `leo_proposals` migration
- [ ] Execute `leo_vetting_rubrics` migration
- [ ] Define strict vetting rules
- [ ] Define proposal lifecycle states
- [ ] Define rejection reasons

**Database Updates:**
- `leo_proposals` table
- `leo_vetting_rubrics` table (versioned)
- Add to `leo_protocol_sections`

**Documentation:**
- `docs/guides/vetting-process.md`
- Proposal lifecycle state machine

**Success Criteria:** Schema deployed, rubrics versioned, lifecycle documented

---

## Phase 2b: Vetting Agent (Bridge)

**Duration**: 2 sessions
**Depends On**: Phase 2a

**Tasks:**
- [ ] Implement vetting agent (feedback → proposals)
- [ ] Use AegisEnforcer pattern for vetting
- [ ] Apply rubrics to convert feedback to proposals
- [ ] Track vetting outcomes

**Database Updates:**
- Add vetting agent to `leo_sub_agents`
- Add trigger keywords: "vet", "proposal", "rubric"

**CLAUDE.md Updates:**
- Add vetting section to CLAUDE_LEAD.md
- Update /leo assist behavior
- Regenerate

**Success Criteria:**
- ≥80% feedback receives vetting outcome
- Proposals have consistent rubric fields
- 100% proposals created via rubric

---

## Phase 3a: Scoring Model + Data Schema

**Duration**: 1-2 sessions
**Depends On**: Phase 2b

**Tasks:**
- [ ] Define scoring rubrics (value, alignment, risk, effort, dependency, confidence)
- [ ] Implement rubric versioning
- [ ] Define normalization and stability rules
- [ ] Define "confidence of merge" rules for deduplication

**Database Updates:**
- `leo_scoring_rubrics` table
- `leo_prioritization_config` table
- Add to `leo_protocol_sections`

**Success Criteria:** Rubrics versioned, scoring deterministic

---

## Phase 3b: Central Planner Orchestration

**Duration**: 2 sessions
**Depends On**: Phase 3a

**Tasks:**
- [ ] Implement Central Planner orchestrator
- [ ] Theme clustering and deduplication
- [ ] Ranking with stability checks (no re-rank if change < threshold)
- [ ] Define planner outputs and arbitration format

**Database Updates:**
- Add prioritization agent to `leo_sub_agents`
- Add trigger keywords: "prioritize", "score", "planner"

**CLAUDE.md Updates:**
- Add prioritization section to CLAUDE_CORE.md
- Update /leo assist to use prioritization
- Regenerate

**Documentation:**
- `docs/guides/prioritization-engine.md`
- Rubric reference

**Success Criteria:**
- Ranking stable across reruns (top-N consistency ≥85%)
- Planner decisions align with human review ≥70%

---

## Phase 4: Self-Audit (Read-Only)

**Duration**: 2 sessions
**Can Start After**: Phase 1 (parallel with Phases 2-3)

**Tasks:**
- [ ] Implement scheduled review of recent SDs
- [ ] Detection rules for missing components, incomplete implementations
- [ ] Define static checklist registry in DB for "expected artifacts"
- [ ] Report findings to feedback table (no auto-fixes)
- [ ] Minimize false positives

**Database Updates:**
- `leo_audit_config` table
- `leo_audit_checklists` table (expected artifacts per SD type)
- Add AUDIT sub-agent to `leo_sub_agents`
- Add trigger keywords: "audit", "gap check"

**CLAUDE.md Updates:**
- Add self-audit section to CLAUDE_EXEC.md
- Regenerate

**Documentation:**
- `docs/guides/self-audit-loop.md`
- Audit findings format reference

**Success Criteria:**
- Audit runs generate structured findings
- <10% false positives
- All findings logged and traceable

---

## Phase 5: Conflict Resolution (Debate Protocol)

**Duration**: 2 sessions
**Depends On**: Phase 3b

**Tasks:**
- [ ] Implement Debate Protocol
- [ ] Judge Agent uses AegisEnforcer/AegisRuleLoader
- [ ] Define conflict detection contract
- [ ] Escalation to human for low-confidence decisions
- [ ] Judge cites specific constitution rules when resolving

**Database Updates:**
- Add Judge agent to `leo_sub_agents`
- Add trigger keywords: "conflict", "disagree", "judge"
- Add to `leo_protocol_sections`

**CLAUDE.md Updates:**
- Add debate protocol section
- Regenerate

**Documentation:**
- `docs/guides/conflict-resolution.md`
- Escalation policy reference

**Success Criteria:**
- Conflicts resolved with documented rationale
- Escalation rate within expected thresholds

---

## Phase 6: Feature Flag Governance (Enhancement)

**Duration**: 1-2 sessions
**Depends On**: Phase 1.5

**Tasks:**
- [ ] Add lifecycle states to flags
- [ ] Add approval gates
- [ ] Add ownership and expiry
- [ ] Integrate with deployment pipeline
- [ ] `/flags` command for CLI

**Database Updates:**
- Enhance `leo_feature_flags` with governance fields

**CLAUDE.md Updates:**
- Update feature flag section
- Regenerate

**Documentation:**
- Update `docs/guides/feature-flag-management.md`
- State machine for flags

**Success Criteria:** Flags are auditable, have owners, rollback verified

---

## Phase 7a: Data-Plane Integration

**Duration**: 2 sessions
**Depends On**: Phases 1-6

**Tasks:**
- [ ] Wire all components together
- [ ] Implement `leo_events` table for common event log
- [ ] Idempotent workers with retry/dedupe strategy
- [ ] Smoke test end-to-end path

**Database Updates:**
- `leo_events` table
- Integration configuration

**Success Criteria:** Data flows from feedback → proposal → prioritization → execution

---

## Phase 7b: Control-Plane + Observability

**Duration**: 2 sessions
**Depends On**: Phase 7a

**Tasks:**
- [ ] Track meta-metrics: human interventions %, MTTR, MTTI
- [ ] `/status` command showing loop health
- [ ] Monitor: expect "burst phase" then taper
- [ ] Backfill and replay capability for events

**Database Updates:**
- `leo_metrics` table

**CLAUDE.md Updates:**
- System overview section update
- Full capability documentation
- Regenerate

**Documentation:**
- Architecture document update (v2 → v3)
- Operations runbook
- `docs/operations/emergency_manual_override.md` ("Break Glass")
- Meta-metrics dashboard guide

**Success Criteria:**
- End-to-end pipeline runs
- Metrics collected
- MTTI tracked (target: <24 hours)
- Human intervention % tracked

---

## New Commands/Skills Summary

| Type | Name | Phase | Description |
|------|------|-------|-------------|
| Command | `/status` | 7b | Show self-improvement loop health |
| Command | `/audit` | 4 | Read-only audit report |
| Command | `/flags` | 6 | List/evaluate feature flags |
| Skill | `feedback_quality` | 1 | Quality layer sub-agent |
| Skill | `vetting_engine` | 2b | Vetting sub-agent |
| Skill | `prioritization_planner` | 3b | Central Planner sub-agent |
| Skill | `self_audit` | 4 | Audit sub-agent |
| Skill | `conflict_resolution` | 5 | Judge sub-agent |
| Skill | `propose_improvement` | 2b | Direct proposal submission |

---

## Database Tables Summary

| Table | Phase | Purpose |
|-------|-------|---------|
| `leo_proposals` | 2a | Structured, vetted improvement candidates |
| `leo_vetting_rubrics` | 2a | Versioned rubrics for vetting |
| `leo_scoring_rubrics` | 3a | Versioned rubrics for prioritization |
| `leo_prioritization_config` | 3a | Planner configuration |
| `leo_audit_config` | 4 | Audit schedule and scope |
| `leo_audit_checklists` | 4 | Expected artifacts per SD type |
| `leo_feature_flags` | 1.5 | Feature flag registry |
| `leo_feature_flag_policies` | 1.5 | Flag governance rules |
| `leo_events` | 7a | Common event log |
| `leo_metrics` | 7b | Meta-metrics tracking |

---

## MVP Definition (Consensus)

**Minimum Viable Self-Improvement Loop:**
1. ✅ Feedback ingestion (sanitized, quality-enhanced)
2. ✅ Manual approval (human vetting)
3. ✅ Automated protocol generation

**Phases for MVP:** 0, 0.5, 1, 1.5, 2a, 2b (basic)

---

## Related Documentation

- [Self-Improving LEO Architecture v2](./self-improving-leo-architecture-v2.md)
- [Self-Improving LEO Architecture v1](./self-improving-leo-architecture-v1.md)
- [Protocol Constitution Guide](../governance/protocol-constitution-guide.md)
- [AEGIS System Overview](../01_architecture/aegis-system-overview.md)

---

## Changelog

- **2026-01-31**: Initial plan created from triangulation synthesis
