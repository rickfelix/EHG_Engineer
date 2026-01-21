# Triangulation Synthesis: Stop Hook Sub-Agent Enforcement

**Date**: 2026-01-21
**Reviewers**: OpenAI, Gemini (Antigravity)
**Subject**: Stop Hook Design Review

---

## Consensus (Both Agree)

| Topic | Agreement |
|-------|-----------|
| **Problem is Real** | 24/27 sub-agents unused is a verified gap worth solving |
| **Matrix Model** | SD-type + category → sub-agents matrix is sound |
| **Actionable Feedback** | JSON output with specific commands is valuable |
| **Override Required** | Must have escape hatch for emergencies |
| **Phased Rollout** | Start with warnings, escalate to blocking gradually |
| **Caching Needed** | DB lookups should be cached to avoid performance lag |
| **False Positives** | Timing windows and branch parsing need grace periods |

---

## Divergence (Different Perspectives)

| Topic | OpenAI | Gemini |
|-------|--------|--------|
| **Primary Risk** | False positives from metadata issues | "Session Hostage" - blocking pause vs complete |
| **Severity** | Medium-High confidence | High risk if not addressed |
| **Alternative** | Pre-commit checks | Phase transition scripts (complete-*-phase.js) |
| **Timing Focus** | Clock drift, missing handoffs | "Just entering EXEC, haven't run tests yet" |

---

## Critical Insight (Gemini)

**"Session Hostage" Problem**:

> "If a developer is taking a break (stopping the session) but not completing the SD, blocking them is hostile."

**Scenario**: User is 50% through EXEC, wants to quit for the day. Hook says "Missing TESTING". User cannot exit without force-quitting or running tests prematurely.

**This is a design flaw in the original proposal.** The Stop hook fires on EVERY session end, not just completions.

---

## Recommendation Matrix

| Approach | OpenAI | Gemini | Verdict |
|----------|--------|--------|---------|
| Hard block on every Stop | No | **Absolutely No** | REJECT |
| Warning on Stop, block on completion | Yes (phased) | Yes (explicit) | **ADOPT** |
| Override mechanism | Yes | Yes (critical) | **ADOPT** |
| Cache recent validations | Implied | Yes (1 hour) | **ADOPT** |
| Pre-commit as alternative | Yes | No (harder DB access) | CONSIDER |
| Phase transition scripts | Not mentioned | Yes (preferred) | **EVALUATE** |

---

## Revised Design Recommendation

### 1. Differentiate Session States

```
Session End Types:
├── PAUSE (working, will return)     → WARNING only
├── PHASE_COMPLETE (finishing phase) → BLOCK if missing
└── SD_COMPLETE (finishing SD)       → STRICT BLOCK
```

**Detection Logic**:
- If no `/finish`, `/ship`, or `complete-*-phase.js` invoked → PAUSE mode (warn)
- If completion command detected → COMPLETE mode (block)

### 2. Dual Hook Strategy

| Hook Point | Behavior | Rationale |
|------------|----------|-----------|
| **Stop Hook** | WARNING only | Cognitive offload without hostage risk |
| **Phase Transition Scripts** | BLOCKING | Natural commit point, user expects validation |

### 3. Override Mechanism

```javascript
// Environment variable bypass
if (process.env.LEO_SKIP_HOOKS === '1') {
  console.warn('Hook bypass active - logged to audit');
  process.exit(0);
}

// Bypass file with expiration
const bypassFile = '.stop-hook-bypass';
// { sd_key: "SD-XXX", expires: timestamp, reason: "..." }
```

### 4. Caching Strategy

```javascript
// Trust recent validation (within 1 hour)
const recentExecution = executions.find(e =>
  e.sub_agent_code === agent &&
  (Date.now() - new Date(e.created_at)) < 3600000 // 1 hour
);
if (recentExecution) {
  // Skip re-validation
}
```

---

## Implementation Phases

### Phase 1: Telemetry (Week 1-2)
- Deploy hook in **logging-only** mode
- Track: How often would it block? What's missing?
- No user-facing changes

### Phase 2: Soft Warnings (Week 3-4)
- Enable WARNING output on Stop
- Users see what's missing but aren't blocked
- Collect feedback on false positives

### Phase 3: Phase Transition Blocking (Week 5-6)
- Enable BLOCKING on `complete-*-phase.js` scripts
- Stop hook remains warning-only
- This is the natural enforcement point

### Phase 4: Selective Stop Blocking (Week 7+)
- Only block Stop if completion intent detected
- High-risk SD types (security, database) get stricter enforcement
- Monitor and adjust thresholds

---

## Metrics to Track

| Metric | Purpose |
|--------|---------|
| Block rate | How often does enforcement fire? |
| False positive rate | Blocks that were overridden within 5 min |
| Resolution time | Time from block to sub-agent execution |
| Sub-agent coverage | % of SDs with required agents run |
| Override usage | How often is bypass used? |
| User sentiment | Survey/feedback on friction |

---

## Final Verdict

| Reviewer | Recommendation | Confidence |
|----------|----------------|------------|
| OpenAI | Go with phased rollout | Medium-High |
| Gemini | Go ONLY IF pause vs complete differentiated | High |
| **Synthesis** | **Conditional Go** | **High** |

### Conditions for Proceeding:

1. **MUST** differentiate "pause" (warning) vs "complete" (block)
2. **MUST** have override mechanism with audit logging
3. **SHOULD** use phase transition scripts as primary enforcement point
4. **SHOULD** start with telemetry before any blocking
5. **SHOULD** cache recent validations to avoid performance lag

### Conditions for Rejection:

- If implemented as blanket block on every Stop → **will be disabled by users**
- If no override mechanism → **will cause deadlocks**
- If no caching → **will cause performance complaints**

---

## Next Steps

1. **Revise draft** to incorporate pause vs complete logic
2. **Identify completion signals** (/finish, /ship, phase scripts)
3. **Add telemetry-only mode** as Phase 1
4. **Create SD** for implementation with phased milestones
5. **Define success metrics** before deployment

---

*Triangulation Synthesis v1.0*
*Based on OpenAI and Gemini (Antigravity) reviews*
