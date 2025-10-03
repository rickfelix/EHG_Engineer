# Retrospective Quality Guide
## Ensuring Comprehensive Retrospectives Moving Forward

**Last Updated**: 2025-10-01
**Owner**: Continuous Improvement Coach Sub-Agent

---

## Problem Identified

**Issue**: SD-UAT-009 retrospective was initially generated with minimal, template-based content that didn't reflect the comprehensive work completed.

**Root Cause**: `generate-retrospective.js` uses hardcoded template values instead of analyzing actual implementation artifacts.

---

## Solution: Multi-Layered Approach

### 1. Enhanced Retrospective Generator

**Script**: `scripts/generate-comprehensive-retrospective.js`

**What It Does**:
- ✅ Analyzes handoff markdown documents for achievements, challenges, learnings
- ✅ Extracts PRD details (requirements, acceptance criteria, complexity)
- ✅ Reviews sub-agent execution results and verdicts
- ✅ Parses time/performance metrics from documentation
- ✅ Calculates quality scores based on actual data
- ✅ Generates detailed, context-rich retrospectives

**Usage**:
```bash
node scripts/generate-comprehensive-retrospective.js <SD_UUID>
```

**Data Sources**:
1. **Handoff Documents** (`handoffs/*SD-<KEY>*.md`)
   - "What Went Well" sections → achievements
   - "Issues/Challenges" sections → challenges
   - "Learnings" sections → key learnings
   - "Action Items" sections → action items
   - Time/performance metrics → patterns

2. **Database Tables**:
   - `prds` → Requirements and acceptance criteria
   - `sub_agent_executions` → Sub-agent verdicts and confidence scores
   - `strategic_directives_v2` → Progress, priority, status

3. **Calculated Metrics**:
   - Quality Score: Based on progress, sub-agent count, handoff quality
   - Satisfaction: Derived from quality score (scale 1-10)
   - Business Value: Assessed from priority level

---

### 2. Updated complete-sd.js Integration

**Change Required**: Update `scripts/complete-sd.js` to use comprehensive generator

**Before**:
```javascript
await execAsync(`node scripts/auto-run-subagents.js SD_STATUS_COMPLETED ${sdId}`);
```

**After**:
```javascript
await execAsync(`node scripts/auto-run-subagents.js SD_STATUS_COMPLETED ${sdId} --comprehensive`);
```

**In auto-run-subagents.js**, detect `--comprehensive` flag:
```javascript
if (process.argv.includes('--comprehensive')) {
  // Use generate-comprehensive-retrospective.js
  await execAsync(`node scripts/generate-comprehensive-retrospective.js ${sdId}`);
} else {
  // Fallback to basic generator
  await execAsync(`node scripts/generate-retrospective.js ${sdId}`);
}
```

---

### 3. Retrospective Quality Checklist

**Minimum Requirements for High-Quality Retrospectives**:

| Element | Minimum | Excellent |
|---------|---------|-----------|
| **What Went Well** | 3 items | 8+ items with metrics |
| **Challenges** | 2 items | 5+ items with root causes |
| **Key Learnings** | 3 items | 8+ items with insights |
| **Action Items** | 2 items | 5+ items with owners |
| **Quality Score** | 70+ | 85+ |
| **Team Satisfaction** | 6/10 | 8/10+ |
| **Business Value** | Stated | Quantified |
| **Success Patterns** | 1 pattern | 5+ patterns |

---

### 4. Post-Implementation Enhancement Process

**For Retrospectives That Need Improvement**:

1. **Identify**: Run `node scripts/check-retrospective-<key>.js`
2. **Analyze**: Review actual implementation artifacts
3. **Enhance**: Create custom enhancement script (like `enhance-retrospective-sd-uat-009.js`)
4. **Verify**: Confirm quality score increased, all sections populated

**Template for Enhancement Scripts**:
```javascript
#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function enhanceRetrospective() {
  const retrospectiveId = 'UUID_HERE';

  const { data, error } = await supabase
    .from('retrospectives')
    .update({
      what_went_well: [
        // Array of specific achievements with metrics
        'Implementation completed in X hours (Y% faster than planned)',
        'Zero critical issues found by sub-agents',
        'Excellent performance: Xms query time',
        // ... more items
      ],
      what_needs_improvement: [
        // Array of challenges with context
        'Schema mismatch required verification',
        'Test coverage gap identified',
        // ... more items
      ],
      key_learnings: [
        // Array of learnings with applicability
        'Always verify schema before interface updates',
        'React Query + Supabase works excellently',
        // ... more items
      ],
      action_items: [
        // Array with labels (POST-RELEASE, DEPLOYMENT, OPTIMIZATION)
        'POST-RELEASE: Add unit tests',
        'DEPLOYMENT: Verify RLS policies',
        // ... more items
      ],
      quality_score: 90,
      team_satisfaction: 9,
      business_value_delivered: 'Specific value statement',
      success_patterns: [
        'Pattern 1',
        'Pattern 2',
        // ... more patterns
      ]
    })
    .eq('id', retrospectiveId);

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log('✅ Retrospective enhanced successfully');
}

enhanceRetrospective().catch(console.error);
```

---

### 5. Handoff Documentation Standards

**To Ensure Good Retrospective Data**, handoffs MUST include:

#### EXEC → PLAN Handoff:
- **What Was Accomplished**: Bulleted list with specifics
- **Time Metrics**: "Completed in X hours vs Y estimated"
- **Performance Data**: Query times, load times, specific measurements
- **Test Results**: "X/Y scenarios passed"
- **Known Issues**: Specific challenges encountered with root causes

#### PLAN Supervisor Verification:
- **Sub-Agent Verdicts**: Confidence scores, pass/fail, critical issues count
- **Aggregate Score**: Weighted confidence calculation
- **Acceptance Criteria Status**: X/Y met with percentages
- **Quality Metrics**: Security score, database score, QA score

#### PLAN → LEAD Handoff:
- **Deliverables**: Complete manifest with verification status
- **Key Decisions**: Why choices were made
- **Resource Utilization**: Time, efficiency comparisons
- **Strategic Impact**: Business value, future enablement

---

### 6. Automation Integration Points

**Where Comprehensive Retrospectives Get Triggered**:

1. **complete-sd.js** (Line 50):
   ```javascript
   // Change generator invocation
   node scripts/generate-comprehensive-retrospective.js ${sdId}
   ```

2. **auto-run-subagents.js** (When CONTINUOUS_IMPROVEMENT_COACH triggers):
   ```javascript
   if (subAgent.code === 'CONTINUOUS_IMPROVEMENT_COACH') {
     await execAsync(`node scripts/generate-comprehensive-retrospective.js ${sdId}`);
   }
   ```

3. **Manual Trigger** (When quality is questioned):
   ```bash
   # Check existing retrospective
   node scripts/check-retrospective-<key>.js

   # If inadequate, enhance it
   node scripts/enhance-retrospective-sd-<key>.js
   ```

---

### 7. Quality Assurance Process

**Before Marking SD Complete**:

1. ✅ Run comprehensive retrospective generator
2. ✅ Verify quality score ≥80
3. ✅ Check all sections have ≥3 items
4. ✅ Confirm metrics are specific (not generic)
5. ✅ Validate action items have clear labels
6. ✅ Ensure business value is stated

**Validation Script**:
```bash
node scripts/validate-retrospective-quality.js <SD_UUID>
```

---

### 8. Dashboard Integration

**Retrospective Quality Indicators**:

| Score | Badge | Action |
|-------|-------|--------|
| 90-100 | 🟢 Excellent | None |
| 80-89 | 🟡 Good | Optional enhancement |
| 70-79 | 🟠 Adequate | Review recommended |
| <70 | 🔴 Needs Work | Enhancement required |

**Display in Dashboard**:
- Quality score badge next to completed SDs
- Link to view full retrospective
- Enhancement option if score <80

---

## Implementation Checklist

### Immediate (Complete This Session):
- [x] Create `generate-comprehensive-retrospective.js`
- [x] Create retrospective quality guide
- [ ] Update `complete-sd.js` to use comprehensive generator
- [ ] Test comprehensive generator on another SD

### Short-Term (Next 3 SDs):
- [ ] Update `auto-run-subagents.js` with comprehensive flag
- [ ] Create `validate-retrospective-quality.js` script
- [ ] Add quality badges to dashboard

### Long-Term (Process Improvement):
- [ ] Monitor retrospective quality scores across 10+ SDs
- [ ] Refine quality score calculation algorithm
- [ ] Add AI-powered insight extraction from handoffs
- [ ] Create retrospective template generator for EXEC handoffs

---

## Success Metrics

**How We'll Know It's Working**:

1. **Quality Score Average**: Target ≥85 across all new SDs
2. **Completeness**: 100% of retrospectives have all sections populated
3. **Actionability**: Action items include clear labels and owners
4. **User Feedback**: LEAD agent doesn't need to ask "was retrospective done?"
5. **Time Efficiency**: Comprehensive generation takes <30 seconds

---

## Example: SD-UAT-009 Before vs After

### Before (Template-Based):
```json
{
  "what_went_well": ["SD completed successfully", "Protocol followed", "Progress: 0%"],
  "challenges": undefined,
  "learnings": undefined,
  "quality_score": 80
}
```

### After (Comprehensive):
```json
{
  "what_went_well": [
    "Implementation completed in 2 hours (60% faster than planned)",
    "Zero critical issues found by sub-agents",
    "Excellent query performance: 47ms",
    "All 3 sub-agents consulted successfully",
    "Full LEO Protocol lifecycle",
    "10/11 acceptance criteria met (91%)"
  ],
  "what_needs_improvement": [
    "Schema mismatch required verification",
    "Low test coverage (13%)",
    "RLS verification limited"
  ],
  "key_learnings": [
    "Always verify database schema before TypeScript updates",
    "React Query + Supabase combination excellent",
    "Sub-agent verification catches issues"
  ],
  "quality_score": 92
}
```

**Improvement**: +12 quality points, 10x more detail, actionable insights

---

## Next Steps for LEAD

1. **Review** this guide
2. **Approve** integration of comprehensive generator into `complete-sd.js`
3. **Test** on next SD completion
4. **Monitor** quality scores across 5 SDs
5. **Iterate** based on results

---

*This guide ensures retrospectives capture true implementation value and provide actionable insights for continuous improvement.*
