---
description: Trigger comprehensive LEO sub-agent analysis for any task
argument-hint: [describe your task or issue]
---

# 🤖 LEO Sub-Agent Analysis

Analyze the following request and identify ALL relevant sub-agents that should be activated:

**Request:** $ARGUMENTS

## Available Sub-Agents

Evaluate each sub-agent and provide confidence scores (0-100%):

### Core Sub-Agents:
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