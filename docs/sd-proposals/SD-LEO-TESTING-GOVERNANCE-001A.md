# Strategic Directive Proposal: SD-LEO-TESTING-GOVERNANCE-001A

## Mandate TESTING Sub-Agent Validation Gate

**Proposed ID:** SD-LEO-TESTING-GOVERNANCE-001A
**Parent SD:** SD-LEO-TESTING-GOVERNANCE-001
**Type:** Feature (Child SD)
**Category:** protocol
**Priority:** CRITICAL
**Target Application:** EHG_Engineer
**Estimated Effort:** 10-15 hours

---

## 1. Strategic Intent

Add a mandatory blocking gate to the EXEC→PLAN handoff that requires the TESTING sub-agent to have executed and passed before allowing handoff completion. This enforces the LEO Protocol's stated policy that "E2E testing is MANDATORY."

---

## 2. Rationale

### Evidence Base
- **16 retrospectives** cited: "Mandate TESTING sub-agent execution before EXEC→PLAN handoff"
- **14.6% of SDs** (20/137) completed without TESTING sub-agent validation
- **SD-TECH-DEBT-DOCS-001** blocked unexpectedly due to missing TESTING exemption
- **Protocol contradiction:** CLAUDE_CORE says mandatory, CLAUDE_LEAD allows skip

### Current State
- TESTING sub-agent listed in `MANDATORY_SUBAGENTS_BY_PHASE.PLAN_VERIFY` for some types
- No explicit validation gate in handoff to verify TESTING actually ran
- CONDITIONAL_PASS verdict allows handoff to proceed with warnings
- No freshness check on TESTING results

### Target State
- Explicit `MANDATORY_TESTING_VALIDATION` gate in EXEC→PLAN handoff
- Gate queries `sub_agent_execution_results` for TESTING verdict
- Blocks on FAIL/BLOCKED, allows PASS/CONDITIONAL_PASS
- SD type exemptions for documentation, infrastructure, orchestrator

---

## 3. Scope

### In Scope
- Add new gate to `ExecToPlanExecutor.getRequiredGates()`
- Query `sub_agent_execution_results` table
- SD type exemption logic via `sd_type_validation_profiles`
- Freshness validation (configurable max age)
- Remediation entry with fix instructions

### Out of Scope
- Changes to TESTING sub-agent itself
- Changes to other handoff types
- Coverage threshold enforcement (separate concern)

---

## 4. Key Changes

### File: `scripts/modules/handoff/executors/ExecToPlanExecutor.js`

**Add gate in `getRequiredGates()` method after SUB_AGENT_ORCHESTRATION:**

```javascript
// Position: After SUB_AGENT_ORCHESTRATION gate (around line 260)
gates.push({
  name: 'MANDATORY_TESTING_VALIDATION',
  validator: async (ctx) => {
    // 1. Check SD type exemptions
    const sdType = (ctx.sd?.sd_type || 'feature').toLowerCase();
    const EXEMPT_TYPES = ['documentation', 'docs', 'infrastructure', 'orchestrator'];

    if (EXEMPT_TYPES.includes(sdType)) {
      return { passed: true, score: 100, max_score: 100,
               warnings: [`Testing skipped for ${sdType} type SD`] };
    }

    // 2. Query for TESTING sub-agent execution
    const { data: testingResults } = await this.supabase
      .from('sub_agent_execution_results')
      .select('id, verdict, confidence, created_at')
      .eq('sd_id', ctx.sd?.id)
      .eq('sub_agent_code', 'TESTING')
      .order('created_at', { ascending: false })
      .limit(1);

    // 3. Validate execution exists
    if (!testingResults?.length) {
      return { passed: false, score: 0, max_score: 100,
               issues: ['BLOCKING: TESTING sub-agent must be executed'] };
    }

    // 4. Validate verdict is acceptable
    const result = testingResults[0];
    if (!['PASS', 'CONDITIONAL_PASS'].includes(result.verdict)) {
      return { passed: false, score: 0, max_score: 100,
               issues: [`TESTING verdict ${result.verdict} - must pass`] };
    }

    // 5. Validate freshness (default 24h)
    const maxAgeHours = parseInt(process.env.LEO_TESTING_MAX_AGE_HOURS || '24');
    const ageHours = (Date.now() - new Date(result.created_at)) / 3600000;

    if (ageHours > maxAgeHours) {
      return { passed: false, score: 50, max_score: 100,
               issues: [`TESTING results stale (${ageHours.toFixed(1)}h old)`] };
    }

    return { passed: true, score: 100, max_score: 100 };
  },
  required: true
});
```

**Add remediation entry in `getRemediation()` method:**

```javascript
'MANDATORY_TESTING_VALIDATION': [
  'TESTING sub-agent is MANDATORY for code-producing SDs.',
  '',
  'STEPS TO RESOLVE:',
  '1. Run: node scripts/orchestrate-phase-subagents.js PLAN_VERIFY <SD-ID>',
  '2. Ensure all E2E tests pass',
  '3. Re-run EXEC-TO-PLAN handoff',
  '',
  'EXEMPT SD TYPES: documentation, infrastructure, orchestrator'
].join('\n'),
```

---

## 5. Success Criteria

| Criterion | Metric | Pass Threshold |
|-----------|--------|----------------|
| Gate blocks missing TESTING | SDs without TESTING blocked | 100% |
| Gate allows passing TESTING | SDs with PASS/CONDITIONAL_PASS proceed | 100% |
| Exemptions work | documentation SDs not blocked | 100% |
| Freshness enforced | Stale results rejected | 100% |
| Remediation helpful | Users can fix and retry | Verified |

---

## 6. Acceptance Testing

- [ ] Handoff fails when TESTING sub-agent never executed
- [ ] Handoff fails when TESTING verdict is FAIL or BLOCKED
- [ ] Handoff succeeds when TESTING verdict is PASS
- [ ] Handoff succeeds when TESTING verdict is CONDITIONAL_PASS
- [ ] Documentation SD bypasses TESTING requirement
- [ ] Infrastructure SD bypasses TESTING requirement
- [ ] Stale TESTING results (>24h) cause failure
- [ ] Remediation message includes fix instructions

---

## 7. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LEO_TESTING_MAX_AGE_HOURS` | `24` | Maximum age of TESTING results |

---

## 8. Estimated LOC

- Gate validator: ~60 lines
- Remediation entry: ~12 lines
- Comments/documentation: ~10 lines
- **Total: ~80 lines**

---

*Part of SD-LEO-TESTING-GOVERNANCE-001 orchestrator*
