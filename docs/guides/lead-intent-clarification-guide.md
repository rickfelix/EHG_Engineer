# LEAD Agent Intent Clarification Guide

## Overview

This guide provides practical examples of how LEAD agents should use the intent clarification features when evaluating Strategic Directives (SDs) with borderline over-engineering scores.

## Core Principle: Adjacent Truths

**Adjacent truths** are the underlying intentions that may not be clearly expressed in the original directive wording. The LEAD agent should look beyond literal interpretation to understand what the submitter truly meant.

### Key Recognition Patterns

- **Poor wording ≠ poor intent**: Technical jargon may obscure a simple need
- **Implicit strategic value**: Benefits assumed rather than stated
- **Hidden simplicity**: Complex descriptions of simple solutions
- **Assumed context**: Business value taken for granted

## Evaluation Thresholds

| Score Range | Evaluation Approach |
|-------------|-------------------|
| **≤15/30** | Over-engineered - Requires clarification before rejection |
| **16-18/30** | **Clarification Zone** - Generate questions & rephrasing suggestions |
| **19-20/30** | Conditional approval with warnings |
| **21+/30** | Approve with standard review |

## Scenario Examples

### Scenario 1: Technical Jargon Hiding Simple Intent

#### Original Submission
```
Title: "Implement comprehensive state management architecture with Redux Toolkit"
Description: "Refactor the application to use Redux Toolkit with normalized state,
immutability helpers, and thunk middleware for all async operations."
```

#### Initial Auto-Scoring
- **Complexity**: 2/5 (high complexity, unclear value)
- **Strategic Alignment**: 2/5 (no clear business alignment)
- **ROI Projection**: 2/5 (low expected return)
- **Total Score**: 16/30 → **CLARIFICATION ZONE**

#### LEAD Clarification Response

**Adjacent Truth Identified**:
"This might be trying to solve state synchronization issues with a complex solution when a simpler approach exists."

**Clarifying Questions Generated**:
1. "What specific problems are you experiencing with the current state management?"
   - **Purpose**: Understand the real pain point
   - **Adjacent Truth**: User frustration may be fixable without full refactor

2. "Have you considered using React's built-in Context API for your use case?"
   - **Purpose**: Validate if complexity is necessary
   - **Adjacent Truth**: Simpler solutions might suffice

**Rephrasing Suggestions**:
```
SIMPLIFY:
Original: "Implement comprehensive state management architecture"
Rephrased: "Fix state synchronization issues in checkout flow"
Rationale: Simpler wording may better reflect the core need

VALUE_FOCUS:
Original: "Refactor application to use Redux Toolkit"
Rephrased: "Reduce bugs caused by inconsistent state updates"
Rationale: Emphasizes user/business benefit
```

**LEAD Action**: Present clarifications to human for decision

---

### Scenario 2: Implicit Strategic Value

#### Original Submission
```
Title: "Add export to Excel button"
Description: "Put an Excel export button on the reports page"
```

#### Initial Auto-Scoring
- **Complexity**: 4/5 (simple implementation)
- **Strategic Alignment**: 2/5 (no strategic context mentioned)
- **ROI Projection**: 3/5 (unclear business value)
- **Total Score**: 17/30 → **CLARIFICATION ZONE**

#### LEAD Clarification Response

**Adjacent Truth Identified**:
"This simple feature likely supports critical business workflows that are assumed but not stated."

**Clarifying Questions Generated**:
1. "How often do users currently request report data in Excel format?"
   - **Purpose**: Quantify demand
   - **Adjacent Truth**: High-frequency pain point not documented

2. "What manual workarounds are users currently doing to get data into Excel?"
   - **Purpose**: Identify efficiency gains
   - **Adjacent Truth**: Significant time savings not captured

**Rephrasing Suggestions**:
```
STRATEGIC_FRAME:
Original: "Add export to Excel button"
Rephrased: "To improve customer experience, enable one-click Excel export from reports"
Rationale: Adding strategic context reveals alignment with CX goals

VALUE_FOCUS:
Original: "Put an Excel export button on the reports page"
Rephrased: "Enable users to analyze report data in Excel without manual copying"
Rationale: Emphasizes workflow efficiency benefit
```

**Revised Score After Clarification**:
- **Strategic Alignment**: 4/5 (clear CX improvement)
- **ROI Projection**: 4/5 (eliminates manual work)
- **Total Score**: 23/30 → **APPROVED**

---

### Scenario 3: Complex Description, Simple Solution

#### Original Submission
```
Title: "Optimize API response payload transformation pipeline"
Description: "Implement data transformation layer with memoization,
lazy evaluation, and streaming parsers to reduce memory footprint
during JSON deserialization of API responses."
```

#### Initial Auto-Scoring
- **Complexity**: 1/5 (extremely complex for unclear value)
- **Resource Intensity**: 2/5 (high effort described)
- **Strategic Alignment**: 2/5 (no business context)
- **Total Score**: 14/30 → **OVER-ENGINEERED** but within clarification range

#### LEAD Clarification Response

**Adjacent Truth Identified**:
"This sounds like a performance problem expressed in overly technical terms. The real issue might be simple."

**Clarifying Questions Generated**:
1. "Can you describe the user-visible symptom this solves in simpler terms?"
   - **Purpose**: Get to the actual problem
   - **Adjacent Truth**: Users experiencing slow load times

2. "What is the current response time and what is your target?"
   - **Purpose**: Quantify the need
   - **Adjacent Truth**: May not need complex solution for modest improvement

**Rephrasing Suggestions**:
```
SIMPLIFY:
Original: "Optimize API response payload transformation pipeline"
Rephrased: "Speed up API response loading"
Rationale: Removes technical jargon to reveal core intent

VALUE_FOCUS:
Original: "Reduce memory footprint during JSON deserialization"
Rephrased: "Make dashboard load faster for users"
Rationale: Focuses on user benefit, not technical details
```

**Human Review Recommendation**:
```
LEAD presents to human:
"This directive scores 14/30 (over-engineered), but may contain valid
performance concerns. Recommend:

1. Clarify actual performance targets
2. Consider simpler solutions first (caching, pagination)
3. If confirmed critical, reframe as: 'Improve dashboard load time
   from 5s to <1s for better user experience'
```

---

### Scenario 4: Missing Business Context

#### Original Submission
```
Title: "Update button colors"
Description: "Change the primary button color from blue to green"
```

#### Initial Auto-Scoring
- **Complexity**: 5/5 (trivial implementation)
- **Strategic Alignment**: 1/5 (no strategic rationale)
- **ROI Projection**: 2/5 (unclear benefit)
- **Total Score**: 16/30 → **CLARIFICATION ZONE**

#### LEAD Clarification Response

**Adjacent Truth Identified**:
"Design changes usually have business drivers not captured here - brand refresh, accessibility, A/B test results, etc."

**Clarifying Questions Generated**:
1. "What drove this color change decision? (brand guidelines, accessibility, user feedback, etc.)"
   - **Purpose**: Uncover business rationale
   - **Adjacent Truth**: May be part of larger initiative

2. "Are there accessibility or brand compliance requirements we should document?"
   - **Purpose**: Identify compliance drivers
   - **Adjacent Truth**: Regulatory or brand requirements not stated

**Rephrasing Suggestions**:
```
STRATEGIC_FRAME:
Original: "Update button colors"
Rephrased: "To meet WCAG 2.1 accessibility standards, update button colors
for better contrast"
Rationale: Reveals compliance requirement that justifies change

VALUE_FOCUS:
Original: "Change primary button color from blue to green"
Rephrased: "Improve call-to-action visibility based on Q4 A/B test results"
Rationale: Shows data-driven business decision
```

---

## Best Practices for LEAD Agents

### 1. Always Ask "Why?" First
Before rejecting a borderline directive, ask:
- What problem is this really solving?
- What would happen if we don't do this?
- Who requested this and what's their underlying need?

### 2. Look for Patterns
Common patterns indicating adjacent truths:
- **Over-specification**: Detailed technical solution → Simple user need
- **Under-specification**: Brief request → Assumed critical context
- **Jargon-heavy**: Technical terms → Non-technical business driver
- **Feature-focused**: "Add X" → "Solve Y problem for users"

### 3. Use the Rubric Tools
When score is 15-18/30, the rubric automatically provides:
```javascript
{
  needsClarification: true,
  clarificationReason: "...",
  clarifyingQuestions: [...],
  rephrasesSuggestions: [...]
}
```

### 4. Present Options to Human
Structure clarification requests as:
```
Score: X/30 (Clarification Zone)

OBSERVED: [What was written]
POSSIBLE INTENT: [Adjacent truth hypothesis]

QUESTIONS TO CLARIFY:
1. [Question with purpose]
2. [Question with purpose]

SUGGESTED REPHRASING:
- Option A: [Strategic framing]
- Option B: [Value-focused framing]
- Option C: [Simplified wording]

RECOMMENDATION: [Approve with changes / Request clarification / Defer]
```

### 5. Document the Clarification
Store in database:
```javascript
{
  original_sd_id: "SD-2025-XXX",
  clarification_attempt: {
    original_score: 16,
    clarification_questions: [...],
    rephrase_suggestions: [...],
    human_decision: "approved_with_rephrasing",
    final_score: 22,
    lesson_learned: "Always check for implicit compliance requirements"
  }
}
```

## Anti-Patterns to Avoid

### ❌ DON'T: Reject Based on Wording Alone
```
Bad: "This SD uses too much jargon, rejecting for over-engineering"
Good: "Let me clarify what this is really trying to accomplish..."
```

### ❌ DON'T: Assume Intent Without Asking
```
Bad: "This is probably trying to do X, so I'll change it to..."
Good: "This might be trying to do X. Let me ask: [clarifying question]"
```

### ❌ DON'T: Over-Clarify Simple Cases
```
Bad: Score of 24/30 → "Let me ask 10 clarifying questions"
Good: Score of 24/30 → "This looks good, proceeding to approval"
```

### ❌ DON'T: Skip Human Review in Clarification Zone
```
Bad: "Score of 17/30, I'll just approve it with my rephrasing"
Good: "Score of 17/30, presenting clarifications to human for decision"
```

## Metrics & Success Criteria

Track clarification effectiveness:

### Success Metrics
- **Clarification Success Rate**: % of 15-18 scored SDs that get approved after clarification
- **Time to Resolution**: Average time from clarification to decision
- **Human Agreement**: % of LEAD clarifications that humans agree with
- **Pattern Recognition**: Recurring themes in adjacent truths discovered

### Target Outcomes
- Reduce false rejections of valid directives by 60%
- Increase SD quality scores by surfacing true intent
- Build pattern library of common miswordings
- Improve submission guidance based on clarification insights

## Integration with Existing Workflow

### Pre-Clarification (Current State)
```
Submit SD → Auto-score → If ≤15: REJECT → Manual appeal
```

### Post-Clarification (New State)
```
Submit SD → Auto-score → If 15-18: CLARIFY → Present options → Human decides
                       → If <15: Suggest major revision or reject
```

### Database Schema
Store clarifications for learning:
```sql
CREATE TABLE sd_clarifications (
  id UUID PRIMARY KEY,
  sd_id UUID REFERENCES strategic_directives_v2(id),
  original_score INTEGER,
  clarification_questions JSONB,
  rephrase_suggestions JSONB,
  human_decision TEXT,
  final_score INTEGER,
  created_at TIMESTAMP
);
```

---

## Quick Reference Card

### When to Trigger Clarification
- ✅ Score 15-18/30
- ✅ High complexity score (≤3) with unclear strategic alignment
- ✅ Implicit assumptions detected
- ✅ Technical jargon obscuring intent

### How to Clarify
1. Identify adjacent truth (what they really mean)
2. Generate 2-3 targeted questions
3. Suggest 2-3 rephrasing options
4. Present to human with recommendation

### Decision Matrix
| Score | Clarify? | Action |
|-------|----------|--------|
| <15 | Optional | Recommend major revision |
| 15-18 | **Required** | Present clarifications to human |
| 19-20 | Optional | Conditional approval with notes |
| 21+ | No | Standard approval process |

---

*This guide should be used by all LEAD agents when evaluating Strategic Directives. The goal is to reduce false rejections while maintaining quality standards through better understanding of true intent.*
