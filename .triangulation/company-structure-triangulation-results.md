# Triangulation Results: EHG/LEO Company-Structure Overlay

**Date**: 2026-01-22
**Protocol**: Ground-Truth Triangulation Protocol v1.1
**Models Consulted**: OpenAI (GPT-4), AntiGravity, Claude (Opus 4.5)

---

## Executive Summary

**Consensus Verdict**: PROCEED WITH CAUTION — Build observability first, routing second.

All three AI sources agree on the core approach:
1. **Departments as metadata**, not runtime constraints
2. **Metrics for visibility**, not immediate routing changes
3. **Self-improvement requires strict governance gates**
4. **Materialized views** for KPI computation
5. **Human-in-loop** for high-risk changes

---

## 1. CONSENSUS POINTS (High Confidence)

### 1.1 Department Model: Metadata, Not Runtime

| Source | Position | Quote |
|--------|----------|-------|
| OpenAI | Metadata only | "Add soft department grouping as metadata...no rigid org logic" |
| AntiGravity | Governance view | "Treat the Company Structure as a Governance View, not a Runtime Constraint" |
| Claude | Additive | "Add `department_code` to `leo_sub_agents` (nullable)" |

**CONSENSUS**: All agree departments should be **tags/metadata** for organization and reporting, NOT integrated into the synchronous execution path.

### 1.2 KPI Computation: Materialized Views

| Source | Approach | Refresh Frequency |
|--------|----------|-------------------|
| OpenAI | Materialized view + scheduled refresh | Nightly |
| AntiGravity | Materialized view | Hourly |
| Claude | Materialized view | Daily |

**CONSENSUS**: Use **materialized views** computed from `sub_agent_execution_results`. No real-time aggregation in the routing hot path.

### 1.3 Performance Routing: Additive Scoring, Not Replacement

| Source | Position |
|--------|----------|
| OpenAI | "Keep keyword triggers but add scoring for capability + performance" |
| AntiGravity | "FinalScore = (KeywordMatch * W1) + (PerformanceScore * W2) + (CapabilityMatch * W3)" |
| Claude | "Fallback to keyword matching if capability match fails" |

**CONSENSUS**: Don't replace keyword routing. **Add performance as a weighted signal** on top of existing logic.

### 1.4 Self-Improvement: Governance Gates Required

| Source | Position |
|--------|----------|
| OpenAI | "Human-approved protocol changes...before automation" |
| AntiGravity | "Never let LEO commit to master without a human signature" |
| Claude | "LEAD approval gate: Human-in-loop before protocol changes go live" |

**CONSENSUS**: **No auto-apply** for protocol changes affecting validation logic, routing, or rubrics. Human approval mandatory for high-risk tiers.

### 1.5 Risk Tiers for Change Classification

All three sources proposed nearly identical tier structures:

| Tier | OpenAI | AntiGravity | Claude |
|------|--------|-------------|--------|
| Immutable | "Tier 0: safety constraints, approval logic" | "Constitution File - read-only core directives" | "Some changes NEVER auto-approved" |
| High Risk | "Tier 1: routing logic, validation logic, scoring" | "Tier 3: Structural - routing, logic, dependencies" | "Structural changes require approval" |
| Medium Risk | "Tier 2: instruction tuning, defaults" | "Tier 2: Additive - new checklist items" | "N/A" |
| Low Risk | "Tier 3: formatting, clarifications, typos" | "Tier 1: Cosmetic - formatting, typos" | "Cosmetic changes auto" |

**CONSENSUS**: Implement **tiered change classification**. Only Tier 3/4 (cosmetic) can be auto-approved.

---

## 2. DISAGREEMENTS (Require Investigation)

### 2.1 Schema Choice: New Table vs Column

| Source | Recommendation | Reasoning |
|--------|----------------|-----------|
| OpenAI | New `departments` table + FK | "referential integrity, lifecycle management" |
| AntiGravity | Column on `leo_sub_agents` | "keeps schema flat and performant for routing" |
| Claude | Either; prefers `agent_registry` | "already has hierarchy support" |

**DISAGREEMENT**: Whether to create a new `departments` table or just add a column.

**Resolution Needed**:
- If departments have metadata (head, budget, description) → new table
- If departments are just grouping labels → column is sufficient
- **Recommendation**: Start with column, migrate to table if needed

### 2.2 Rework Rate Computation

| Source | Approach |
|--------|----------|
| OpenAI | Count sd_ids with >1 execution per agent |
| AntiGravity | Same basic approach, notes it's "harder to track" |
| Claude | Acknowledged as needed but not detailed |

**DISAGREEMENT**: Exact SQL for rework rate varies. All agree it's non-trivial.

**Resolution Needed**: Define "rework" precisely:
- Same agent re-executed on same SD?
- Any agent re-executed after initial failure?
- **Recommendation**: Start simple — count(sd_id) WHERE attempts > 1

### 2.3 A/B Testing Feasibility

| Source | Position |
|--------|----------|
| OpenAI | "Canary rollout + auto-rollback based on pre-declared metrics" |
| AntiGravity | "Don't run two different protocols on the same codebase simultaneously...use Time-Based Comparisons" |
| Claude | "A/B test: 50% keyword routing, 50% KPI routing" |

**DISAGREEMENT**: Whether true A/B testing is practical.

**Resolution Needed**: With single-user system, true A/B is hard. AntiGravity's "Week A vs Week B" or "Scope-Based Application" (experimental flag) may be more practical.

---

## 3. NOVEL INSIGHTS (Not in Original Analysis)

### 3.1 "Cold Start" Problem (AntiGravity)
> "New, potentially better models/agents never get traffic because they have no history"

**Insight**: Performance-based routing creates a **chicken-and-egg problem** for new agents. Need explicit "Candidate Bonus" or "Exploration vs Exploitation" logic.

**Action**: Add `is_new_agent` flag or default score for agents with <N executions.

### 3.2 "Checklist Bloat" Anti-Pattern (AntiGravity)
> "One-in, One-out policy for checklists"

**Insight**: Self-improvement systems tend to only ADD rules, never remove. This leads to 50-item checklists.

**Action**: Implement **context budget cap** — if protocol exceeds N tokens, force consolidation.

### 3.3 "Prompt Injection by Proxy" (AntiGravity)
> "Small, 'harmless' linguistic drifts accumulate, eventually making prompts vague or contradictory"

**Insight**: Even approved changes can compound into unintended behavior. This is a **drift risk**, not a single-change risk.

**Action**: Periodic "protocol health check" — compare current protocol to baseline, flag cumulative drift.

### 3.4 "Rot Rate" Metric (AntiGravity)
> "Rules that haven't triggered a 'save' or 'catch' in 90 days should be flagged for removal"

**Insight**: Track which rules are actually being used. Unused rules are candidates for removal.

**Action**: Add `last_triggered_at` to protocol sections.

### 3.5 Independent Evaluator (OpenAI)
> "Separate prompt/model for 'reviewer AI' to reduce self-reinforcement"

**Insight**: The AI proposing changes should NOT be the same AI approving them.

**Action**: Use different model or prompt for `ImprovementExtractor` vs `AI Quality Judge`.

### 3.6 "Override Rate" as Alert Fatigue Signal (AntiGravity)
> "Measure how often do you manually reject/ignore the sub-agent's prompt enforcement"

**Insight**: High override rate indicates the protocol is too strict or wrong.

**Action**: Track human overrides as negative signal for protocol health.

---

## 4. RISKS IDENTIFIED BY MULTIPLE SOURCES

| Risk | OpenAI | AntiGravity | Claude | Severity |
|------|--------|-------------|--------|----------|
| KPI Gaming / Goodhart's Law | ✅ | ✅ | ✅ | HIGH |
| Feedback Loop Drift | ✅ | ✅ | ✅ | HIGH |
| Cold Start Problem | ❌ | ✅ | ❌ | MEDIUM |
| Checklist/Context Bloat | ❌ | ✅ | ❌ | MEDIUM |
| Self-Approval Loops | ✅ | ✅ | ✅ | CRITICAL |
| Non-Deterministic Routing | ❌ | ✅ | ❌ | MEDIUM |
| Cascade Failures (Fire Me Loop) | ❌ | ✅ | ❌ | HIGH |

### Critical Risk: Self-Approval Loops
All three sources explicitly warn against the AI proposing AND approving its own changes.

**Mitigation**:
- Separate models for extraction vs evaluation
- Human gate for anything above Tier 3
- "Constitution file" of immutable rules

### High Risk: KPI Gaming
All three sources warn that optimizing for measurable metrics degrades true quality.

**Mitigation**:
- Multiple metrics (accuracy + speed + rework)
- Include "rework_rate" as negative signal
- Human review of metric trends, not just values

---

## 5. SYNTHESIZED RECOMMENDATION

### Phase 0: Visibility (Week 1-2)
**Consensus: Do this first**

1. Create materialized view for agent KPIs from existing execution results
2. Add `department_code` column to `leo_sub_agents` (nullable)
3. Assign departments to existing agents
4. Build simple dashboard showing agent performance
5. **No routing changes**

**Deliverable**: Can see which agents are accurate/fast/reliable

### Phase 1: Soft Routing (Week 3-4)
**Proceed with caution**

1. Add capability matching as **optional** parameter
2. Implement weighted scoring (keyword + capability + performance)
3. **Keep keyword routing as fallback**
4. Log routing decisions for analysis
5. Handle cold-start with default scores

**Deliverable**: Routing considers performance, but can fall back

### Phase 2: Self-Improvement Governance (Week 5-6)
**High caution**

1. Implement change risk classification (4 tiers)
2. Add `protocol_improvement_reviews` table
3. Use separate AI for scoring vs extraction
4. Auto-approve only Tier 3/4 (cosmetic)
5. Track effectiveness via issue_pattern recurrence
6. Implement "Constitution file" for immutable rules

**Deliverable**: Governed self-improvement with audit trail

### Phase 3: Advanced (Future)
**Only after validation**

1. A/B testing via scope-based application
2. Promotion/demotion logic based on sustained KPIs
3. Context budget enforcement
4. Rot rate detection for unused rules

---

## 6. WHAT NOT TO DO (Universal Agreement)

1. **Don't make departments part of the routing hot path** — metadata only
2. **Don't compute KPIs in real-time** — use materialized views
3. **Don't auto-approve structural changes** — human gate required
4. **Don't let the same AI propose and approve changes**
5. **Don't replace keyword routing** — add scoring on top
6. **Don't ignore cold-start problem** — new agents need default scores
7. **Don't allow unbounded protocol growth** — enforce context budget

---

## 7. OPEN QUESTIONS (Still Unresolved)

1. **What constitutes "rework"?** — Need precise definition before computing
2. **Week-over-week vs scope-based testing?** — Which is more practical for single-user?
3. **Constitution file contents?** — What rules are truly immutable?
4. **Context budget limit?** — 8k tokens? 16k? Need to measure current protocol size

---

## 8. FINAL VERDICT

**Build the dashboard before building the algorithm.**

All three sources agree: you have execution data (`sub_agent_execution_results`) that you're not using. The first step is **visibility** — know which agents perform well before trying to route to them.

The "company structure" is a useful **mental model** for organization, but a dangerous **runtime constraint**. Keep it as metadata.

**If you only do one thing**:
```sql
CREATE MATERIALIZED VIEW agent_kpi_current AS ...
```

Then look at the data for 30 days before making any routing changes.

---

*Triangulation complete. Three independent AI sources consulted. Consensus documented.*
