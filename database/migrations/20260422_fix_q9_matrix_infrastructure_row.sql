-- QF-20260422-862: Fix Q9 SD Type Exemptions matrix — infrastructure is CONDITIONAL, not exempt.
--
-- The "Strategic Validation Question 9: Human-Verifiable Outcome" section (id=365)
-- previously said `infrastructure | ❌ NO | Internal tooling`, which contradicts the
-- actual gate behavior established by SD-LEO-INFRA-ENFORCE-EXECUTION-SMOKE-001:
-- code-producing infrastructure SDs DO require smoke_test_steps.
--
-- Gate implementation:
--   scripts/modules/handoff/executors/lead-to-plan/gates/smoke-test-specification.js
--   scripts/modules/handoff/validation/sd-type-applicability-policy.js::detectCodeProduction
--
-- This migration updates only the content column; no schema change.

UPDATE public.leo_protocol_sections
SET content = $MD$## Strategic Validation Question 9: Human-Verifiable Outcome

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
$MD$
WHERE id = 365;
