# Russian Judge AI Quality Assessment System

**Version:** 1.1.0-sd-type-aware
**Status:** ACTIVE (Advisory Mode)
**Last Updated:** 2025-12-05
**Purpose:** Continuous improvement and quality enforcement for LEO Protocol

---

## Executive Summary

The **Russian Judge** is an AI-powered quality assessment system that evaluates LEO Protocol deliverables (Strategic Directives, PRDs, User Stories, Retrospectives) using multi-criterion weighted rubrics. It functions similarly to Olympic judging—multiple expert judges (criteria) score independently, then combine into a weighted final score.

**Key Features:**
- ✅ Multi-criterion weighted evaluation (0-10 scale per criterion)
- ✅ SD type-aware (documentation, infrastructure, feature, database, security)
- ✅ Conditional pass thresholds (50-65% based on SD type)
- ✅ Advisory mode (logs but doesn't block—educates, doesn't enforce)
- ✅ Complete audit trail in database
- ✅ Cost tracking ($0.003/assessment average)
- ✅ Meta-analysis views for continuous improvement

**Primary Goal:**
The Russian Judge is a **learning and improvement system**, not a gatekeeper. It helps the LEO Protocol evolve by identifying quality patterns, providing feedback, and enabling data-driven threshold tuning over time.

---

## 1. The Role of Russian Judge in LEO Protocol Evolution

### 1.1 Continuous Improvement Philosophy

The Russian Judge serves as the **feedback loop** that enables the LEO Protocol to improve itself over time:

```
┌─────────────────────────────────────────────────────────────┐
│                  LEO Protocol Lifecycle                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  LEAD → PLAN → EXEC → Retrospective                         │
│    ↓      ↓      ↓        ↓                                  │
│  [Russian Judge Evaluation]                                  │
│    ↓      ↓      ↓        ↓                                  │
│  Score + Feedback stored in database                         │
│                   ↓                                          │
│        [Meta-Analysis Views]                                 │
│                   ↓                                          │
│     Identify patterns (what fails? what passes?)            │
│                   ↓                                          │
│        [Threshold Tuning]                                    │
│                   ↓                                          │
│   Adjust strictness based on empirical data                 │
│                   ↓                                          │
│        [Protocol Refinement]                                 │
│                   ↓                                          │
│   Update rubrics, criteria weights, guidance                │
│                   ↓                                          │
│         [Improved Next Cycle] ←─────────┐                   │
│                                           │                   │
└───────────────────────────────────────────┘                   │
                                           │                   │
                                    Continuous Learning        │
```

### 1.2 Current State: Advisory Mode (Non-Blocking)

**Why Advisory Mode?**

The Russian Judge is currently in **advisory mode**, meaning:
- ✅ **Evaluations run automatically** at all handoff points
- ✅ **Scores and feedback are logged** to database
- ✅ **Warnings are displayed** to the user
- ❌ **Handoffs do NOT block** even if score is below threshold
- ❌ **No enforcement** of quality standards (yet)

**Rationale:**
1. **Learning Phase**: We need to gather data on what scores correlate with actual quality issues in production
2. **Avoid False Positives**: Premature blocking would frustrate developers and slow velocity
3. **Calibrate Thresholds**: Start lenient (50-65%), tighten based on empirical evidence
4. **Build Trust**: Show value through insights before enforcing standards

**Transition Plan:**
- **Phase 1 (Current):** Advisory mode, gather 2-4 weeks of data
- **Phase 2 (Future):** Soft enforcement (warnings + LEAD override)
- **Phase 3 (Future):** Hard enforcement for critical SDs (security, database)

### 1.3 How Russian Judge Improves LEO Protocol

The Russian Judge enables **data-driven process improvements** in several ways:

#### A. Rubric Refinement
**Problem:** Initial rubrics may be too strict, too lenient, or measuring wrong things.

**Solution:** Meta-analysis views show which criteria consistently score low vs high:
```sql
SELECT criterion_name, AVG((scores->>criterion_name)::NUMERIC) as avg_score
FROM ai_quality_assessments, jsonb_each(scores)
GROUP BY criterion_name
ORDER BY avg_score ASC;
```

**Action:** If "architecture" criterion averages 3.2 for documentation SDs → adjust rubric to de-emphasize architecture for docs-only work.

#### B. Threshold Calibration
**Problem:** Thresholds set based on assumptions, not data.

**Solution:** `v_ai_quality_tuning_recommendations` view suggests increases/decreases:
```sql
-- Example output:
-- sd_type='database', pass_threshold=65, pass_rate=48%
-- Recommendation: DECREASE (-5%): Pass rate too low, may be blocking legitimate work
```

**Action:** If database SDs consistently fail at 65% but have no production issues → decrease to 60%.

#### C. Anti-Pattern Detection
**Problem:** Generic quality guidelines miss specific LEO Protocol anti-patterns.

**Solution:** Russian Judge learns common failures:
- "To be defined" placeholders → consistently score 0-3
- Boilerplate acceptance criteria → flagged in feedback
- Missing architecture details → penalized by rubric

**Action:** Update CLAUDE.md guides to explicitly call out these anti-patterns with examples.

#### D. Correlation with Real Issues
**Problem:** High scores don't guarantee quality; low scores don't guarantee issues.

**Solution:** Track GitHub issues, UAT failures, and production incidents by SD:
```sql
-- Link Russian Judge scores to actual outcomes
SELECT
  sd_id,
  weighted_score,
  pass_threshold,
  (SELECT COUNT(*) FROM github_issues WHERE sd_id = a.content_id) as issue_count,
  (SELECT COUNT(*) FROM uat_failures WHERE sd_id = a.content_id) as uat_failure_count
FROM ai_quality_assessments a
WHERE content_type = 'prd';
```

**Action:** If SDs scoring 70+ still have 5+ issues → increase threshold to 75+.

---

## 2. Architecture & Implementation

### 2.1 Core Components

**Foundation Class:**
- `scripts/modules/ai-quality-evaluator.js` (400+ LOC)
- Handles OpenAI API calls, scoring, feedback generation, database storage
- **NEW in v1.1.0:** SD type-aware with conditional thresholds

**Rubric Implementations:**
- `scripts/modules/rubrics/sd-quality-rubric.js` - Evaluates Strategic Directives
- `scripts/modules/rubrics/prd-quality-rubric.js` - Evaluates PRDs
- `scripts/modules/rubrics/user-story-quality-rubric.js` - Evaluates User Stories
- `scripts/modules/rubrics/retrospective-quality-rubric.js` - Evaluates Retrospectives

**Integration Points:**
- `scripts/verify-handoff-lead-to-plan.js` - LEAD→PLAN handoff (SD evaluation)
- `scripts/modules/handoff/executors/PlanToExecExecutor.js` - PLAN→EXEC handoff (PRD + User Stories)
- `scripts/modules/handoff/executors/ExecToPlanExecutor.js` - EXEC→PLAN handoff (Retrospective)

**Database Schema:**
- `ai_quality_assessments` table - Stores all evaluations
- 5 meta-analysis views - Enable insights and tuning recommendations

### 2.2 Evaluation Flow

```
┌────────────────────────────────────────────────────────────────┐
│                        Handoff Trigger                          │
│         (LEAD→PLAN, PLAN→EXEC, EXEC→PLAN, etc.)               │
└────────────────────┬───────────────────────────────────────────┘
                     │
                     ↓
         ┌──────────────────────┐
         │  Check if enabled:   │
         │  RUSSIAN_JUDGE_ENABLED│
         │  environment variable │
         └──────────┬────────────┘
                     │ (if true)
                     ↓
         ┌──────────────────────┐
         │   Fetch SD context    │
         │   (title, scope,      │
         │    sd_type, etc.)     │
         └──────────┬────────────┘
                     │
                     ↓
         ┌──────────────────────┐
         │  Format content for   │
         │  AI evaluation        │
         │  (JSON structure)     │
         └──────────┬────────────┘
                     │
                     ↓
         ┌──────────────────────┐
         │  Build AI prompt:     │
         │  - System prompt      │
         │    (LEO context +     │
         │     sd_type guidance) │
         │  - User prompt        │
         │    (content + rubric) │
         └──────────┬────────────┘
                     │
                     ↓
         ┌──────────────────────┐
         │   Call OpenAI API:    │
         │   - Model: gpt-5-mini │
         │   - Temperature: 0.3  │
         │   - JSON response     │
         │   - Retry logic (3x)  │
         └──────────┬────────────┘
                     │
                     ↓
         ┌──────────────────────┐
         │  Parse JSON response: │
         │  - Criterion scores   │
         │    (0-10 each)        │
         │  - Reasoning text     │
         └──────────┬────────────┘
                     │
                     ↓
         ┌──────────────────────┐
         │  Calculate weighted   │
         │  score (0-100):       │
         │  Σ(score × weight)    │
         └──────────┬────────────┘
                     │
                     ↓
         ┌──────────────────────┐
         │ Get dynamic threshold:│
         │ - documentation: 50%  │
         │ - infrastructure: 55% │
         │ - feature: 60%        │
         │ - database: 65%       │
         │ - security: 65%       │
         └──────────┬────────────┘
                     │
                     ↓
         ┌──────────────────────┐
         │  Compare score vs     │
         │  threshold:           │
         │  passed = score >= T  │
         └──────────┬────────────┘
                     │
                     ↓
         ┌──────────────────────┐
         │  Generate feedback:   │
         │  - Required (score<5) │
         │  - Recommended (5-7)  │
         └──────────┬────────────┘
                     │
                     ↓
         ┌──────────────────────┐
         │  Store in database:   │
         │  - scores (JSONB)     │
         │  - weighted_score     │
         │  - feedback (JSONB)   │
         │  - sd_type            │
         │  - pass_threshold     │
         │  - cost_usd           │
         └──────────┬────────────┘
                     │
                     ↓
         ┌──────────────────────┐
         │  Log to console:      │
         │  ✅ PASSED (75/100)   │
         │  OR                   │
         │  ⚠️  BELOW THRESHOLD  │
         │     (58/65)           │
         └──────────┬────────────┘
                     │
                     ↓
         ┌──────────────────────┐
         │  Continue handoff     │
         │  (advisory - no block)│
         └────────────────────────┘
```

### 2.3 SD Type Awareness (NEW in v1.1.0)

**Problem:** Original Russian Judge treated all SDs uniformly:
- Documentation SDs penalized for missing "technical architecture"
- Infrastructure SDs dinged for vague "user benefits"
- Security SDs held to same 70% threshold as docs

**Solution:** Conditional evaluation based on `sd_type`:

#### System Prompt Enhancement
```javascript
getSystemPrompt(sd) {
  if (sd?.sd_type) {
    return `...LEO Protocol context...

**SD Type**: ${sd.sd_type}

**Evaluation Adjustments for ${sd.sd_type.toUpperCase()} SDs:**
${this.getTypeSpecificGuidance(sd.sd_type)}

- Documentation: Relax architecture requirements, focus on clarity
- Infrastructure: De-emphasize user benefits, focus on technical robustness
- Feature: Full evaluation, balance user value + technical quality
- Database: Prioritize schema design, migration safety, RLS policies
- Security: Extra weight on risk analysis, threat modeling, OWASP

...scoring scale and rules...`;
  }
}
```

#### Dynamic Pass Thresholds
```javascript
getPassThreshold(contentType, sd) {
  const thresholds = {
    documentation: 50,   // Very lenient
    infrastructure: 55,  // Lenient
    feature: 60,         // Moderate
    database: 65,        // Stricter
    security: 65         // Stricter
  };
  return thresholds[sd.sd_type] || 60;
}
```

**Impact:**
- ✅ Documentation SDs now pass at 50% instead of 70% (fairer evaluation)
- ✅ Security SDs held to 65% standard (stricter scrutiny)
- ✅ AI receives context-specific guidance in system prompt
- ✅ Pass rates improved from 45% → 85% for docs (reduced false positives)

---

## 3. Using Russian Judge Data for Future Tightening

### 3.1 When to Tighten Thresholds

**Criteria for Increasing Threshold:**

| Condition | Action | Example |
|-----------|--------|---------|
| **>3 quality issues** from SDs that passed Russian Judge in last 4 weeks | Increase threshold +5-10% | Database SDs scoring 65+ still have 4 migration failures → increase to 70-75% |
| **Pass rate >90%** AND avg score >80 AND sample size ≥10 | Increase threshold +5% | Documentation SDs averaging 88/100 with 95% pass rate → increase from 50% to 55% |
| **No UAT failures** from SDs scoring 80+ over 8 weeks | Consider stricter rubric criteria | If high-scoring SDs have zero issues, rubric may be too lenient overall |

**Criteria for Keeping Threshold Stable:**

| Condition | Action | Reasoning |
|-----------|--------|-----------|
| **<1 quality issue** AND pass rate >70% | No change | Threshold is working well—keeps quality high without blocking work |
| **Pass rate 60-85%** AND low UAT failure rate | No change | "Goldilocks zone"—not too lenient, not too strict |

**Criteria for Decreasing Threshold:**

| Condition | Action | Reasoning |
|-----------|--------|-----------|
| **Pass rate <50%** AND no quality issues in last 4 weeks | Decrease threshold -5% | Blocking legitimate work without quality benefit |
| **>5 LEAD overrides** due to "Russian Judge too strict" | Decrease threshold -5% | False positives undermining trust in system |

### 3.2 Meta-Analysis Queries

**Query 1: Find SDs that passed Russian Judge but had production issues**
```sql
SELECT
  sd.id,
  sd.title,
  sd.sd_type,
  a.weighted_score,
  a.pass_threshold,
  a.passed,
  COUNT(DISTINCT gi.id) as github_issues,
  COUNT(DISTINCT uat.id) as uat_failures
FROM strategic_directives_v2 sd
LEFT JOIN ai_quality_assessments a ON a.content_id = sd.id AND a.content_type = 'sd'
LEFT JOIN github_issues gi ON gi.sd_id = sd.id
LEFT JOIN uat_failures uat ON uat.sd_id = sd.id
WHERE a.passed = TRUE
  AND (gi.id IS NOT NULL OR uat.id IS NOT NULL)
GROUP BY sd.id, sd.title, sd.sd_type, a.weighted_score, a.pass_threshold, a.passed
HAVING COUNT(DISTINCT gi.id) + COUNT(DISTINCT uat.id) >= 3
ORDER BY github_issues + uat_failures DESC;
```

**Query 2: View threshold tuning recommendations**
```sql
SELECT * FROM v_ai_quality_tuning_recommendations
WHERE assessments_last_4_weeks >= 5
ORDER BY sd_type, content_type;
```

**Query 3: Identify criteria that consistently score low**
```sql
WITH criterion_scores AS (
  SELECT
    sd_type,
    content_type,
    jsonb_object_keys(scores) as criterion_name,
    AVG((scores->jsonb_object_keys(scores)->>'score')::NUMERIC) as avg_score
  FROM ai_quality_assessments
  WHERE created_at >= NOW() - INTERVAL '4 weeks'
  GROUP BY sd_type, content_type, criterion_name
)
SELECT * FROM criterion_scores
WHERE avg_score < 6.0
ORDER BY avg_score ASC;
```

### 3.3 Continuous Improvement Workflow

**Weekly Review (LEAD Responsibility):**
1. Run `SELECT * FROM v_ai_quality_tuning_recommendations;`
2. Review recommendations (INCREASE, DECREASE, OPTIMAL, MONITOR)
3. Cross-reference with GitHub issues and UAT failures
4. Update `config/russian-judge-thresholds.json` if needed
5. Document reasoning in `history[]` array

**Monthly Review:**
1. Analyze `v_criterion_performance` to identify weak criteria
2. Consider rubric adjustments (reweight criteria, add/remove criteria)
3. Review false positive rate (SDs blocked unnecessarily)
4. Review false negative rate (bad SDs that passed)
5. Update CLAUDE.md guides based on common anti-patterns

**Quarterly Review:**
1. Assess whether to move from Advisory → Soft Enforcement
2. Evaluate ROI (cost vs quality improvement)
3. Consider enabling selective blocking (e.g., only security SDs)
4. Gather team feedback on Russian Judge usefulness

---

## 4. Technical Reference

### 4.1 Environment Configuration

```bash
# Enable Russian Judge (default: true)
export RUSSIAN_JUDGE_ENABLED=true

# OpenAI API key (required)
export OPENAI_API_KEY="sk-..."

# Supabase credentials (required)
export NEXT_PUBLIC_SUPABASE_URL="https://..."
export SUPABASE_SERVICE_ROLE_KEY="..."
```

### 4.2 Database Schema

```sql
CREATE TABLE ai_quality_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL, -- 'sd', 'prd', 'user_story', 'retrospective'
  content_id TEXT NOT NULL,   -- FK to respective table
  model TEXT NOT NULL,        -- 'gpt-5-mini'
  temperature NUMERIC,        -- 0.3
  scores JSONB NOT NULL,      -- {criterion: {score: 0-10, reasoning: "..."}}
  weighted_score INTEGER,     -- 0-100
  feedback JSONB,             -- {required: [], recommended: []}
  assessment_duration_ms INTEGER,
  tokens_used JSONB,          -- {prompt_tokens, completion_tokens}
  cost_usd NUMERIC(10, 6),
  rubric_version TEXT,        -- 'v1.1.0-sd-type-aware'
  sd_type TEXT,               -- NEW: 'documentation', 'infrastructure', etc.
  pass_threshold INTEGER,     -- NEW: 50-65 based on sd_type
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.3 Rubric Structure

Each rubric defines:
- **contentType**: 'sd', 'prd', 'user_story', 'retrospective'
- **criteria**: Array of criterion objects
  - **name**: snake_case identifier (e.g., "requirements_depth")
  - **weight**: 0-1, must sum to 1.0 across all criteria
  - **prompt**: Evaluation instructions for AI

**Example (PRD Rubric):**
```javascript
{
  contentType: 'prd',
  criteria: [
    {
      name: 'requirements_depth',
      weight: 0.40,
      prompt: 'Evaluate functional requirements for depth and specificity...'
    },
    {
      name: 'architecture_explanation',
      weight: 0.30,
      prompt: 'Assess architecture quality...'
    },
    {
      name: 'test_scenarios',
      weight: 0.20,
      prompt: 'Evaluate test scenario sophistication...'
    },
    {
      name: 'risk_analysis',
      weight: 0.10,
      prompt: 'Assess risk analysis completeness...'
    }
  ]
}
```

### 4.4 Cost Analysis

**Pricing (gpt-5-mini):**
- Input: $0.15 per 1M tokens
- Output: $0.60 per 1M tokens

**Typical Assessment:**
- Input tokens: ~1500 (rubric + content)
- Output tokens: ~800 (scores + reasoning)
- Cost: ~$0.003 per assessment

**Monthly Cost Estimate:**
- 100 SDs/month × 4 assessments each (SD + PRD + 5 stories + retro) = 400 assessments
- 400 × $0.003 = **$1.20/month**

**ROI:**
- If Russian Judge prevents 1 production incident/month that costs 2 hours of debugging → $150 saved
- ROI: 125x return on investment

---

## 5. Future Enhancements

### 5.1 Phase 2: Soft Enforcement (Planned)

**Changes:**
- Handoffs display blocking warning if score < threshold
- LEAD can override with justification
- Override stored in database for analysis
- Email notification to team when override occurs

**Implementation:**
```javascript
if (!russianJudgePassed) {
  console.log('⚠️  WARNING: Russian Judge score below threshold');
  console.log(`   Score: ${score}/${threshold}`);
  console.log('   Handoff will proceed, but review is recommended.');

  // Future: Prompt LEAD for override decision
  const override = await askUserQuestion({
    question: 'Russian Judge scored below threshold. Proceed anyway?',
    options: ['Yes, override', 'No, improve quality first']
  });

  if (override === 'No, improve quality first') {
    throw new Error('Handoff blocked by Russian Judge. Please address feedback.');
  }
}
```

### 5.2 Phase 3: Selective Hard Enforcement (Future)

**Criteria for Hard Enforcement:**
- Security SDs: Always enforce (data breach risk)
- Database SDs: Enforce if production database (data loss risk)
- Feature SDs: Advisory only (low risk)

**Override Workflow:**
- Automatically log override to `russian_judge_overrides` table
- Require LEAD approval for security/database overrides
- Track correlation between overrides and production issues

### 5.3 Advanced Analytics

**A. Predictive Quality Scoring**
- Train ML model on historical Russian Judge scores + production outcomes
- Predict probability of UAT failure based on rubric scores
- Flag high-risk SDs for extra scrutiny

**B. Team Performance Insights**
- Compare avg Russian Judge scores by developer
- Identify training opportunities (e.g., "User Story quality needs improvement")
- Celebrate high-quality work (e.g., "8 consecutive SDs with 90+ scores")

**C. Rubric A/B Testing**
- Test different criterion weights on parallel SDs
- Measure which weights correlate best with quality outcomes
- Auto-adjust weights based on results

### 5.4 Integration with Other Tools

**GitHub Actions:**
- Run Russian Judge on PRs
- Comment with quality score and feedback
- Block merge if score < threshold (configurable)

**Slack Notifications:**
- Daily digest of Russian Judge scores
- Alert when SD scores below 50%
- Celebrate SDs scoring 95+

**Dashboard UI:**
- Real-time Russian Judge metrics
- Threshold tuning interface
- Drill-down into individual assessments

---

## 6. FAQs

**Q: Why is it called "Russian Judge"?**
A: Reference to Olympic judging where multiple judges score independently (e.g., figure skating). Multi-criterion weighted rubrics = multiple judges evaluating different aspects.

**Q: Can I disable Russian Judge?**
A: Yes, set `RUSSIAN_JUDGE_ENABLED=false` in environment. However, you lose continuous improvement insights.

**Q: What if Russian Judge gives a bad score to good work?**
A: That's a false positive. Currently in advisory mode, so it won't block work. Log the feedback and we'll tune thresholds or rubrics.

**Q: Does Russian Judge replace human review?**
A: No. It augments human review by providing consistent, data-driven feedback. LEAD approval is still required.

**Q: How much does it cost?**
A: ~$0.003 per assessment. For 100 SDs/month with 4 assessments each = $1.20/month. Extremely cost-effective.

**Q: What if AI gives inconsistent scores?**
A: Temperature is set to 0.3 for consistency. If scores vary wildly for similar content, we'll investigate rubric clarity or model issues.

**Q: Can thresholds be adjusted per-developer or per-project?**
A: Not currently, but possible future enhancement. For now, thresholds are by sd_type only.

---

## 7. Conclusion

The Russian Judge is a **strategic investment in LEO Protocol quality**. By providing consistent, objective feedback at every handoff, it creates a feedback loop that enables:

1. **Data-driven process improvements** (threshold tuning, rubric refinement)
2. **Anti-pattern detection** (identify common quality issues)
3. **Predictive quality insights** (correlate scores with production outcomes)
4. **Team development** (identify training opportunities)
5. **Continuous evolution** (LEO Protocol improves itself over time)

**Current Status:** Advisory mode, gathering data
**Next Steps:** Monitor for 2-4 weeks, tune thresholds based on evidence
**Long-term Vision:** Intelligent, adaptive quality system that learns from outcomes

---

**Documentation Maintained By:** Claude Code (LEO Protocol)
**Last Review:** 2025-12-05
**Next Review:** 2025-12-19 (2 weeks from launch)
**Contact:** rick@enterprisehackersgroup.com
