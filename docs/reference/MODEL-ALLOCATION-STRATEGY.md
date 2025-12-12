# Model Allocation Strategy - Haiku-First (LEO Protocol v4.3.3)

**Status**: ACTIVE
**Date**: 2025-12-06
**Version**: 1.0
**Protocol**: LEO 4.3.3 - Haiku-First Model Allocation
**Location**: `/lib/sub-agent-executor.js` (lines 25-104)

---

## Executive Summary

The system uses a **deterministic, static model assignment** approach: given a sub-agent and phase, the model is looked up in a table. No runtime escalation logic or manual decisions required.

```
Model Selection = PHASE_MODEL_OVERRIDES[phase][agent]
```

---

## Philosophy

> **"Trust the simple model until proven wrong. Only upgrade based on evidence."**

- **Haiku**: Used for deterministic/operational tasks (CI/CD, patterns, structure)
- **Sonnet**: Used for mid-level reasoning (design, testing, analysis)
- **Opus**: Reserved for security-critical work and quality gates (never compromised)

---

## Model Tier Assignments

### TIER 1: Haiku (Deterministic/Operational)

Agents where output is deterministic, pattern-based, or low-risk:

| Agent | Phases | Rationale |
|-------|--------|-----------|
| **GITHUB** | LEAD, PLAN, EXEC | CI/CD verification, status checks - deterministic operations |
| **DOCMON** | LEAD, PLAN, EXEC | Pattern-based file structure compliance - template rules |
| **RETRO** | LEAD, EXEC | Pattern extraction from execution history - aggregation |
| **QUICKFIX** | LEAD, EXEC | Trivial edits (<50 LOC) - small scope, low risk |

**Cost Profile**: ~1/3 of Sonnet, ~1/15 of Opus
**Expected Rework Rate**: <15% (if higher, escalate assignment)

---

### TIER 2: Sonnet (Mid-Level Reasoning)

Agents where judgment, reasoning, or edge-case thinking is required:

| Agent | Phases | Rationale |
|-------|--------|-----------|
| **VALIDATION** | LEAD | Ideation phase, low-risk planning |
| **DESIGN** | LEAD, PLAN, EXEC | Architecture reasoning, pattern selection |
| **TESTING** | LEAD, PLAN | Edge case detection, test strategy |
| **DATABASE** | PLAN, EXEC | Schema reasoning, constraint analysis |
| **STORIES** | LEAD, EXEC | User story context (PLAN upgraded to Opus 2025-12-08) |
| **API** | LEAD, PLAN, EXEC | API design patterns, contract validation |
| **RISK** | LEAD, PLAN, EXEC | Risk assessment, mitigation planning |
| **DEPENDENCY** | LEAD, PLAN, EXEC | Dependency analysis, CVE assessment |
| **PERFORMANCE** | LEAD, PLAN, EXEC | Optimization analysis and planning |
| **UAT** | LEAD, PLAN, EXEC | Structured testing, acceptance validation |
| **DOCMON** | LEAD, PLAN, EXEC | Documentation (upgraded from Haiku in EXEC 2025-12-08) |

**Cost Profile**: 1x baseline
**Expected Rework Rate**: <10% (acceptable performance)

---

### TIER 3: Opus (Security-Critical, Non-Negotiable)

Agents where security, data protection, or critical gates are involved:

| Agent | Phases | Rationale | Override Policy |
|-------|--------|-----------|-----------------|
| **SECURITY** | LEAD, PLAN, EXEC | Threat analysis, vulnerability detection | NEVER override - security is absolute |
| **VALIDATION** | PLAN, EXEC | Critical duplicate detection, quality gates | NEVER override - prevents duplicate work |
| **STORIES** | PLAN | User story elaboration (upgraded 2025-12-08, 3.4% pass rate with Sonnet) | Needed for story quality |
| **TESTING** | EXEC | E2E test execution (upgraded 2025-12-08, 11% pass rate with Sonnet) | Critical for QA gates |

**Cost Profile**: ~5x Sonnet
**Override Policy**: Never compromise - these gates are non-negotiable
**Escalation Rule**: If these agents are needed in RED budget zone, defer the entire SD

---

## Phase-Specific Strategy

### LEAD Phase (Ideation & Planning)

**Goal**: Understand scope, validate feasibility, identify risks
**Model Strategy**: Prefer Haiku/Sonnet, reserve Opus only for threat modeling

| Agent | Model | Reasoning |
|-------|-------|-----------|
| GITHUB | Haiku | Setup verification - operational |
| DOCMON | Haiku | Doc structure checks - pattern-based |
| RETRO | Haiku | Lesson extraction from past SDs |
| VALIDATION | Haiku | Feasibility check in ideation |
| DESIGN | Sonnet | Brainstorming options |
| TESTING | Sonnet | Test strategy formation |
| DATABASE | Sonnet | Schema planning |
| SECURITY | Opus | Threat modeling - never compromise |
| Others | Sonnet | Mid-level analysis |

---

### PLAN Phase (Design & Detailed Planning)

**Goal**: Produce implementation plans, architecture, schemas, test plans
**Model Strategy**: Sonnet primary, Opus for critical gates and security

| Agent | Model | Reasoning |
|-------|-------|-----------|
| GITHUB | Haiku | Branch coordination - operational |
| DOCMON | Haiku | PRD compliance - template-based |
| DESIGN | Sonnet | Component architecture |
| TESTING | Sonnet | E2E test plan - edge cases matter |
| DATABASE | Sonnet | Schema design - constraints critical |
| VALIDATION | Opus | Critical gate: prevent duplicate work |
| SECURITY | Opus | Security design review |
| STORIES | **Opus** | User story elaboration (upgraded 2025-12-08) |
| Others | Sonnet | Design-phase reasoning |

---

### EXEC Phase (Implementation & Verification)

**Goal**: Execute code, run tests, verify quality
**Model Strategy**: Haiku for operations, Sonnet for reasoning, Opus for gates

| Agent | Model | Reasoning |
|-------|-------|-----------|
| GITHUB | Haiku | PR operations - deterministic |
| QUICKFIX | Haiku | Small patches - low risk |
| DESIGN | Sonnet | Implementation decisions |
| DATABASE | Sonnet | Migration execution |
| DOCMON | **Sonnet** | Doc compliance (upgraded 2025-12-08 from Haiku) |
| VALIDATION | Opus | Final QA gate - quality critical |
| SECURITY | Opus | Security code review |
| TESTING | **Opus** | E2E execution (upgraded 2025-12-08 from Sonnet) |
| Others | Sonnet | Execution-phase reasoning |

---

## Calibration: Weekly Model Review

Each week, review assignments based on actual performance:

### When to PROMOTE (upgrade assignment):
- **Rework rate >20%** for an agent - indicates insufficient model capability
- **Quality issues** appearing frequently - judgment capability insufficient
- **Edge cases** being missed - reasoning depth needed

**Action**: Update PHASE_MODEL_OVERRIDES, commit change
```javascript
// Example: Testing-agent EXEC needs better edge case detection
EXEC: { TESTING: 'sonnet' }  // ← change from haiku to sonnet
```

### When to KEEP (assignment is working):
- **Rework rate <15%** - model is sufficient
- **Quality gates passing** - reasoning is adequate
- **No escalation pattern** - assignment is stable

**Action**: No change needed, continue monitoring

### When to INVESTIGATE (unexpected behavior):
- **Unexpected high rework rate** - debug if assignment is correct
- **Budget zone mismatch** - verify burn rate calculation
- **Escalation patterns** - ensure assignments are sustainable

**Action**: Review in context, gather more data before changing

---

## Safety Guarantees

### NEVER Violations

These rules are absolute and NEVER overridden:

```javascript
// RULE 1: SECURITY is always Opus
SECURITY: 'opus'  // All phases, all contexts
if (agent === 'SECURITY') model = 'opus'  // Override any logic

// RULE 2: VALIDATION in critical phases is Opus
if (agent === 'VALIDATION' && (phase === 'PLAN' || phase === 'EXEC')) model = 'opus'

// RULE 3: If critical gate requires Opus but budget is RED:
if (agent === 'VALIDATION' && phase === 'EXEC' && budgetZone === 'RED') {
  // DO NOT downgrade
  // INSTEAD: Defer the SD to next week
  deferSD()
}
```

---

## Budget Zone Guidance (Informational)

Budget zones provide **guidance** (not enforcement) for model selection decisions:

| Zone | When | Guidance |
|------|------|----------|
| 🟢 **GREEN** (0-70%) | Week start | Use models per assignment freely |
| 🟡 **YELLOW** (70-85%) | Mid-week | Monitor burn rate; upgrade models cautiously |
| 🟠 **ORANGE** (85-95%) | Late week | Consider deferring non-critical SDs |
| 🔴 **RED** (95%+) | End of week | Budget nearly exhausted; pause work or prepare for overage |

---

## Token Logging (For Calibration)

To calibrate model assignments, track actual consumption:

```bash
# After LEAD phase completes
node scripts/token-logger.js --sd SD-XYZ --phase LEAD --tokens 42000

# After PLAN phase completes
node scripts/token-logger.js --sd SD-XYZ --phase PLAN --tokens 76000

# After EXEC phase completes
node scripts/token-logger.js --sd SD-XYZ --phase EXEC --tokens 58000

# View weekly summary
node scripts/token-logger.js --log

# Check budget status
node scripts/show-budget-status.js
```

---

## Example: Weekly Calibration

**Week 1 Observation**:
```
Testing-agent EXEC had rework in 3 out of 5 SDs
Assignment was: sonnet
Rework rate: 60%
```

**Action**:
```
Assignment is NOT working. Sonnet insufficient for edge case detection.
UPDATE: EXEC: { TESTING: 'opus' }  ← promote from sonnet to opus
COMMIT: "calibration: testing-agent exec upgraded to opus (edge case detection)"
```

**Week 2 Result**:
```
Testing-agent EXEC rework: 1 out of 5 SDs
Rework rate: 20% (acceptable)
```

**Decision**:
```
Good improvement. Opus is better for edge case thinking.
Keep assignment at opus for testing-agent in EXEC.
```

---

## Integration with LEO Protocol

### Sub-Agent Executor (`lib/sub-agent-executor.js`)

The executor automatically uses the static assignment:

```javascript
// When sub-agent is invoked:
const model = PHASE_MODEL_OVERRIDES[currentPhase][agentName];
subAgent.execute(sdId, model, options);
```

No runtime decisions. Just a lookup table.

### Phase Transitions

Model assignments are considered during phase planning but NOT enforced by the system:

- **LEAD**: Assign models based on TIER assignments
- **PLAN**: Use TIER 2 for design work, TIER 3 for gates
- **EXEC**: Use TIER 2 for reasoning, TIER 3 for verification

---

## Failure Recovery

If a model assignment proves wrong during execution:

1. **Continue with current assignment** (don't change mid-SD)
2. **Document the issue**: "Testing-agent EXEC: struggled with selector validation"
3. **At weekly calibration**: Review all issues and adjust assignments
4. **Commit change**: `git commit -am "calibration: [agent] [reason]"`
5. **Next week**: New assignment takes effect

---

## Commands for Operations

```bash
# Log tokens after phase completion
node scripts/token-logger.js --sd SD-XYZ --phase LEAD --tokens 42000

# View weekly token log
node scripts/token-logger.js --log

# Check current budget status
node scripts/show-budget-status.js

# Review model assignments (in code)
cat lib/sub-agent-executor.js | grep -A 100 "PHASE_MODEL_OVERRIDES"
```

---

## References

- **Architecture**: `lib/sub-agent-executor.js` (PHASE_MODEL_OVERRIDES, lines 25-104)
- **Research**: `docs/research/SIMPLIFIED-APPROACH-SUMMARY.md`
- **LEO Protocol**: `CLAUDE_CORE.md`, `CLAUDE_LEAD.md`, `CLAUDE_PLAN.md`
- **Token Logging**: `scripts/token-logger.js`, `scripts/show-budget-status.js`

---

**Status**: ACTIVE ✅
**Last Updated**: 2025-12-06
**Next Calibration**: (Weekly, post-week-end retrospective)
