---
description: Multi-model deep research using AI providers for exploration and analysis
---

# /research - Deep Research Command

**Command:** /research <question> [--context <context>]

## Overview

`/research` performs API-only deep research by querying multiple AI providers (Anthropic, OpenAI, Google) in parallel and synthesizing their responses into a structured report. This is one of three verification lenses in the LEO ecosystem:

- **Ground-Truth Triangulation** (`/triangulation-protocol`): Codebase-aware, semi-manual. Answers "Is it real?"
- **Multi-Model Debate** (automated via `/learn`): API-only, evaluates proposals. Answers "Should we do it?"
- **Deep Research** (`/research`): API-only, explores approaches. Answers "What's the best way?"

## When to Use

Use `/research` when you need to:
- Explore different approaches to a technical problem
- Compare frameworks, libraries, or architectural patterns
- Get diverse AI perspectives on best practices
- Investigate options before committing to an approach
- Answer "what are the best ways to..." questions

## Instructions

### Step 1: Parse the Research Question

Extract the question from `$ARGUMENTS`. If no arguments provided, use AskUserQuestion to get the research topic.

### Step 2: Run the Research Engine

```javascript
import { runResearch } from '../../lib/research/research-engine.js';

const result = await runResearch({
  question: "$ARGUMENTS",
  context: additionalContext || undefined
});
```

### Step 3: Present Results

Format the synthesis report for the user:

```
════════════════════════════════════════════════════════════
  /research - Deep Research Report
════════════════════════════════════════════════════════════

  Question: <the research question>
  Providers: <N> responded, <M> failed
  Confidence: <score>
  Consensus: <strong|moderate|weak>

┌─────────────────────────────────────────────────────────┐
│  EXECUTIVE TAKEAWAYS                                     │
└─────────────────────────────────────────────────────────┘
  1. <takeaway 1>
  2. <takeaway 2>

┌─────────────────────────────────────────────────────────┐
│  OPTIONS                                                 │
└─────────────────────────────────────────────────────────┘
  Option A: <name>
    Pros: <pros>
    Cons: <cons>

  Option B: <name>
    ...

┌─────────────────────────────────────────────────────────┐
│  TRADEOFFS & RISKS                                       │
└─────────────────────────────────────────────────────────┘
  Tradeoffs: <list>
  Risks: <list>

┌─────────────────────────────────────────────────────────┐
│  RECOMMENDED PATH                                        │
└─────────────────────────────────────────────────────────┘
  <recommended path>

════════════════════════════════════════════════════════════
```

### Step 4: Offer Next Steps

After presenting results, use AskUserQuestion:

```javascript
{
  "questions": [{
    "question": "How would you like to proceed with this research?",
    "header": "Next Step",
    "multiSelect": false,
    "options": [
      {"label": "Create SD", "description": "Turn this into a strategic directive for implementation"},
      {"label": "Debate it", "description": "Run multi-model debate to evaluate the recommended approach"},
      {"label": "Refine question", "description": "Ask a follow-up research question"},
      {"label": "Done", "description": "Research complete, no further action needed"}
    ]
  }]
}
```

## Context

**Engine Location**: `lib/research/research-engine.js`
**Provider Adapters**: `lib/sub-agents/vetting/provider-adapters.js`

The research engine uses `getAllAdapters()` to get Anthropic, OpenAI, and Google providers. Each provider runs in parallel with the same research prompt. Results are synthesized into a unified report with deduplication and consensus detection.

## Related Commands

- `/triangulation-protocol` - Codebase-aware verification (requires code access)
- `/learn` - Captures patterns and triggers multi-model debate for proposals
- `/leo assist` - Autonomous inbox processing (auto-routes to appropriate verification lens)
