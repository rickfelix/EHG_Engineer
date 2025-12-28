# Triangulation Prompt: Runtime Audit Retrospective Process Improvement

## Context

We have a "Triangulated Runtime Audit Protocol" for manually testing applications with AI assistance. The audit uses 3 AI models (Claude Code, OpenAI ChatGPT, Google Antigravity) for diagnosis and remediation planning.

**Problem Identified**: The runtime audit protocol has NO retrospective phase. Lessons learned from the audit process itself are not systematically captured.

---

## Current State

### Runtime Audit Protocol (6 Phases)

```
Phase 1: SETUP
  - Start app, define context anchor
  - Claude enters "testing guide mode"

Phase 2: MANUAL TESTING
  - Claude guides user through routes
  - Issues logged with ID, route, severity
  - User reports what they see

Phase 3: ROOT CAUSE DIAGNOSIS (Triangulation)
  - Claude creates diagnostic prompt
  - Same prompt sent to ChatGPT and Antigravity
  - Each model investigates independently
  - Findings compared for consensus

Phase 4: REMEDIATION PLANNING (Triangulation)
  - Root causes sent to all 3 models
  - Each proposes fixes independently
  - Best approach triangulated

Phase 5: SD CREATION
  - Strategic Directives created from findings
  - Orchestrator/child pattern used

Phase 6: EXECUTION
  - Child SDs executed
  - Regression testing
  - Mark complete

[NO RETROSPECTIVE PHASE - THE GAP]
```

### Existing RETRO Sub-Agent Capabilities

We have a sophisticated retrospective sub-agent (`lib/sub-agents/retro.js`) designed for SD completion:

**Features**:
1. **SD Metadata Gathering** - Collects SD context, PRD, handoffs
2. **Sub-Agent Results Analysis** - Reviews what other sub-agents found
3. **Quality Scoring** - 0-100 score based on completeness, specificity, actionability, measurability
4. **Pattern Learning** - Extracts patterns to `issue_patterns` table for future prevention
5. **SMART Action Items** - Owner, deadline, success criteria for each action
6. **Protocol Improvements** - Suggests improvements to LEO Protocol itself
7. **Semantic Deduplication** - Prevents duplicate lessons
8. **SD-Type-Specific Learnings** - Tailors retrospective to SD category

**Current Trigger**: RETRO runs at SD completion (EXEC-TO-PLAN handoff), NOT during runtime audits.

---

## The Gap

### What's Missing

1. **No Phase 7: AUDIT RETROSPECTIVE** - The audit ends without capturing meta-lessons about the audit process itself

2. **Sub-Agent Voices Not Captured** - When sub-agents (DATABASE, SECURITY, TESTING, etc.) run during remediation, their insights aren't fed into the retrospective

3. **Triangulation Insights Lost** - The consensus/divergence patterns from 3-model triangulation aren't systematically captured for future audits

4. **User Verbatim Not Preserved** - The Chairman's original observations (like "first principles rethink") get summarized away before retrospective generation

5. **Cross-Audit Pattern Detection** - No mechanism to detect patterns across multiple runtime audits

---

## Proposed Improvement: Phase 7 - Audit Retrospective

### Conceptual Design

```
Phase 7: AUDIT RETROSPECTIVE

  A. Gather All Inputs
     - User's original verbatim observations
     - Issue log (all NAV-xx items with disposition)
     - Triangulation synthesis grid
     - SD creation results
     - Sub-agent execution results (if any ran during remediation)

  B. Capture Multi-Voice Insights
     - Claude Code observations
     - ChatGPT observations
     - Antigravity observations
     - Sub-agent findings (DATABASE, SECURITY, TESTING, etc.)
     - Chairman's strategic observations

  C. Generate Audit Retrospective
     - What worked well in this audit?
     - What needs improvement in the audit process?
     - Triangulation effectiveness (consensus rate)
     - Coverage analysis (% of app tested)
     - Issue categorization insights

  D. Pattern Extraction
     - Recurring issue types across audits
     - Common root causes
     - Effective remediation patterns

  E. Protocol Improvements
     - Runtime audit protocol improvements
     - Triangulation methodology improvements
     - Issue capture improvements
```

---

## Your Task

Please provide an **independent analysis** of how to improve the runtime audit retrospective process. I want your unique perspective on:

### Questions to Answer

1. **Retrospective Timing**: Should the retrospective happen:
   - Immediately after SD creation (before execution)?
   - After SDs are executed?
   - Both (initial + follow-up)?

2. **Multi-Voice Capture**: How should we systematically capture insights from:
   - The 3 triangulation partners (Claude, ChatGPT, Antigravity)?
   - Sub-agents that run during remediation?
   - The Chairman's strategic observations?

3. **Verbatim Preservation**: How do we prevent the user's original language from being summarized away? Specific mechanisms?

4. **Cross-Audit Learning**: How should we detect patterns across multiple runtime audits?
   - Database schema for audit-level patterns?
   - Aggregation queries?
   - Trend analysis?

5. **Sub-Agent Contribution Format**: If sub-agents contribute to the retrospective, what format should their contributions take?
   - Structured JSON?
   - Free-form observations?
   - Scored recommendations?

6. **Retrospective Quality**: What quality criteria should runtime audit retrospectives meet?
   - Minimum number of lessons?
   - Coverage requirements?
   - Specificity thresholds?

7. **Integration with Existing RETRO**: Should we:
   - Extend the existing RETRO sub-agent?
   - Create a new AUDIT-RETRO sub-agent?
   - Create a wrapper that invokes RETRO with audit-specific context?

8. **Triangulation of the Retrospective Itself**: Should we triangulate the retrospective generation (have all 3 models contribute to the retrospective)?

---

## Constraints

- The retrospective must be stored in the database (not markdown files)
- Verbatim Chairman text must be preserved somewhere
- Sub-agent contributions should be structured for queryability
- Cross-audit pattern detection should be possible via SQL queries
- The process should not add more than 15-20 minutes to a runtime audit

---

## Existing Database Tables (Reference)

```sql
-- Retrospectives table (for SD retrospectives)
retrospectives (
  id, sd_id, target_application, title, retro_type, status,
  learning_category, key_learnings[], what_went_well[],
  what_needs_improvement[], action_items[], improvement_areas[],
  quality_score, protocol_improvements[], affected_components[],
  tags[], auto_generated, created_at
)

-- Issue patterns (for cross-SD learning)
issue_patterns (
  pattern_id, category, issue_summary, occurrence_count,
  severity, proven_solutions[], prevention_checklist[],
  status, trend
)

-- Chairman feedback (verbatim capture)
chairman_feedback (
  id, target_id, target_type, transcript_text,
  chairman_edited, for_lead, for_plan, for_exec, for_eva,
  sentiment, action_required, processing_status
)
```

---

## Output Format

Please structure your response as:

1. **Executive Summary** (2-3 sentences)
2. **Proposed Architecture** (how should this work?)
3. **Sub-Agent Contribution Model** (how do sub-agents feed into the retrospective?)
4. **Database Schema Additions** (new tables or columns needed)
5. **Process Flow** (step-by-step)
6. **Quality Criteria** (what makes a good audit retrospective?)
7. **Risk Assessment** (what could go wrong?)
8. **Recommendations** (prioritized list)

---

*This is a triangulation request. Please provide your independent analysis - I'm collecting perspectives from multiple AI models to synthesize the best approach.*
