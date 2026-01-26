# Stage 11: Recursion Blueprint


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: api, schema, guide, sd

**Status**: ⚠️ **NO RECURSION DEFINED** (Honest gap documented)

**Consistency Scan Result**: N/N/N (No recursion triggers found in critique or adjacent stages)

**Evidence**:
- EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-11.md:1-72 "No Recursive Workflow Behavior section"
- EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:224 "Downstream Impact: Stages 11" (no recursion back to 11)
- EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-12.md:58 "Upstream Dependencies: 11" (no recursion from 12 to 11)

---

## Recursion Scan Summary

**Scanned Sources**:
1. ✅ Stage 11 critique (docs/workflow/critique/stage-11.md)
   - Result: NO recursion section found
   - Interpretation: No recursion triggers defined for Stage 11

2. ✅ Stage 10 critique (docs/workflow/critique/stage-10.md)
   - Searched for: "Stage 11" references in recursion sections
   - Result: Line 224 mentions "Downstream Impact: Stages 11" but NO recursion triggers TO Stage 11
   - Interpretation: Stage 10 does not trigger recursion to Stage 11

3. ✅ Stage 12 critique (docs/workflow/critique/stage-12.md)
   - Searched for: "Stage 11" references in recursion sections
   - Result: Line 58 mentions "Upstream Dependencies: 11" but NO recursion triggers FROM Stage 12 to Stage 11
   - Interpretation: Stage 12 does not trigger recursion to Stage 11

**Conclusion**: **NO recursion triggers defined** for Stage 11 in current system.

**Evidence**:
- EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-11.md:1-72 "Full critique scan"
- EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:1-237 "Full critique scan"
- EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-12.md:1-72 "Full critique scan"

---

## Proposed Recursion Triggers (Gap Mitigation)

**Rationale**: While no recursion is currently defined, Stage 11 has clear failure modes that SHOULD trigger recursion. Below are proposed triggers for future implementation.

---

### PROPOSED: MKT-001 (Brand Validation Failure)

**Trigger Type**: MKT-001
**From Stage**: 11 (Strategic Naming & Brand Foundation)
**To Stage**: 4 (Market Validation) OR 6 (Competitive Analysis)
**Severity**: MEDIUM
**Auto-Execute**: No (requires Chairman approval)

**Condition**: Brand name fails market resonance threshold after customer validation

**Scenario**:
- Stage 11 completes brand name selection
- Customer validation reveals low market resonance score (<60/100)
- Brand name doesn't resonate with target audience
- May indicate misalignment between brand strategy (input) and actual market preferences

**Why Recurse to Stage 4/6**:
- Market validation (Stage 4) or competitive analysis (Stage 6) may have missed key market preferences
- Brand strategy input may be based on outdated or incomplete market data
- Re-validate market positioning before regenerating brand names

**Trigger Logic** (proposed):
```javascript
async function onStage11CustomerValidationComplete(ventureId, validationResults) {
  const marketResonanceScore = validationResults.marketResonanceScore; // 0-100

  // Low market resonance → Recurse to Stage 4 or 6 (MEDIUM severity, needs approval)
  if (marketResonanceScore < 60) {
    await recursionEngine.triggerRecursion({
      ventureId,
      fromStage: 11,
      toStage: validationResults.rootCause === 'competitive_misalignment' ? 6 : 4,
      triggerType: 'MKT-001',
      triggerData: {
        market_resonance_score: marketResonanceScore,
        brand_name: validationResults.brandName,
        customer_feedback: validationResults.feedbackSummary,
        misalignment_areas: validationResults.identifyMisalignments(), // e.g., ["tone doesn't match audience", "name too technical"]
        root_cause: validationResults.rootCause // 'market_preferences' or 'competitive_misalignment'
      },
      severity: 'MEDIUM',
      autoExecuted: false,
      resolution_notes: `Brand name "${validationResults.brandName}" scored ${marketResonanceScore}/100 in customer validation (threshold: 60/100).

      Customer Feedback:
      ${validationResults.feedbackSummary}

      Misalignment Areas:
      ${validationResults.identifyMisalignments().map((m, idx) => `${idx + 1}. ${m}`).join('\n      ')}

      RECOMMENDED ACTIONS:
      1. Re-validate market positioning with deeper customer research
      2. Update brand strategy inputs with customer insights
      3. Regenerate brand names aligned with validated market preferences`
    });
  }
}
```

**Evidence**: (Proposed trigger, addresses critique gap at line 14 "No customer touchpoint")

---

### PROPOSED: LEGAL-001 (Trademark Unavailable)

**Trigger Type**: LEGAL-001
**From Stage**: 11 (Strategic Naming & Brand Foundation)
**To Stage**: 11 (Substage 11.1 - Name Generation) OR 3 (Comprehensive Validation)
**Severity**: HIGH (to Stage 3), LOW (to Substage 11.1)
**Auto-Execute**: Yes (to Substage 11.1), No (to Stage 3)

**Condition**: All name candidates fail trademark search (High Risk or unavailable)

**Scenario 1**: Trademark conflicts but brand strategy still viable
- All 10-15 name candidates have trademark conflicts
- Brand strategy is sound, just need different names
- **Action**: Auto-recurse to Substage 11.1 with stricter trademark constraints

**Scenario 2**: Systematic trademark conflicts reveal strategic problem
- Multiple rounds of name generation (3+) all fail trademark search
- Indicates brand strategy targets overly saturated naming space
- **Action**: Escalate to Chairman, may need to recurse to Stage 3 to reassess solution approach

**Trigger Logic** (proposed):
```javascript
async function onStage11TrademarkSearchComplete(ventureId, trademarkResults) {
  const clearCandidates = trademarkResults.candidates.filter(c =>
    c.trademarkStatus === 'Clear' || c.trademarkStatus === 'Low Risk'
  );

  // Zero clear candidates → Check recursion count
  if (clearCandidates.length === 0) {
    const recursionCount = await db.recursion_events.count({
      where: { ventureId, fromStage: 11, triggerType: 'LEGAL-001' }
    });

    // First 2 failures → Auto-recurse to Substage 11.1 (regenerate with constraints)
    if (recursionCount < 2) {
      await recursionEngine.triggerRecursion({
        ventureId,
        fromStage: 11,
        toStage: 11, // Internal recursion to Substage 11.1
        substage: '11.1',
        triggerType: 'LEGAL-001',
        triggerData: {
          failed_candidates: trademarkResults.candidates.map(c => ({
            name: c.name,
            trademark_status: c.trademarkStatus,
            conflicts: c.conflicts
          })),
          trademark_constraints: trademarkResults.extractConstraints() // e.g., "avoid '-ly' suffix", "avoid 'Cloud' prefix"
        },
        severity: 'LOW', // Internal recursion, low severity
        autoExecuted: true, // Auto-regenerate with constraints
        resolution_notes: `All ${trademarkResults.candidates.length} name candidates failed trademark search (attempt ${recursionCount + 1}/3).

        Auto-regenerating names with trademark constraints:
        ${trademarkResults.extractConstraints().map((c, idx) => `${idx + 1}. ${c}`).join('\n        ')}`
      });
    }
    // 3rd failure → Escalate to Chairman (may need to recurse to Stage 3)
    else {
      await escalateToChairman({
        ventureId,
        reason: 'MAX_TRADEMARK_FAILURES',
        message: `Stage 11 has failed trademark search ${recursionCount + 1} times. Systematic naming conflicts detected.`,
        options: [
          {
            action: 'RETRY_WITH_AGENCY',
            label: 'Engage specialized naming agency',
            description: 'External experts may find creative trademark-clear names'
          },
          {
            action: 'ACCEPT_RISK',
            label: 'Accept Medium Risk candidate with legal mitigation',
            description: 'Proceed with trademark application, accept potential opposition'
          },
          {
            action: 'RECURSE_TO_STAGE_3',
            label: 'Recurse to Stage 3 (reassess solution)',
            description: 'Brand strategy may target overly saturated market, reassess approach',
            severity: 'HIGH',
            targetStage: 3
          },
          {
            action: 'SIMPLIFY_BRAND',
            label: 'Simplify brand strategy (reduce scope)',
            description: 'Target less competitive naming space (e.g., niche vs broad market)'
          }
        ]
      });
    }
  }
}
```

**Evidence**: (Proposed trigger, addresses critique gaps at lines 24, 26 "Unclear rollback procedures, No explicit error handling")

---

### PROPOSED: QUALITY-001 (Brand Strength Below Threshold)

**Trigger Type**: QUALITY-001
**From Stage**: 11 (Strategic Naming & Brand Foundation)
**To Stage**: 11 (Substage 11.1 - Name Generation)
**Severity**: LOW
**Auto-Execute**: Yes

**Condition**: All name candidates score <70/100 on brand strength

**Scenario**:
- Name generation produces 10-15 candidates
- All candidates score below 70/100 threshold
- Indicates weak naming strategy or overly restrictive constraints
- **Action**: Auto-recurse to Substage 11.1 with relaxed constraints or different naming methodologies

**Trigger Logic** (proposed):
```javascript
async function onStage11NameScoringComplete(ventureId, scoringResults) {
  const strongCandidates = scoringResults.candidates.filter(c => c.brandStrengthScore >= 70);

  // Zero strong candidates → Auto-recurse with adjusted strategy
  if (strongCandidates.length === 0) {
    // Analyze why all candidates scored low
    const weaknessAnalysis = scoringResults.analyzeWeaknesses();

    await recursionEngine.triggerRecursion({
      ventureId,
      fromStage: 11,
      toStage: 11,
      substage: '11.1',
      triggerType: 'QUALITY-001',
      triggerData: {
        failed_candidates: scoringResults.candidates.map(c => ({
          name: c.name,
          score: c.brandStrengthScore,
          weaknesses: c.scoringBreakdown
        })),
        weakness_analysis: weaknessAnalysis,
        recommended_adjustments: weaknessAnalysis.suggestAdjustments() // e.g., "try metaphorical names instead of descriptive"
      },
      severity: 'LOW',
      autoExecuted: true,
      resolution_notes: `All ${scoringResults.candidates.length} name candidates scored <70/100 (weak brand strength).

      Common Weaknesses:
      - Memorability: Average ${weaknessAnalysis.avgMemorability}/25
      - Differentiation: Average ${weaknessAnalysis.avgDifferentiation}/25
      - Relevance: Average ${weaknessAnalysis.avgRelevance}/25
      - Linguistic: Average ${weaknessAnalysis.avgLinguistic}/25

      Recommended Adjustments:
      ${weaknessAnalysis.suggestAdjustments().map((a, idx) => `${idx + 1}. ${a}`).join('\n      ')}

      Auto-regenerating names with adjusted strategy.`
    });
  }
}
```

**Evidence**: (Proposed trigger, addresses critique gap at line 39 "Missing threshold values")

---

## Inbound Recursion Triggers (None Found)

**Scanned for recursion TO Stage 11**:
- Stage 10 critique: NO triggers to Stage 11
- Stage 12 critique: NO triggers to Stage 11
- Other stages: Not scanned (Stage 11 dependencies only from Stage 10)

**Conclusion**: No stages currently trigger recursion back to Stage 11.

**Proposed Inbound Trigger**:
- FROM Stage 12 (Adaptive Naming Module): If adaptive naming variations fail brand consistency checks, COULD recurse to Stage 11 to revise brand guidelines
- FROM Stage 13+ (Marketing/Execution): If brand name causes customer confusion or legal issues in production, COULD recurse to Stage 11 to rebrand

**Evidence**: (Proposed, no current implementation)

---

## Loop Prevention (Proposed)

**Max Recursions**:
- LEGAL-001 (trademark failures): 2 auto-recursions, then escalate to Chairman
- QUALITY-001 (weak brand strength): 3 auto-recursions, then escalate to Chairman
- MKT-001 (market validation failure): 1 recursion (requires Chairman approval)

**Tracking**:
```javascript
// Before triggering recursion, check count
const recursionCount = await db.recursion_events.count({
  where: { ventureId, fromStage: 11, triggerType: triggerType }
});

if (recursionCount >= maxRecursions[triggerType]) {
  await escalateToChairman({
    ventureId,
    reason: 'MAX_RECURSIONS_REACHED',
    message: `Stage 11 has triggered ${triggerType} recursion ${recursionCount} times.`
  });
} else {
  await recursionEngine.triggerRecursion({...});
}
```

---

## Chairman Controls (Proposed)

### MKT-001 (Brand Validation Failure)

**Severity**: MEDIUM
**Approval**: Required before recursion
**Chairman Options**:
1. **Approve recursion to Stage 4/6**: Re-validate market with deeper research
2. **Accept brand name anyway**: Market resonance may improve with marketing effort
3. **Simplify brand strategy**: Target niche audience (higher resonance, smaller market)
4. **Kill venture**: Brand misalignment may indicate fundamental market-product mismatch

---

### LEGAL-001 (Trademark Unavailable, 3rd failure)

**Severity**: HIGH (when escalated after 2 auto-recursions)
**Approval**: Required for Stage 3 recursion
**Chairman Options**:
1. **Engage naming agency**: External expertise may find trademark-clear names
2. **Accept Medium Risk**: Proceed with trademark application, accept potential opposition
3. **Recurse to Stage 3**: Reassess solution approach (brand strategy may be flawed)
4. **Simplify brand**: Target less competitive naming space

---

## Performance Requirements (Proposed)

**Name generation**: <30 seconds for 10-15 candidates (with AI assistance)
**Linguistic analysis**: <10 seconds per candidate (<2 minutes total for 15 candidates)
**Trademark search**: <5 seconds per candidate (API-based, <1 minute total for 15 candidates)
**Domain check**: <2 seconds per candidate (<30 seconds total for 15 candidates)
**Brand strength scoring**: <1 second per candidate (<15 seconds total)

**Total Substage 11.1**: <5 minutes (assisted), 2-3 days (manual)
**Total Substage 11.2**: <10 minutes (assisted), 2-3 days (manual)
**Total Substage 11.3**: 1-2 hours (assisted with templates), 2-3 days (manual)

**Total Stage 11**: <2 hours (fully automated), 2-3 days (assisted), 5-7 days (manual)

---

## UI/UX Implications (Proposed)

### Brand Strength Dashboard

**Real-time indicators during name generation**:
- **Candidate count**: 15/15 generated
- **Strong candidates** (≥70/100): 5 candidates (33%)
- **Top candidate**: "CloudForge" (77/100)
- **Breakdown**: Memorability 18/25, Differentiation 15/25, Relevance 24/25, Linguistic 20/25

**Visual Design**:
- Green bar: Strong candidates (≥70)
- Yellow bar: Medium candidates (50-69)
- Red bar: Weak candidates (<50)
- Expandable cards: Detailed scoring per candidate

---

### Trademark Risk Dashboard

**Real-time indicators during trademark search**:
- **Clear candidates**: 2/5 (40%)
- **Low Risk candidates**: 1/5 (20%)
- **Medium/High Risk candidates**: 2/5 (40%) - ⚠️ Warning
- **Domain availability**: 3/5 .com available (60%)

**Visual Design**:
- Green badge: Clear (no conflicts)
- Yellow badge: Low Risk (minor conflicts in unrelated industries)
- Orange badge: Medium Risk (conflicts in related industries)
- Red badge: High Risk (direct conflicts in same industry)

---

### Recursion Warning Modal (If LEGAL-001 triggered)

**When all candidates fail trademark search**:

```
⚠️ Trademark Search Failed — All Candidates Blocked

0/15 candidates have trademark clearance.

Blocking Issues:
1. [High Risk] "CloudForge" — Direct conflict with CloudForge LLC (Class 42, software)
2. [High Risk] "DataStream" — Phonetic match with DataStream Inc (Class 42, SaaS)
3. [Medium Risk] "MarketPulse" — Visual similarity to MarketPulse Ltd (Class 35, marketing)
...

Auto-Action: Regenerating names with trademark constraints (avoid 'Cloud', 'Data', 'Market' prefixes)

[View Constraints] [Cancel Auto-Recursion] [Escalate to Chairman]
```

---

## Integration Points (Proposed)

### recursionEngine.ts

**Usage**:
```typescript
import { RecursionEngine } from './recursionEngine';

const engine = new RecursionEngine();

// Trigger MKT-001 recursion
await engine.triggerRecursion({
  ventureId,
  fromStage: 11,
  toStage: 4,
  triggerType: 'MKT-001',
  severity: 'MEDIUM',
  autoExecuted: false,
  triggerData: { market_resonance_score: 45, brand_name: 'CloudForge' },
  resolution_notes: 'Brand name failed market resonance (45/100, threshold: 60/100)'
});
```

---

### recursion_events Table

**Schema** (same as Stage 10):
```sql
CREATE TABLE recursion_events (
  id UUID PRIMARY KEY,
  venture_id UUID NOT NULL REFERENCES ventures(id),
  from_stage INTEGER NOT NULL,
  to_stage INTEGER NOT NULL,
  trigger_type VARCHAR(20) NOT NULL,  -- 'MKT-001', 'LEGAL-001', 'QUALITY-001'
  severity VARCHAR(20) NOT NULL,      -- 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'
  auto_executed BOOLEAN NOT NULL,
  trigger_data JSONB,
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolution_action VARCHAR(50)
);
```

---

## Gap Summary

**Current State**: Stage 11 has NO recursion triggers defined (honest gap).

**Proposed State**: 3 recursion trigger types (MKT-001, LEGAL-001, QUALITY-001) with Chairman controls.

**Implementation Priority**:
1. **LEGAL-001** (trademark failures): Highest priority, addresses primary risk (process delays)
2. **QUALITY-001** (weak brand strength): Medium priority, improves brand quality
3. **MKT-001** (market validation failure): Lower priority, requires customer validation implementation first

**Cross-Reference**: (Feeds SD-RECURSION-ENGINE-001 for Stage 11 trigger implementation)

---

<!-- Generated by Claude Code Phase 6 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
