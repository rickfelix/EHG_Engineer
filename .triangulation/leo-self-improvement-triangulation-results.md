# Triangulation Results: LEO Self-Improvement Loop Design

**Date**: 2026-01-22
**Protocol**: Ground-Truth Triangulation Protocol v1.1
**Models Consulted**: AntiGravity, OpenAI (GPT-4), Claude (Opus 4.5)

---

## Executive Summary

**AntiGravity Verdict**: "Audacious but Fragile" - 4.5/5 confidence

**Key Finding**: The architecture is structurally sound but relies too heavily on probabilistic safeguards. The AUTO tier is a "dangerous back-door for semantic drift masquerading as formatting fixes."

**OpenAI Response**: Modified the prompt file instead of providing design review (not useful for triangulation).

---

## 1. VALIDATED STRENGTHS (Consensus)

| Design Element | AntiGravity Assessment | Status |
|----------------|------------------------|--------|
| Database-First Foundation | "Excellent. Enables queryable history, rollbacks, structured validation" | VALIDATED |
| Constitution File | "Critical. The 'No self-approval loops' rule is the most important invariant" | VALIDATED |
| Evidence Decay Concept | "Hysteresis prevents over-reacting to single bad day or holding stale dogmas" | VALIDATED |
| Anti-Bloat Awareness | "Forward-thinking constraint that forces trade-offs" | VALIDATED |
| 3-Tier Risk System | "Good start" | VALIDATED with concerns |

---

## 2. CRITICAL WEAKNESSES IDENTIFIED

### 2.1 The "Formatting Trojan Horse" (CRITICAL)

**Problem**: AUTO tier allows changes at score >70. An AI can misclassify semantic changes (e.g., removing "not") as "typo fixes."

> "If the definition of 'safe' is probabilistic, safety will eventually fail."

**Example Attack Vector**:
- Original rule: "Do NOT auto-approve structural changes"
- "Typo fix": "Do auto-approve structural changes" (removed "NOT")
- AI scores this as 85/100 (formatting improvement)
- AUTO tier applies it

**Recommended Fix**:
1. Raise AUTO threshold to **95%**
2. Add **deterministic AST/semantic check** proving no logic change
3. Add **1-hour cooldown** before AUTO changes apply
4. First 3 months: AUTO classification only, no auto-apply

### 2.2 Shared Model Bias

**Problem**: Even with "different prompts," Proposer and Evaluator likely use the same LLM (e.g., Sonnet). Same blind spots = bypassed separation of duties.

> "If the model has a blind spot (e.g., undervalues redundancy), both agents will agree to remove a 'redundant' safety check."

**Recommended Fix**:
- Use **different model families** for Proposer vs Evaluator
- Or add **deterministic validators** that don't rely on LLM judgment

### 2.3 Linear Decay Math Flaw

**Problem**: Current formula uses subtraction:
```
evidence_score = (occurrence_count * recency_weight) - time_decay
```

This can result in **negative scores** or **zeroing out periodic catastrophic risks**.

> "A risk that explodes once every 6 months might be 'optimized away' right before it happens again."

**Recommended Fix**: Use multiplicative decay with floor:
```javascript
evidence_score = (occurrence_count * severity) * (0.95 ^ days_since_last)
// Critical events have min_score floor - never forgotten
```

### 2.4 No Simulation/Shadow Mode

**Problem**: Design applies changes directly. No sandbox to test against past scenarios.

**Recommended Fix**: "Shadow Protocol"
1. Run new protocol in shadow mode for 50 cycles
2. Compare shadow recommendations to actual outcomes
3. Only promote when shadow outperforms current

---

## 3. MISSING ELEMENTS (Must Add)

| Missing Element | Risk if Absent | Recommendation |
|-----------------|----------------|----------------|
| **Rate Limiting** | Bad loop could rewrite entire protocol in 10 minutes | Max 3 AUTO changes per day |
| **Human Veto Override** | No way to freeze AUTO tier in emergency | Explicit STOP mechanism |
| **Semantic Diffing** | Text diffs can't detect threshold changes (0.05 → 0.5) | Parse rules into structured objects |
| **Chesterton's Fence** | Anti-bloat removes rules without knowing why they exist | Link every rule to original retro_id |
| **Velocity Limit** | Unbounded change rate | Max X changes per cycle (constitutional) |
| **Complexity Conservation** | Rules added without trade-off | Zero-sum: must remove to add |

---

## 4. ALTERNATIVE APPROACHES PROPOSED

### 4.1 Adversarial Reviewer

Instead of generic "Quality Judge," spawn an **Adversarial Agent** whose goal is to find loopholes.

> "If the Adversary finds a way to break safety, the change is rejected."

### 4.2 Kernel/Plugins Architecture

Instead of tiers, use:
- **Kernel** (Immutable): Enforces plugins, read-only
- **Plugins** (Flexible): AI can write/modify

### 4.3 Shadow Protocol

Run all changes in shadow mode first:
1. Shadow makes recommendations
2. Compare to actual outcomes
3. Promote only when shadow outperforms

---

## 5. RECOMMENDED CONSTITUTIONAL ADDITIONS

Add to the 5 existing rules:

```sql
-- CONST-006: Complexity Conservation
'New rules cannot be added if they violate token budget; something must be removed first (zero-sum).'

-- CONST-007: Velocity Limit
'Maximum 3 AUTO-tier changes per 24-hour cycle.'

-- CONST-008: Chesterton's Fence
'No rule may be removed unless the original retrospective_id that spawned it is retrieved and reviewed.'

-- CONST-009: Emergency Freeze
'Human can invoke FREEZE command to halt all AUTO changes immediately.'
```

---

## 6. REVISED BUILD ORDER

AntiGravity's recommended phased approach:

| Phase | Goal | Criteria to Proceed |
|-------|------|---------------------|
| **1. Schema** | Ensure tables support new metadata (evidence scores, retro linking) | Tables created |
| **2. Judge Agent** | Build scoring prompt, test against past changes | Rejects bad, accepts good at 90%+ accuracy |
| **3. GOVERNED Pipeline** | Full Proposer → Evaluator → Human flow for ALL changes | Data gathered on accuracy |
| **4. Evidence Scoring** | Implement multiplicative decay math | Queue prioritization working |
| **5. AUTO Classification** | Turn on AUTO classification but **do not auto-apply** | Flag as "WOULD AUTO APPLY" |
| **6. Full Autonomy** | Enable actual auto-apply | After 100 correct "WOULD AUTO APPLY" predictions |

---

## 7. DESIGN CHANGES TO INCORPORATE

### Immediate (Before Implementation)

1. **Raise AUTO threshold**: 70% → 95%
2. **Add deterministic check**: AST/semantic parsing for "no logic change"
3. **Add cooldown**: 1-hour staging before AUTO applies
4. **Add velocity limit**: Max 3 AUTO changes per 24h
5. **Fix evidence formula**: Multiplicative decay, not subtraction
6. **Add retro_id linking**: Every rule traces to origin

### Deferred (Phase 5+)

7. **Shadow mode**: "WOULD AUTO APPLY" classification before real auto-apply
8. **Adversarial reviewer**: Spawn attack agent to find loopholes
9. **Semantic diffing**: Structured rule parsing

---

## 8. FINAL VERDICT

**Proceed with modifications.**

The core architecture (database-first, constitution, separation of duties) is validated. However, the AUTO tier needs significant hardening before implementation:

1. Probabilistic safeguards are insufficient for self-modifying systems
2. Deterministic checks must supplement AI scoring
3. Phased rollout with "WOULD AUTO APPLY" prediction testing is essential

**Confidence**: HIGH that the modified design will be safe.

---

*Triangulation complete. External AI feedback incorporated.*
