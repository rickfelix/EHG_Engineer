# LEO Protocol Triangulation - Round 3


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-11
- **Tags**: database, api, testing, e2e

**Date:** 2026-01-10
**Purpose:** Fresh analysis with accurate LEO Protocol context

---

## TRIANGULATION PROMPT

**Context:** I'm building EHG, an AI-native venture studio where I'm the only human (Chairman) and AI agents execute most work. The LEO Protocol governs Strategic Directive (SD) execution through three phases: LEAD → PLAN → EXEC.

**Your Task:** Review the current LEO Protocol capabilities below and identify genuine gaps, risks, or improvement opportunities that are NOT already addressed.

---

## Current LEO Protocol v4.3.3 Capabilities

### Phase Structure
```
LEAD (Strategic Validation) → PLAN (PRD Creation) → EXEC (Implementation) → PLAN_VERIFY → COMPLETE
```

All phase transitions use mandatory `handoff.js` scripts that enforce validation gates. Direct database inserts are blocked by triggers.

### SD Type System (9 Types)

Each SD type has a custom workflow with different handoff requirements and validation gates:

| SD Type | Workflow | Required Handoffs | Skipped Validation |
|---------|----------|-------------------|-------------------|
| `feature` | Full LEO | All 5 | None |
| `infrastructure` | Modified | 4 (EXEC-TO-PLAN optional) | TESTING, GITHUB, E2E, Gates 3&4 |
| `documentation` | Quick | 4 (EXEC-TO-PLAN optional) | TESTING, GITHUB, E2E, Gates 3&4, Implementation Fidelity |
| `database` | Modified + DATABASE agent | All 5 | Some E2E (UI-dependent) |
| `security` | Full + SECURITY agent | All 5 | None |
| `refactor` | Intensity-Aware | Varies | Varies by intensity |
| `bugfix` | Streamlined + regression | All 5 | None |
| `performance` | Full + PERFORMANCE agent | All 5 | None |
| `orchestrator` | Parent SD | 3 (no EXEC gates) | E2E, Implementation Fidelity, Deliverables |

### Refactor Intensity Levels

Refactor SDs have three intensity levels with different requirements:

| Intensity | Required Handoffs | Skipped |
|-----------|-------------------|---------|
| `cosmetic` | LEAD-TO-PLAN, PLAN-TO-LEAD only | E2E, Full PRD, REGRESSION (optional) |
| `structural` | 4 handoffs | Retrospective (optional) |
| `architectural` | All 5 + LEAD-FINAL-APPROVAL | None |

### Adaptive Threshold System

Thresholds are NOT a flat 70%. They are calculated dynamically:

**Base Thresholds by Risk Level:**
- LOW risk: 70%
- MEDIUM risk: 80%
- HIGH risk: 90%
- CRITICAL risk: 95%

**Special Case Minimums (Cannot Go Below):**
- Production deployment: 90%
- Security changes: 95%
- Data integrity/compliance: 95%
- Emergency hotfix: 100%

**Dynamic Modifiers:**
- Prior gate performance ≥90%: -5% (easier)
- Prior gate performance <75%: +5% (harder)
- Pattern maturity (>10 SDs with pattern): +5%

### Per-Type Validation Requirements

Each SD type has specific validation requirements:

```javascript
feature: {
  requiresHumanVerifiableOutcome: true,
  humanVerificationType: 'ui_smoke_test',
  requiresLLMUXValidation: true,
  llmUxMinScore: 50,
  requiresUATExecution: true
}

security: {
  requiresHumanVerifiableOutcome: true,
  humanVerificationType: 'api_test',
  requiresLLMUXValidation: false,
  requiresUATExecution: true
}

infrastructure: {
  requiresHumanVerifiableOutcome: false,
  humanVerificationType: 'cli_verification',
  requiresLLMUXValidation: false,
  requiresUATExecution: false
}

// ... and so on for each type
```

### Auto-Detection

The system auto-detects SD type from title, scope, category, and PRD metadata using keyword matching with confidence scores. Manual override is available.

### Sub-Agent System

20+ specialized sub-agents (DESIGN, DATABASE, SECURITY, TESTING, etc.) are triggered based on SD type and keywords. Agents produce structured verdicts that feed into gate decisions.

### Quality Gates

- **Russian Judge**: AI-powered quality assessment with weighted rubrics
- **4 numbered gates** for PLAN-TO-EXEC and EXEC-TO-PLAN transitions
- **Gate failure handling**: Structured PASS/FAIL with issues/warnings, agent must address issues and re-run

### Handoff Records

Handoffs capture:
- `from_phase`, `to_phase`, `status`
- `evidence_summary` (JSONB)
- `verification_notes`
- `created_by` (must be 'UNIFIED-HANDOFF-SYSTEM')

### Additional Features

- **Baseline issues tracking** (`sd_baseline_issues` table)
- **Retrospectives** captured in database
- **Parent-child SD hierarchy** for work decomposition
- **Track assignments** (A: Infrastructure, B: Features, C: Quality)
- **Burn rate monitoring** and velocity tracking
- **Quick Fix workflow** for small changes (≤50 LOC)

---

## Questions for Analysis

Given the above capabilities, please analyze:

1. **What genuine gaps exist?** What scenarios or failure modes are NOT covered by the current system?

2. **What risks remain?** Where could the system still fail despite these safeguards?

3. **What's overengineered?** Is any of this complexity unnecessary? What could be simplified?

4. **What's the Chairman's blind spot?** As the only human in an AI-native studio, what governance or oversight gaps might exist that the system doesn't address?

5. **What would you change?** If you could modify one thing about this protocol, what would it be and why?

---

Please provide your independent analysis. I'm triangulating across multiple AI models.
