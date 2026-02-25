# /brainstorm - EHG-Aware Strategic Brainstorming

Universal thinking tool with domain-specific question banks, multi-venture awareness, and self-improving retrospective. Produces a document in `brainstorm/`.

**Arguments**: `$ARGUMENTS`

---

## Step 1: Parse Arguments

Parse `$ARGUMENTS` for:
- **Topic**: Everything that isn't a flag (e.g., "AI-powered customer support chatbot")
- **`--structured`**: If present, use Structured Mode (full Phase 0 rigor). Otherwise, use Conversational Mode (default).
- **`--no-team`**: If present, skip multi-perspective team analysis. Default: team analysis is ON.
- **`--domain <domain>`**: One of `venture`, `protocol`, `integration`, `architecture`. If not provided, auto-detect or ask.
- **`--stage <stage>`**: Phase within the selected domain (see Step 3). If not provided, ask the user.

If no topic is provided, ask the user: "What would you like to brainstorm?"

---

## Step 2: Domain Selection

If `--domain` was not provided, attempt **auto-detection** from topic keywords:

| Keywords in Topic | Auto-Detected Domain |
|-------------------|---------------------|
| venture, product, market, customer, user, startup, app, SaaS, pricing, revenue | `venture` |
| protocol, handoff, gate, workflow, LEO, SD, process, compliance, phase | `protocol` |
| integration, pipeline, sync, API, webhook, import, export, Todoist, YouTube | `integration` |
| architecture, database, schema, performance, tradeoff, migration, refactor, pattern | `architecture` |

**If auto-detected** with high confidence (2+ keyword matches): Use detected domain, inform user:
```
Domain auto-detected: [Domain] (based on topic keywords)
```

**If ambiguous or no match**, ask using AskUserQuestion:

```
question: "What domain does this brainstorm fall into?"
header: "Domain"
options:
  - label: "Venture"
    description: "Product/market idea, new feature, business hypothesis"
  - label: "Protocol"
    description: "LEO workflow improvement, process change, compliance"
  - label: "Integration"
    description: "External service pipeline, data sync, API connection"
  - label: "Architecture"
    description: "Technical decision, schema design, infrastructure tradeoff"
```

---

## Step 3: Determine Phase

Each domain has its own phase progression. If `--stage` was not provided, ask using AskUserQuestion with domain-appropriate options:

### Venture Domain Phases
```
question: "What EHG lifecycle stage is this venture/idea in?"
header: "Stage"
options:
  - label: "Ideation"
    description: "Exploring the problem space, no committed solution yet"
  - label: "Validation"
    description: "Testing a specific hypothesis with minimal investment"
  - label: "MVP"
    description: "Building the minimum viable product for real users"
  - label: "Growth"
    description: "Scaling what works, improving retention and engagement"
```
(Scale available via "Other": optimizing efficiency, automation, enterprise readiness)

### Protocol Domain Phases
```
question: "What phase is this protocol improvement in?"
header: "Phase"
options:
  - label: "Discovery"
    description: "Identifying friction points, gathering evidence of the problem"
  - label: "Design"
    description: "Designing the solution, defining rules and behaviors"
  - label: "Implement"
    description: "Building and testing the improvement"
```

### Integration Domain Phases
```
question: "What phase is this integration work in?"
header: "Phase"
options:
  - label: "Intake"
    description: "Understanding the external system, mapping data sources"
  - label: "Process"
    description: "Defining transformation rules, handling edge cases"
  - label: "Output"
    description: "Delivering processed data, monitoring quality"
```

### Architecture Domain Phases
```
question: "What phase is this architecture decision in?"
header: "Phase"
options:
  - label: "Explore"
    description: "Researching options, gathering constraints and requirements"
  - label: "Decide"
    description: "Evaluating tradeoffs, making the decision"
  - label: "Execute"
    description: "Implementing the chosen approach, validating results"
```

---

## Step 4: Multi-Venture Awareness Check

Before starting questions, query the venture registry to enrich context:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('ventures').select('id, name, status').eq('status', 'active').then(({data}) => {
  console.log('VENTURES:', JSON.stringify(data));
});
"
```

Also check for related past brainstorms:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('brainstorm_sessions')
  .select('id, domain, topic, outcome_type, created_at')
  .order('created_at', { ascending: false })
  .limit(10)
  .then(({data}) => {
    if (data && data.length > 0) console.log('PAST_SESSIONS:', JSON.stringify(data));
    else console.log('PAST_SESSIONS: none');
  });
"
```

**If related past brainstorms found** (topic similarity), inform the user:
```
Related past brainstorm: "[topic]" ([date]) - Outcome: [outcome_type]
```

**Multi-venture mapping**: During the brainstorm, if the topic relates to specific ventures from the registry, note which ventures are affected. This is stored in the session record at the end.

---

## Step 4.5: Domain Knowledge Context Injection

If a venture was identified in Step 4 with an `industry` field, inject accumulated domain knowledge into the session context. This is **non-blocking** — if it fails or returns empty, proceed normally.

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const industry = process.argv[2] || '';
if (!industry) { console.log('DOMAIN_CONTEXT: none'); process.exit(0); }
import('../lib/domain-intelligence/domain-expert-integration.js').then(mod => {
  mod.buildDomainContext(supabase, industry).then(ctx => {
    if (ctx) console.log('DOMAIN_CONTEXT:', ctx);
    else console.log('DOMAIN_CONTEXT: none');
  }).catch(() => console.log('DOMAIN_CONTEXT: none'));
}).catch(() => console.log('DOMAIN_CONTEXT: none'));
" "<VENTURE_INDUSTRY>"
```

**If DOMAIN_CONTEXT is not "none"**: Include the returned context block in your session awareness. Use it to inform your questions and provide more relevant guidance. Store the context in session metadata for traceability.

**If DOMAIN_CONTEXT is "none"**: Proceed normally — this is the cold-start case where no prior domain knowledge has been accumulated yet.

---

## Step 5: Route to Mode

- If `--structured` flag is present → Go to **Structured Mode** (Step 6)
- Otherwise → Go to **Conversational Mode** (Step 7)

---

## Step 6: Structured Mode (`--structured`)

Full rigor: one-question-at-a-time, checkpoints, un-done proposals, crystallization scoring.

### 6A: Discovery Questions (One at a Time)

Ask questions ONE AT A TIME from the domain+phase-appropriate question bank (see Question Banks section below). Wait for the user's answer before asking the next question. Ask all required questions (minimum 3), then offer optional ones.

**Question ordering**: If effectiveness data exists for this domain, query it to prioritize higher-effectiveness questions:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('brainstorm_question_effectiveness')
  .select('question_id, effectiveness_score')
  .eq('domain', '<DOMAIN>')
  .order('effectiveness_score', { ascending: false })
  .then(({data}) => {
    if (data && data.length > 0) console.log('Q_ORDER:', JSON.stringify(data));
    else console.log('Q_ORDER: default');
  });
"
```

If effectiveness data exists, reorder optional questions so higher-effectiveness ones are asked first. Required questions are always asked regardless.

**After each answer**, briefly acknowledge the response before asking the next question.

### 6B: STAGED_CHECKPOINT - Intent Synthesis

After all required questions are answered, synthesize an intent summary:

```
**Intent Summary** (max 500 chars):
[Your synthesis of the brainstorm topic based on answers so far]

Does this capture the core intent? (yes / refine)
```

Use AskUserQuestion with options: "Yes, that captures it" and "Let me refine".

### 6C: UN_DONE_PROPOSAL - Out of Scope List

Generate a list of at least 3 things that are explicitly OUT OF SCOPE:

```
**Explicitly Out of Scope:**
1. [Thing that might seem related but isn't part of this]
2. [Adjacent feature/capability we're NOT building]
3. [Scale/complexity we're NOT targeting yet]
```

Ask user to confirm or adjust the out-of-scope list.

### 6D: Crystallization Score

Evaluate the crystallization of the idea on a 0.0-1.0 scale:

| Factor | Weight | Score |
|--------|--------|-------|
| Problem clarity | 25% | 0.0-1.0 |
| User/audience defined | 20% | 0.0-1.0 |
| Success criteria exist | 20% | 0.0-1.0 |
| Scope boundaries clear | 20% | 0.0-1.0 |
| Risk/unknowns identified | 15% | 0.0-1.0 |

**Threshold: 0.7** - Below this, note that more discovery is recommended.

Present the score breakdown to the user.

### 6D.1: Multi-Perspective Team Analysis (Default ON)

**Skip this step if `--no-team` flag is present.**

After discovery and crystallization, spawn a 3-agent team for multi-perspective analysis:

```
Use TeamCreate tool:
  team_name: "brainstorm-analysis"
  description: "Multi-perspective brainstorm analysis"
```

Then spawn 3 teammates using the Task tool with `team_name: "brainstorm-analysis"`:

**Challenger** (subagent_type: "general-purpose"):
```
You are the Challenger - a devil's advocate analyst. Your job is to find weaknesses, blind spots, and flawed assumptions.

Topic: [TOPIC]
Domain: [DOMAIN]
Discovery Summary: [KEY INSIGHTS FROM 6A]

Analyze this brainstorm from a [DOMAIN]-specific lens:
[See Role Prompts section below for domain-specific instructions]

Output format:
- BLIND SPOTS: 2-3 things the brainstorm is not considering
- ASSUMPTIONS AT RISK: 2-3 assumptions that could be wrong
- WORST CASE: What happens if this fails?
```

**Visionary** (subagent_type: "general-purpose"):
```
You are the Visionary - a strategic opportunities analyst. Your job is to find upside potential, synergies, and transformative possibilities.

Topic: [TOPIC]
Domain: [DOMAIN]
Discovery Summary: [KEY INSIGHTS FROM 6A]

Analyze this brainstorm from a [DOMAIN]-specific lens:
[See Role Prompts section below for domain-specific instructions]

Output format:
- OPPORTUNITIES: 2-3 strategic opportunities this enables
- SYNERGIES: How this connects to or amplifies other initiatives
- UPSIDE SCENARIO: What does outsized success look like?
```

**Pragmatist** (subagent_type: "general-purpose"):
```
You are the Pragmatist - a feasibility and constraints analyst. Your job is to assess what's realistic, what resources are needed, and what the practical path forward is.

Topic: [TOPIC]
Domain: [DOMAIN]
Discovery Summary: [KEY INSIGHTS FROM 6A]

Analyze this brainstorm from a [DOMAIN]-specific lens:
[See Role Prompts section below for domain-specific instructions]

Output format:
- FEASIBILITY: Realistic assessment of implementation difficulty (1-10)
- RESOURCE REQUIREMENTS: What's needed (time, people, tools, money)
- CONSTRAINTS: 2-3 practical constraints to plan around
- RECOMMENDED PATH: Suggested first step and timeline
```

**Timeout**: 60 seconds per agent. If an agent fails or times out, proceed with available perspectives (2/3 or 1/3).

**Synthesis**: After all agents respond, synthesize their outputs:
- **Consensus Points**: Where 2+ perspectives agree
- **Tension Points**: Where perspectives conflict (these are the most valuable insights)
- **Composite Risk**: Low/Medium/High based on Challenger concerns weighted against Pragmatist feasibility

Store the team perspectives for document generation (Step 9).

### 6E: Domain-Specific Evaluation

Based on domain, use the appropriate evaluation framework:

**Venture Domain** → Four-Plane Evaluation Matrix (Step 6F)
**Protocol Domain** → Friction/Value/Risk Analysis (Step 6G)
**Integration Domain** → Data Quality/Coverage/Edge Case Analysis (Step 6H)
**Architecture Domain** → Tradeoff Matrix (Step 6I)

### 6F: Four-Plane Evaluation Matrix (Venture Domain)

Walk through all four planes of the EHG Venture Evaluation Matrix:

**Plane 1: Capability Graph Impact** (Score 0-25)
For each dimension, assess and score:
- New Capability Node (0-5): Does this introduce a genuinely new capability?
- Capability Reuse Potential (0-5): Likely to be reused by 2+ other ventures?
- Graph Centrality Gain (0-5): Increases importance of existing core capabilities?
- Maturity Lift (0-5): Hardens reliability, speed, or quality of existing capability?
- Extraction Clarity (0-5): Can be abstracted cleanly (API, service, playbook)?

Hard Rule: If Plane 1 < 10, venture must justify itself as a time-boxed exception or be rejected.

**Plane 2: External Vector Alignment** (Score -10 to +25)
Assess each vector as Tailwind / Neutral / Headwind with strength 0-5:
- Market Demand Gradient
- Technology Cost Curve
- Regulatory Trajectory
- Competitive Density
- Timing Window (Now vs Later)

Declare: Primary tailwind, Primary headwind, Headwind mitigation strategy.

**Plane 3: Control & Constraint Exposure** (Pass / Block / Escalate)
Assess exposure level (Low/Medium/High) for:
- Spend Risk
- Legal / Regulatory Risk
- Brand Risk
- Security / Data Risk
- Autonomy Risk (agent misfire)

Hard Rules: Any High exposure = escalation required. Missing kill-switch = automatic block.

**Plane 4: Exploration vs Exploitation Position**
Select dial position: Pure Exploration | Skewed Exploration | Balanced | Skewed Exploitation | Pure Exploitation

Declare review interval and auto-expiry date (if exploratory).

### 6G: Friction/Value/Risk Analysis (Protocol Domain)

Evaluate the protocol improvement across three dimensions:

**Friction Reduction** (Score 0-10)
- Current friction level (how painful is the status quo?) 0-5
- Friction breadth (how many workflows affected?) 0-5

**Value Addition** (Score 0-10)
- Direct value (time saved, errors prevented) 0-5
- Compound value (enables future improvements) 0-5

**Risk Profile** (Score 0-10, lower is better)
- Breaking change risk 0-5
- Regression risk (existing workflows) 0-5

**Decision Rule**: Implement if (Friction + Value) > Risk * 2

### 6H: Data Quality/Coverage/Edge Case Analysis (Integration Domain)

Evaluate the integration across three dimensions:

**Data Quality** (Score 0-10)
- Source reliability (uptime, consistency) 0-5
- Schema stability (how often does the external API change?) 0-5

**Coverage** (Score 0-10)
- Data completeness (what % of needed data is available?) 0-5
- Error handling (graceful degradation when data missing) 0-5

**Edge Cases** (List)
- Identify at least 3 edge cases the integration must handle
- Rate each: Common / Rare / Theoretical
- Specify handling strategy for each

### 6I: Tradeoff Matrix (Architecture Domain)

Evaluate architecture options across weighted dimensions:

| Dimension | Weight | Option A | Option B | Option C |
|-----------|--------|----------|----------|----------|
| Complexity | 20% | 0-10 | 0-10 | 0-10 |
| Maintainability | 25% | 0-10 | 0-10 | 0-10 |
| Performance | 20% | 0-10 | 0-10 | 0-10 |
| Migration effort | 15% | 0-10 | 0-10 | 0-10 |
| Future flexibility | 20% | 0-10 | 0-10 | 0-10 |

Present weighted scores and recommendation. Flag any option where a single dimension scores < 3 (critical weakness).

Then proceed to Edge-Case Bucketing (Step 8).

---

## Step 7: Conversational Mode (Default)

Lighter brainstorming flow with 2-3 questions at a time.

### 7A: Initial Questions

Ask 2-3 phase-appropriate questions from the domain's question bank (pick the required ones). Present them together in a single message.

### 7B: Follow-Up Questions

Based on the answers, ask 1-2 follow-up questions to deepen understanding. These can be from optional questions in the bank or generated based on the conversation.

### 7B.1: Multi-Perspective Team Analysis (Default ON)

**Skip this step if `--no-team` flag is present.**

Same team analysis as Step 6D.1 — spawn Challenger, Visionary, and Pragmatist agents with the discovery insights from Step 7A/7B. Use TeamCreate and Task tools identically to 6D.1.

Present synthesized team perspectives (consensus/tension/risk) to the user before proceeding to arguments.

### 7C: Arguments For and Against

Based on answers so far, present:

**Arguments For:**
- [3-4 compelling reasons to pursue this]

**Arguments Against:**
- [2-3 honest risks, challenges, or reasons to pause]

### 7D: Optional Domain-Specific Evaluation

Ask the user using AskUserQuestion:

**For Venture domain:**
```
question: "Would you like a Four-Plane Evaluation Matrix analysis?"
header: "Evaluation"
options:
  - label: "Yes, full evaluation"
    description: "Walk through all 4 planes: Capability Impact, Vector Alignment, Constraints, Explore/Exploit"
  - label: "Skip for now"
    description: "Save evaluation for later, proceed to document"
```

**For Protocol domain:**
```
question: "Would you like a Friction/Value/Risk analysis?"
header: "Evaluation"
options:
  - label: "Yes, analyze"
    description: "Evaluate friction reduction, value addition, and risk profile"
  - label: "Skip for now"
    description: "Proceed to document"
```

**For Integration domain:**
```
question: "Would you like a Data Quality/Coverage analysis?"
header: "Evaluation"
options:
  - label: "Yes, analyze"
    description: "Evaluate data quality, coverage, and edge cases"
  - label: "Skip for now"
    description: "Proceed to document"
```

**For Architecture domain:**
```
question: "Would you like a Tradeoff Matrix analysis?"
header: "Evaluation"
options:
  - label: "Yes, compare options"
    description: "Score options across complexity, maintainability, performance, effort, flexibility"
  - label: "Skip for now"
    description: "Proceed to document"
```

If yes, run through the domain-specific evaluation from Step 6E-6I.

Then proceed to Edge-Case Bucketing (Step 8).

---

## Step 8: Edge-Case Bucketing

After analysis is complete (both modes), classify the brainstorm outcome:

Review the discussion and identify items that fit these categories:

| Bucket | Description | Action |
|--------|-------------|--------|
| **Ready for SD** | Clear scope, defined success criteria, ready to implement | Suggest `/leo create` |
| **Needs Triage** | Doesn't fit neatly into existing categories, needs classification | Tag for follow-up review |
| **Consideration Only** | Worth noting but not ready for implementation | Record in document, no SD |
| **Potential Conflict** | May conflict with existing features or planned work | Flag conflict, suggest investigation |
| **Significant Departure** | Major shift from current direction, needs deeper analysis | Suggest structured follow-up brainstorm |

Present the classification to the user:
```
**Outcome Classification**: [bucket]
[Brief explanation of why this classification]
```

---

## Step 8.5: Scope Assessment — Vision & Architecture Plan Needs

After outcome classification, assess whether the brainstorm requires formal vision and/or architecture documents before SD creation.

**Auto-detect signals** (if 2+ match, recommend vision+arch):

| Signal | Indicates |
|--------|-----------|
| Topic contains: "new UI", "new system", "platform", "redesign", "from scratch" | New build surface |
| Outcome is "Ready for SD" AND estimated effort > 20h | Significant scope |
| Multiple personas or user types identified | Needs UX vision |
| Team analysis Pragmatist rated feasibility ≤ 5/10 | Complex enough for architecture |
| Brainstorm domain is "architecture" | Architecture plan inherent |
| Multiple phases or evolution path discussed | Vision needed for roadmap |

**If 2+ signals detected**, ask using AskUserQuestion:

```
question: "This brainstorm has enough scope to warrant formal planning documents. What do you need?"
header: "Planning Docs"
options:
  - label: "Vision + Architecture Plan (Recommended)"
    description: "Create both — vision defines what/why, architecture defines how. Registered in EVA for HEAL scoring."
  - label: "Vision document only"
    description: "Strategic intent, personas, and success criteria. Architecture designed per-SD."
  - label: "Architecture plan only"
    description: "Technical decisions and component design. Link to existing L1 vision."
  - label: "Skip — go straight to SD"
    description: "Scope is clear enough from the brainstorm alone."
```

**If fewer than 2 signals**, skip this step and proceed to Step 9.

Store the user's choice for use in Step 9.5.

---

## Step 9: Generate and Save Document

### File Naming

Generate a slug from the topic (lowercase, hyphens, no special chars, max 50 chars).

**File path**: `brainstorm/YYYY-MM-DD-<topic-slug>.md`

Example: `brainstorm/2026-02-10-improve-handoff-gate-scoring.md`

### Document Template

Write the document using the Write tool with this structure:

```markdown
# Brainstorm: [Topic Title]

## Metadata
- **Date**: YYYY-MM-DD
- **Domain**: [Venture / Protocol / Integration / Architecture]
- **Phase**: [domain-specific phase]
- **Mode**: [Conversational / Structured]
- **Crystallization Score**: [score/1.0] (structured mode only)
- **Outcome Classification**: [bucket from Step 8]
- **Team Analysis**: [Yes (3/3 perspectives) / Yes (2/3 perspectives) / Skipped (--no-team)]
- **Related Ventures**: [venture names, if any identified]

---

## Problem Statement
[Synthesized from discovery answers - what problem does this solve and for whom?]

## Discovery Summary
[Key insights from the Q&A, organized by theme]

## Analysis

### Arguments For
- [Compelling reasons to pursue]

### Arguments Against
- [Honest risks and challenges]

## [Domain-Specific Evaluation]
(Include the appropriate evaluation section based on domain)

### Venture: Four-Plane Evaluation Matrix
(Plane 1-4 tables as in Step 6F)

### Protocol: Friction/Value/Risk Analysis
| Dimension | Score |
|-----------|-------|
| Friction Reduction | X/10 |
| Value Addition | X/10 |
| Risk Profile | X/10 |
| **Decision** | **Implement / Hold / Reject** |

### Integration: Data Quality/Coverage Analysis
| Dimension | Score |
|-----------|-------|
| Data Quality | X/10 |
| Coverage | X/10 |
| Edge Cases | [count] identified |

### Architecture: Tradeoff Matrix
(Option comparison table from Step 6I)

## Team Perspectives
(Included when team analysis is performed, omitted with --no-team)

### Challenger
- **Blind Spots**: [items from Challenger agent]
- **Assumptions at Risk**: [items from Challenger agent]
- **Worst Case**: [scenario from Challenger agent]

### Visionary
- **Opportunities**: [items from Visionary agent]
- **Synergies**: [items from Visionary agent]
- **Upside Scenario**: [scenario from Visionary agent]

### Pragmatist
- **Feasibility**: [score/10 from Pragmatist agent]
- **Resource Requirements**: [items from Pragmatist agent]
- **Constraints**: [items from Pragmatist agent]
- **Recommended Path**: [from Pragmatist agent]

### Synthesis
- **Consensus Points**: [where 2+ perspectives agree]
- **Tension Points**: [where perspectives conflict]
- **Composite Risk**: [Low/Medium/High]

## Out of Scope
(Structured mode only)
- [Item 1]
- [Item 2]
- [Item 3]

## Open Questions
- [Unresolved questions that emerged during brainstorming]

## Suggested Next Steps
- [Actionable next steps based on the brainstorm and outcome classification]
```

### After Saving

Confirm the file was saved:
```
Brainstorm saved to: brainstorm/YYYY-MM-DD-<topic-slug>.md
```

---

## Step 9.5: Vision & Architecture Document Pipeline

**Skip this step if Step 8.5 was skipped or user chose "Skip — go straight to SD".**

This step creates formal planning documents and registers them in EVA's tracking system (eva_vision_documents, eva_architecture_plans) so they are scored by HEAL and referenced by downstream SDs.

### 9.5A: Draft Vision Document (if requested)

Write a vision document to `docs/plans/<topic-slug>-vision.md`. Include:
- Executive Summary
- Problem Statement
- Personas (with goals, mindset, key activities)
- Information Architecture (views, routes, source tables)
- Key Decision/Intervention Points
- Integration patterns
- Evolution/phasing plan
- What this is NOT (explicit out-of-scope)
- UI/UX wireframes (ASCII mockups for each key view, if UI-related)
- Success criteria

Use the brainstorm discovery answers, team perspectives, and evaluation results as source material.

### 9.5B: Register Vision in EVA

Run the vision command. Provide dimensions manually (derived from the vision doc's key sections) to avoid LLM timeout on large documents:

```bash
node scripts/eva/vision-command.mjs upsert \
  --vision-key VISION-<TOPIC-KEY>-L2-001 \
  --level L2 \
  --source docs/plans/<topic-slug>-vision.md \
  --brainstorm-id <SESSION_ID> \
  --dimensions '<JSON_ARRAY>'
```

**Dimension derivation** (no LLM needed):
- Extract 6-10 dimensions from the vision doc's success criteria and key sections
- Each dimension: `{name, weight, description, source_section}`
- Weights should sum to ~1.0
- Use `timeout: 30000` for the command

If upsert succeeds, note the returned vision ID and key for the architecture plan linkage.

### 9.5C: Draft Architecture Plan (if requested)

Write an architecture plan to `docs/plans/<topic-slug>-architecture.md`. Include:
- Stack & repository decisions
- Legacy deprecation plan (if replacing existing)
- Route/component structure
- Data layer (Supabase queries, mutations, RLS requirements)
- API surface (RPC functions, governance endpoints)
- Implementation phases with time estimates
- Testing strategy
- Risk mitigation

### 9.5D: Register Architecture Plan in EVA

```bash
node scripts/eva/archplan-command.mjs upsert \
  --plan-key ARCH-<TOPIC-KEY>-001 \
  --vision-key VISION-<TOPIC-KEY>-L2-001 \
  --source docs/plans/<topic-slug>-architecture.md \
  --dimensions '<JSON_ARRAY>'
```

Architecture dimensions focus on structural/implementation aspects (6-8 dimensions).

### 9.5E: Confirm Registration

Report to the user:
```
Vision registered:  VISION-<KEY> (L2, N dimensions) — tracked by HEAL
Arch plan registered: ARCH-<KEY> (linked to VISION-<KEY>) — tracked by HEAL
Brainstorm linked: <SESSION_ID>

These documents are now in the EVA system. SDs created from this brainstorm
will reference these keys for traceability.
```

---

## Step 10: Session Retrospective

After saving the document, record the session for self-improvement:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('brainstorm_sessions').insert({
  domain: '<DOMAIN>',
  topic: '<TOPIC>',
  mode: '<structured|conversational>',
  stage: '<PHASE>',
  venture_ids: <VENTURE_IDS_ARRAY_OR_NULL>,
  cross_venture: <true|false>,
  outcome_type: '<outcome_bucket>',
  session_quality_score: <0-100>,
  crystallization_score: <0.0-1.0 or null>,
  retrospective_status: 'pending',
  document_path: '<file_path>',
  metadata: {
    questions_asked: <count>,
    questions_skipped: <count>,
    evaluation_performed: <true|false>,
    team_used: <true|false>,
    team_perspectives: <{challenger: {...}, visionary: {...}, pragmatist: {...}, synthesis: {...}} or null>,
    team_agents_responded: <0|1|2|3>,
    related_ventures: [<venture_names>]
  }
}).select().single().then(({data, error}) => {
  if (error) console.error('Session record error:', error.message);
  else console.log('SESSION_ID=' + data.id);
});
"
```

**Session quality score** (0-100): Rate based on:
- Did the user engage with all required questions? (+20 per question answered)
- Was the evaluation framework used? (+20)
- Was an outcome classification reached? (+20)
- Did it lead to a clear next step? (+20)
- Topic depth (substantive vs surface-level answers) (+20)

Cap at 100. This score feeds into the self-improvement loop.

---

## Step 11: Command Ecosystem Integration

After the document is saved and session recorded, suggest next steps based on the outcome classification:

**If outcome is "Ready for SD" AND vision/arch were registered in Step 9.5:**
```
question: "Vision and architecture plan are registered in EVA. Ready to create SDs?"
header: "Next Steps"
options:
  - label: "Create SDs (Recommended)"
    description: "Create Strategic Directives referencing VISION-<KEY> and ARCH-<KEY>"
  - label: "Review documents first"
    description: "Read through the vision and architecture docs before creating SDs"
  - label: "Triangulate first"
    description: "Get external AI opinions on open questions via /triangulation-protocol"
  - label: "Done for now"
    description: "Documents are registered — SDs can be created in a future session"
```

**If outcome is "Ready for SD" AND no vision/arch registered:**
```
question: "This brainstorm looks ready for implementation. What next?"
header: "Next Steps"
options:
  - label: "Create an SD (Recommended)"
    description: "Turn this brainstorm into a Strategic Directive via /leo create"
  - label: "Triangulate first"
    description: "Get external AI opinions on open questions via /triangulation-protocol"
  - label: "Done for now"
    description: "End brainstorming session"
```

**If outcome is "Needs Triage" or "Potential Conflict":**
```
question: "This needs further analysis. What would you like to do?"
header: "Next Steps"
options:
  - label: "Triangulate"
    description: "Get external AI opinions on the unresolved questions"
  - label: "Brainstorm again"
    description: "Run another brainstorm with more specific scope"
  - label: "Capture pattern"
    description: "Record insights as learnings via /learn"
  - label: "Done for now"
    description: "End brainstorming session"
```

**If outcome is "Consideration Only" or "Significant Departure":**
```
question: "What would you like to do with this brainstorm?"
header: "Next Steps"
options:
  - label: "Capture pattern"
    description: "Record insights as learnings via /learn"
  - label: "Create an SD anyway"
    description: "Turn this into a Strategic Directive despite the classification"
  - label: "Done for now"
    description: "End brainstorming session"
```

**Auto-invoke behavior**: When user selects a command option, immediately invoke that skill using the Skill tool.

---

## Role Prompts - Domain-Specific Lenses

Each team role adapts its analysis based on the brainstorm domain:

### Challenger Lenses
| Domain | Focus Areas |
|--------|-------------|
| Venture | Market assumptions, competitive blind spots, unit economics risks |
| Protocol | Backward compatibility risks, adoption friction, edge cases in workflow |
| Integration | API reliability assumptions, data quality risks, vendor lock-in |
| Architecture | Scalability limits, maintenance burden, migration complexity |

### Visionary Lenses
| Domain | Focus Areas |
|--------|-------------|
| Venture | Market expansion, network effects, platform potential |
| Protocol | Automation opportunities, cross-SD synergies, developer experience gains |
| Integration | Data enrichment possibilities, real-time capabilities, ecosystem play |
| Architecture | Future-proofing, composability, performance breakthroughs |

### Pragmatist Lenses
| Domain | Focus Areas |
|--------|-------------|
| Venture | Time-to-market, resource constraints, MVP scope |
| Protocol | Implementation complexity, testing burden, rollout strategy |
| Integration | Rate limits, error handling, monitoring requirements |
| Architecture | Migration path, team skill match, operational complexity |

---

## Question Banks

### Venture Domain

#### Ideation
| ID | Question | Required |
|----|----------|----------|
| v_problem | What specific problem are you trying to solve? | Yes |
| v_user | Who is the primary user affected by this problem? | Yes |
| v_outcome | What outcome would success look like for this feature? | Yes |
| v_validation | How would you validate that this solves the problem? | No |
| v_risk | What is the biggest risk or unknown for this work? | No |

#### Validation
| ID | Question | Required |
|----|----------|----------|
| v_hypothesis | What hypothesis are you testing with this feature? | Yes |
| v_metric | What metric will prove/disprove the hypothesis? | Yes |
| v_mvp | What is the minimum implementation to test this? | Yes |
| v_pivot | What would trigger a pivot or change in direction? | No |

#### MVP
| ID | Question | Required |
|----|----------|----------|
| v_user_value | What user value does this feature provide? | Yes |
| v_integration | How does this integrate with existing features? | Yes |
| v_success_metric | What metric defines success for this feature? | Yes |
| v_dependencies | What dependencies or blockers exist? | No |

#### Growth
| ID | Question | Required |
|----|----------|----------|
| v_retention | How does this improve user retention or engagement? | Yes |
| v_scalability | What scalability considerations are there? | Yes |
| v_measurement | How will you measure impact? | Yes |
| v_iteration | What iteration plan exists after launch? | No |

#### Scale
| ID | Question | Required |
|----|----------|----------|
| v_efficiency | How does this improve operational efficiency? | Yes |
| v_automation | What can be automated in this feature? | Yes |
| v_enterprise | How does this support enterprise requirements? | Yes |
| v_maintenance | What is the long-term maintenance burden? | No |

### Protocol Domain

#### Discovery
| ID | Question | Required |
|----|----------|----------|
| p_friction | What specific friction point or inefficiency have you observed? | Yes |
| p_evidence | What evidence exists that this is a real problem (frequency, impact)? | Yes |
| p_affected | Which workflows or phases are affected? | Yes |
| p_workaround | How are people working around this today? | No |
| p_root_cause | What do you think is the root cause? | No |

#### Design
| ID | Question | Required |
|----|----------|----------|
| p_behavior | What should the new behavior look like? | Yes |
| p_rules | What rules or constraints must the solution respect? | Yes |
| p_backward | How does this affect backward compatibility with existing SDs? | Yes |
| p_validation | How will you validate the change works correctly? | No |
| p_rollback | What is the rollback plan if this causes issues? | No |
| p_adoption | How will existing users learn about this change? | No |

#### Implement
| ID | Question | Required |
|----|----------|----------|
| p_scope | What is the minimum set of changes needed? | Yes |
| p_testing | What test scenarios will prove this works? | Yes |
| p_migration | Is any data migration or state transition needed? | Yes |
| p_monitoring | How will you monitor this after deployment? | No |
| p_phasing | Should this roll out gradually or all at once? | No |

### Integration Domain

#### Intake
| ID | Question | Required |
|----|----------|----------|
| i_source | What external system or data source are you connecting to? | Yes |
| i_data_shape | What does the data look like (format, schema, volume)? | Yes |
| i_auth | What authentication/authorization does the external API require? | Yes |
| i_rate_limits | Are there rate limits or quotas to respect? | No |
| i_existing | Does any existing integration overlap with this? | No |

#### Process
| ID | Question | Required |
|----|----------|----------|
| i_transform | What transformations are needed between source and destination? | Yes |
| i_validation | How will you validate incoming data quality? | Yes |
| i_errors | What happens when the external service is unavailable? | Yes |
| i_dedup | How will you handle duplicate data? | No |
| i_ordering | Does processing order matter? | No |
| i_partial | How do you handle partial data (some fields missing)? | No |

#### Output
| ID | Question | Required |
|----|----------|----------|
| i_destination | Where does the processed data go? | Yes |
| i_monitoring | How will you monitor integration health? | Yes |
| i_alerting | What conditions should trigger alerts? | Yes |
| i_backfill | Can historical data be backfilled? | No |
| i_cleanup | What happens to stale data that's no longer updated? | No |

### Architecture Domain

#### Explore
| ID | Question | Required |
|----|----------|----------|
| a_constraint | What are the hard constraints (performance, cost, compatibility)? | Yes |
| a_options | What are the main options you're considering? | Yes |
| a_current | What is the current architecture and why is it insufficient? | Yes |
| a_scale | What scale does the solution need to handle (now and future)? | No |
| a_precedent | Are there patterns from other parts of the codebase to follow? | No |
| a_team | Who needs to understand and maintain this? | No |

#### Decide
| ID | Question | Required |
|----|----------|----------|
| a_tradeoffs | What are the key tradeoffs between your options? | Yes |
| a_reversibility | How reversible is each option? | Yes |
| a_dependencies | What downstream systems or code will be affected? | Yes |
| a_migration | What migration path exists from current to new? | No |
| a_cost | What is the implementation cost (time, complexity) for each option? | No |

#### Execute
| ID | Question | Required |
|----|----------|----------|
| a_plan | What is the step-by-step execution plan? | Yes |
| a_testing | How will you verify the architecture works as designed? | Yes |
| a_monitoring | What metrics will indicate success or failure? | Yes |
| a_rollback | What is the rollback plan? | No |
| a_documentation | What needs to be documented for future maintainers? | No |

---

## Capabilities Graph Integration

When evaluating Venture domain brainstorms (particularly in Plane 1 of the Four-Plane Matrix), check for shared capabilities:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// Check if capabilities table exists
supabase.from('venture_capabilities').select('id').limit(1).then(({data, error}) => {
  if (error) console.log('CAPABILITIES: not_available');
  else console.log('CAPABILITIES: available (' + (data?.length || 0) + ' found)');
});
"
```

**If capabilities table exists**: Surface relevant capabilities during Plane 1 evaluation and note reuse potential.

**If capabilities table does not exist** (current state): Use graceful degradation. Note in the evaluation:
```
Capabilities graph: Not yet available. Capability assessment is based on manual analysis.
When the capabilities registry is implemented, this brainstorm can be re-evaluated.
```

This is not a blocker - the Four-Plane evaluation proceeds with manual capability assessment.

---

## Command Ecosystem Integration

### Cross-Reference

This command is part of the **Command Ecosystem**. For full workflow context, see:
- **[Command Ecosystem Reference](../../docs/reference/command-ecosystem.md)** - Complete inter-command flow diagram and relationships

**Note**: `/brainstorm` is a universal thinking tool for any domain, not just ventures. It connects to SD creation, learning capture, and external validation.

### Related Commands
| Command | Relationship |
|---------|-------------|
| `/leo create` | Create SD from crystallized brainstorm |
| `/triangulation-protocol` | Validate open questions with external AIs |
| `/learn` | Capture patterns discovered during brainstorming |
| `/quick-fix` | If brainstorm reveals a small fix needed first |
| `/brainstorm` | Re-brainstorm with narrower scope (self-referential for iteration) |
