<!-- file_content_hash: a48e3a2f2dac5c6b -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_LEAD_MANUAL.md — LEAD Manual (reference companion)

**Generated**: 2026-08-29 7:16:18 AM
**Protocol**: LEO 4.4.1
**Purpose**: Long-form LEAD reference — the Q9 strategic-validation rubric, parent/child SD governance, multi-track parallel execution, directive submission review
**Load when**: At the MOMENT OF DOING one of these procedures — not at every LEAD phase entry

> This companion carries REFERENCE AND PROCEDURE. Every RULE and PROHIBITION that governs LEAD stays in CLAUDE_LEAD.md and is in force whether or not this file is read. If you are ever unsure whether something belongs here, it belongs in CLAUDE_LEAD.md — this file exists to make that file readable, not to relieve it of anything that binds.

---

## 🎯 Strategic Validation Question 9: Human-Verifiable Outcome

## Strategic Validation Question 9: Human-Verifiable Outcome

**Added in LEO v4.4.0** - Part of LEAD Pre-Approval Gate

### The Question
> "Describe the 30-second demo that proves this SD delivered value."
> Why: If you cannot describe a demo, the SD is defining behavior at the wrong layer of abstraction — observable by engineers but not by users. The 30-second demo forces the SD to ground out in user-visible value rather than internal correctness.

If you cannot answer this question concretely, the SD is too vague to approve.

### Evaluation Criteria

| Rating | Criteria |
|--------|----------|
| ✅ YES | SD has concrete `smoke_test_steps` with user-observable outcomes |
| ⚠️ PARTIAL | Some verification steps exist but are too technical or vague |
| ❌ NO | No smoke test steps defined, or all criteria are technical-only |

### Required Format: smoke_test_steps

Feature SDs MUST include `smoke_test_steps` JSONB array:

```json
[
  {"step_number": 1, "instruction": "Navigate to /dashboard", "expected_outcome": "Dashboard loads with venture list visible"},
  {"step_number": 2, "instruction": "Click Create Venture button", "expected_outcome": "New venture form appears"},
  {"step_number": 3, "instruction": "Fill form and click Save", "expected_outcome": "Success toast + venture appears in list"}
]
```

### LEAD Agent Actions

**If YES**: Proceed with approval
**If PARTIAL**:
- Require concrete user-observable outcomes
- Reject technical-only criteria ("API returns 200", "data in database")

**If NO**:
- **BLOCK approval** until `smoke_test_steps` is populated
> Why: `smoke_test_steps` is the contract between PLAN and EXEC. Without it, EXEC has no acceptance criteria and the AIQualityEvaluator caps scores at 70% — gates will fail and the SD will be sent back for rework anyway.
- Prompt: "What will a user SEE that proves this works?"

### SD Type Exemptions

| SD Type | Requires Q9? | Reason |
|---------|--------------|--------|
| feature | ✅ YES | User-facing, must be verifiable |
| bugfix | ✅ YES | Fix must be observable |
| security | ⚠️ API test | Verify auth/authz works |
| database | ⚠️ API test | Verify data flows correctly |
| infrastructure | ⚠️ CONDITIONAL | REQUIRED if SD produces code (see below); exempt for pure protocol/policy changes |
| documentation | ❌ NO | No runtime behavior |
| refactor | ❌ NO | Behavior unchanged by definition |

**Code-producing infrastructure SDs require `smoke_test_steps`** (SD-LEO-INFRA-ENFORCE-EXECUTION-SMOKE-001). The gate auto-detects code production by scanning `scope`, `key_changes`, and `title` for:
- Code file references: `.js`, `.ts`, `.cjs`, `.mjs`, `.jsx`, `.tsx`, `.py`, `.sh`, `.ps1`, `.bash`
- Code-production keywords: `script`, `utility`, `function`, `module`, `handler`, `gate`, `validator`, `middleware`, `endpoint`, `api`, `worker`, `plugin`, `hook`, `adapter`, `factory`, `engine`, `executor`, `runner`

If any match, the LEAD-TO-PLAN preflight will block with `SMOKE_TEST_MISSING`. Plain config/doc/protocol infrastructure SDs (e.g. "update CLAUDE.md", "add environment variable") are exempt. Detection logic: `scripts/modules/handoff/validation/sd-type-applicability-policy.js::detectCodeProduction`.

### Integration with Validation Gates

This question is ENFORCED by:
1. **LeadToPlanExecutor** - `SMOKE_TEST_SPECIFICATION` gate blocks without steps
2. **ExecToPlanExecutor** - `HUMAN_VERIFICATION_GATE` validates execution
3. **AIQualityEvaluator** - Caps scores at 70% if no human-verifiable outcomes
4. **UserStoryQualityRubric** - Caps at 6/10 for technical-only acceptance criteria

## Parent-Child SD Phase Governance

## Parent-Child SD Phase Governance (PAT-PARENT-CHILD-001)

### Overview

When a parent SD delegates work to child SDs, specific phase transition rules apply.

**Critical Rule**: Parent SDs MUST be in EXEC phase before child SDs can be activated.

### The Problem

Database trigger `enforce_sd_phase_transition_rules` enforces:
- Child SD cannot be activated while parent is in PLAN phase
- Parent must be in EXEC phase first

**Error Message**: "LEO Protocol: Child SD cannot be activated while parent is in PLAN phase. Parent must be in EXEC phase first."

### Why This Happens

Typical workflow:
1. Parent SD completes v1 implementation
2. Parent transitions to PLAN phase (waiting for v2 work from children)
3. Child SDs need to activate to do v2 work
4. **BLOCKED**: Trigger prevents child activation because parent is in PLAN

### Resolution Steps

**Option 1: Manual Phase Transition**

```sql
-- Step 1: Insert handoff record
INSERT INTO sd_handoffs (sd_id, direction, from_agent, to_agent, summary, created_by)
VALUES (
  '<PARENT_SD_UUID>',
  'PLAN_TO_EXEC',
  'PLAN',
  'EXEC',
  'Re-activating parent SD to allow child SD execution',
  'SYSTEM'
);

-- Step 2: Update parent phase
UPDATE strategic_directives_v2
SET phase = 'EXEC', status = 'in_progress'
WHERE id = '<PARENT_SD_UUID>';
```

**Option 2: Use sd:start (Recommended)**

```bash
npm run sd:start <PARENT_SD_KEY>
```

### Best Practices

1. **Plan for re-activation**: When parent delegates to children, document that parent will need to return to EXEC
2. **Use parent-child SD pattern intentionally**: Understand the phase governance before creating child SDs
3. **Document in PRD**: Note parent-child relationships and phase transition requirements
4. **Check before activation**: Query parent phase before attempting child activation

### Recommended Improvements

1. Update trigger error messages to include resolution steps
2. Use `npm run sd:start` to reactivate parent SDs
3. Add database function for safe parent re-activation
4. Update handoff.js for parent-child handling

### Related Patterns

- SD Hierarchy documentation
- Phase transition rules
- Database trigger governance

## Multi-Track Parallel Execution

### Track System Overview

The LEO Protocol organizes SDs into tracks designed for **parallel execution across multiple Claude Code instances**:

| Track | Focus Area | Can Run In Parallel With |
|-------|-----------|-------------------------|
| **A: Infrastructure** | Core systems, safety, EVA | B, C |
| **B: Features** | User-facing stages, product | A, C |
| **C: Quality** | Testing, verification, gates | A, B |
| **STANDALONE** | No dependencies | Any track |

### How To Present SD Options

When presenting READY SDs to the user, **always clarify parallel execution options**:

```
**For this session**, I recommend SD-XXX (Track A, rank #1).

**For parallel throughput**, you could also start additional Claude Code instances:
- Track B: SD-YYY (Features)  
- Track C: SD-ZZZ (Quality)

Tracks are designed to work simultaneously without file conflicts.
Would you like to proceed with just Track A, or start multiple instances?
```

### Conflict Prevention

Before recommending parallel work:
1. Check `sd_conflict_matrix` for file/component overlap
2. SDs touching the same files should NOT run in parallel
3. Use `npm run sd:next` to see track assignments

### Single vs Multi-Instance Decision

| Scenario | Recommendation |
|----------|---------------|
| User has one Claude Code session | Pick highest-ranked READY SD |
| User asks about multiple SDs | Explain parallel track option |
| User has limited time | Focus on single highest-impact SD |
| User wants maximum throughput | Suggest 2-3 parallel instances by track |

### Commands Reference

```bash
npm run sd:next      # Shows all tracks with READY SDs
npm run sd:status    # Overall progress by track
```


---

*Generated from database: 2026-08-29*
*Protocol Version: 4.4.1*
*Source of truth: leo_protocol_sections (section_type=parent_child_sd_governance, multi_track_parallel_execution, lead_strategic_validation_q9). Do not hand-edit — edit the DB section and regenerate.*
