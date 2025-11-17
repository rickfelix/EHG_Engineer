---
description: Trigger comprehensive LEO sub-agent analysis for any task
argument-hint: [describe your task or issue]
---

# 🤖 LEO Sub-Agent Analysis

**Request:** $ARGUMENTS

## Step 1: Quick-Fix Detection

**FIRST**, determine if this is a simple UAT bug/polish that qualifies for QUICKFIX sub-agent:

**Quick-Fix Indicators (≥3 = use QUICKFIX):**
- [ ] Found during UAT or manual testing
- [ ] Estimated ≤50 LOC
- [ ] Type: bug, typo, polish, or minor UI issue
- [ ] No database schema changes
- [ ] No authentication/security changes
- [ ] Single file/component affected
- [ ] Existing tests cover the change

**If ≥3 indicators match:**
1. **MANDATORY:** Read Quick-Fix Protocol Documentation first
   ```
   Read file: docs/quick-fix-protocol.md
   ```
2. Confirm understanding of:
   - "Quick" = SCOPE, not QUALITY (same rigor as Strategic Directives)
   - Compliance rubric mandatory (100-point scale)
   - Tests must actually run (cannot assume)
   - PR always required (no direct merge)
   - User approval needed for commit/push
3. Recommend QUICKFIX sub-agent (skip full analysis)

**If <3 indicators match:** Proceed with full sub-agent analysis below

---

## Step 2: Full Sub-Agent Analysis

If QUICKFIX not recommended, analyze the following request and identify ALL relevant sub-agents:

## Available Sub-Agents

Evaluate each sub-agent and provide confidence scores (0-100%):

### Core Sub-Agents:
- **QUICKFIX** - Lightweight UAT bug fixes (≤50 LOC), auto-escalates if complex ("LEO Lite" orchestrator)
- **SECURITY** - Authentication, authorization, encryption, vulnerabilities, OWASP
- **PERFORMANCE** - Optimization, speed, caching, load times, scalability
- **DESIGN** - UI/UX, CSS, styling, themes, dark mode, responsive design
- **TESTING** - Unit tests, integration tests, e2e, coverage, QA
- **DATABASE** - Schema, queries, migrations, optimization, indexes
- **API** - REST, GraphQL, endpoints, integration, webhooks
- **DEBUG** - Error analysis, troubleshooting, state issues, logs
- **DOCUMENTATION** - Docs, README, guides, comments, API docs
- **COST** - Resource optimization, billing, efficiency
- **DEPENDENCY** - Package management, updates, vulnerabilities

## Analysis Requirements:

1. **Sub-Agent Selection**: Select ALL sub-agents with >50% confidence
2. **Confidence Scoring**: Rate each selected agent 0-100%
3. **Reasoning**: Explain WHY each agent is relevant
4. **Prioritization**: Order by relevance/urgency
5. **Specific Recommendations**: What each sub-agent should focus on
6. **Coordination Strategy**: How agents should work together

## Output Format:

Provide structured analysis:

```
🎯 Selected Sub-Agents:
• [AGENT_NAME] (XX%) - Brief reason
• [AGENT_NAME] (XX%) - Brief reason

📋 Detailed Analysis:
[AGENT_NAME]:
- Focus areas: ...
- Specific checks: ...
- Key considerations: ...

🔄 Coordination Strategy:
- First: [AGENT] should...
- Then: [AGENT] should...
- Finally: [AGENT] should...
```

## Context Awareness:

Consider the project context:
- Current repository: EHG_Engineer
- Technology stack: Node.js, React, Tailwind CSS, WebSocket
- LEO Protocol version: v4.1.2
- Dashboard on localhost:3000