# /brainstorm - EHG-Aware Strategic Brainstorming

Universal thinking tool with domain-specific question banks, multi-venture awareness, and self-improving retrospective. Stores content in the `brainstorm_sessions.content` database column (DB-only — no filesystem markdown files).

**Arguments**: `$ARGUMENTS`

---

## Step 1: Parse Arguments

Parse `$ARGUMENTS` for:
- **Topic**: Everything that isn't a flag (e.g., "AI-powered customer support chatbot")
- **`--structured`**: If present, use Structured Mode (full Phase 0 rigor). Otherwise, use Conversational Mode (default).
- **`--no-team`**: If present, skip multi-perspective team analysis. Default: team analysis is ON.
- **`--domain <domain>`**: One of `venture`, `protocol`, `integration`, `architecture`. If not provided, auto-detect or ask.
- **`--stage <stage>`**: Phase within the selected domain (see Step 3). If not provided, ask the user.

If no topic is provided, offer OKR-driven options using AskUserQuestion:

```
question: "What would you like to brainstorm?"
header: "Brainstorm"
options:
  - label: "OKR progress — move the needle"
    description: "Focus on advancing stalled or underperforming Key Results"
  - label: "OKR system improvements"
    description: "Protocol/tooling improvements to how OKRs work"
  - label: "Monthly OKR review"
    description: "Review current OKR health, close stale ones, set new targets"
  - label: "New OKR creation"
    description: "Define new objectives and key results for upcoming work"
  - label: "Something else"
    description: "Enter a custom brainstorm topic"
```

If the user selects an OKR option (1-4), query the database for current OKR state before proceeding:
```sql
SELECT o.id, o.objective_key, o.title, o.status,
       kr.key_result_key, kr.title as kr_title, kr.current_value, kr.target_value, kr.status as kr_status
FROM okrs o
LEFT JOIN key_results kr ON kr.okr_id = o.id
WHERE o.status IN ('active', 'at_risk', 'behind')
ORDER BY o.objective_key, kr.key_result_key
```
Use the OKR data to ground the brainstorm in actual progress/gaps. Set the domain to `protocol` for options 2-3, `architecture` for option 4, and auto-detect for option 1 based on which KRs are selected.

If the user selects "Something else", ask: "What would you like to brainstorm?" as a free-text follow-up.

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

Review the brainstorm conversation so far and generate **specific, contextual exclusions** — not generic categories. For each candidate exclusion, assign a confidence level:

**High confidence** — features explicitly discussed as "future/later", unanimously deprioritized by the board, or clearly deferred during discovery. Examples: a capability the chairman explicitly said "we'll add that later", a feature the board unanimously deferred to Phase 4+.
→ **Auto-record these. Do NOT ask the chairman.** List them as "Auto-excluded (high confidence)" in the document.

**Medium confidence** — adjacent to the topic, came up in discussion but wasn't explicitly ruled in or out, or board had split opinions. These are the borderline cases where reasonable people might disagree.
→ **Present ONLY these to the chairman** as a multi-select AskUserQuestion for confirmation.

**Low confidence** — tangentially related, might surprise the chairman if excluded.
→ Include as options in the AskUserQuestion but flag them as needing confirmation.

Use AskUserQuestion with `multiSelect: true` to present medium/low confidence items:
```
question: "I've auto-excluded [N] obvious items (listed below). These borderline items need your call — select which are out of scope:"
header: "Not Doing"
multiSelect: true
options:
  - label: "[Specific medium-confidence exclusion]"
    description: "[Why this is related but potentially out of scope — with rationale]"
  - label: "[Specific medium-confidence exclusion]"
    description: "[Rationale]"
  - label: "Nothing else — keep scope broad"
    description: "Only the auto-excluded items are out of scope"
```

Include the auto-excluded high-confidence items in the question text so the chairman can see them and override if needed.

**Do NOT present generic categories** like "Adjacent features" or "Scale concerns." Every option must name a specific feature/capability with a rationale derived from this brainstorm's discussion.

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

**GOVERNANCE MODEL SELECTION**: Check if Board of Directors governance is enabled:
- If `BOARD_GOVERNANCE_ENABLED` environment variable is `true` (or not set — default ON):
  → Use **Board of Directors Deliberation** (Step 6D.1a) instead of legacy personas
- If `BOARD_GOVERNANCE_ENABLED` is explicitly `false` or `--no-board` flag is present:
  → Use legacy 3-persona analysis (Step 6D.1b)

### 6D.1a: Board of Directors Deliberation (Default — replaces 3-persona analysis)

After discovery and crystallization, execute a full board deliberation. Claude directly orchestrates the deliberation by spawning board seats as Agents (which provides the `invokeAgent` callback that the deliberation engine requires).

**IMPORTANT**: Do NOT run `node scripts/brainstorm-deliberate.js` without `--dry-run`. The CLI script cannot call back into Claude's Agent tool. Claude must orchestrate the deliberation directly using the steps below.

**Execution Flow** (Claude orchestrates each step):

#### Step A: Panel Selection & Setup

Get the panel composition and create a debate session:

```bash
node scripts/brainstorm-deliberate.js --topic "<crystallized topic>" --keywords "<comma-separated keywords>" --dry-run
```

This prints the panel (6 seats with codes, titles, relevance scores). Capture the seat codes and titles.

Then create the debate session and load institutional memory:

```bash
node -e "
require('dotenv').config();
const { createBoardDebateSession } = require('./lib/brainstorm/board-judiciary-bridge.js');
const { loadSeatMemory } = require('./lib/brainstorm/institutional-memory.js');
const { findRelevantSpecialists } = require('./lib/brainstorm/specialist-registry.js');
(async () => {
  const sessionId = await createBoardDebateSession('<BRAINSTORM_SESSION_ID>', '<TOPIC>');
  console.log('DEBATE_SESSION_ID=' + sessionId);

  // Load memory for all seats in parallel
  const seats = ['CSO', 'CRO', 'CTO', 'CISO', 'COO', 'CFO'];
  const keywords = '<KEYWORDS>'.split(',').map(k => k.trim());
  for (const code of seats) {
    const memory = await loadSeatMemory(code, '<TOPIC>', keywords);
    if (memory) console.log('MEMORY_' + code + '=' + JSON.stringify(memory));
    else console.log('MEMORY_' + code + '=');
  }

  // Pre-seed specialists
  const specialists = await findRelevantSpecialists('<TOPIC>', keywords);
  if (specialists.length > 0) console.log('PRE_SEEDED_SPECIALISTS=' + JSON.stringify(specialists));
  else console.log('PRE_SEEDED_SPECIALISTS=[]');
})();
"
```

Capture the `DEBATE_SESSION_ID`, memory context per seat, and pre-seeded specialists.

#### Step B: Round 1 — All Seats in Parallel

Spawn **all 6 board seats as Agents in parallel** using the Agent tool. Each agent receives its seat's system prompt and the deliberation topic.

For each seat, use this prompt template (replace `<SEAT_CODE>`, `<SEAT_TITLE>`, `<STANDING_QUESTION>`, `<SEAT_MEMORY>`, `<SPECIALIST_ROSTER>`):

```
You are the <SEAT_TITLE> (<SEAT_CODE>) on EHG's Board of Directors.

Your standing question: "<STANDING_QUESTION>"

<SEAT_MEMORY>
<SPECIALIST_ROSTER>

Deliberation Topic: <TOPIC>
Domain: <DOMAIN>

Produce your <SEAT_TITLE> position on this topic. Address your standing question.
Be specific to THIS topic. Reference concrete details, not generic advice.

When you identify an area where the board lacks deep expertise, flag it as:
EXPERTISE_GAP: [description of the gap]
```

**Standing questions by seat:**
- CSO: "Does this move EHG forward or sideways?"
- CRO: "What's the blast radius if this fails?"
- CTO: "What do we already have? What's the real build cost?"
- CISO: "What attack surface does this create?"
- COO: "Can we actually deliver this given current load?"
- CFO: "What does this cost and what's the return?"

**Quorum check**: After all agents respond, verify at least 4 of 6 (67%) produced substantive positions (>50 characters). If quorum fails, fall back to Step 6D.1b.

#### Step C: Persist Round 1 & Detect Expertise Gaps

Record all Round 1 positions to the database:

```bash
node -e "
require('dotenv').config();
const { recordBoardArgument, extractConstitutionalCitations } = require('./lib/brainstorm/board-judiciary-bridge.js');
const { parseExpertiseGaps } = require('./lib/brainstorm/specialist-registry.js');
(async () => {
  const positions = <ROUND_1_POSITIONS_JSON>;
  for (const pos of positions) {
    const citations = extractConstitutionalCitations(pos.position);
    const argId = await recordBoardArgument({
      debateSessionId: '<DEBATE_SESSION_ID>',
      agentCode: pos.seatCode,
      roundNumber: 1,
      argumentType: 'initial_position',
      summary: pos.position.slice(0, 500),
      detailedReasoning: pos.position,
      confidenceScore: 0.8,
      constitutionCitations: citations
    });
    console.log('ROUND1_ARG_' + pos.seatCode + '=' + argId);
  }

  // Detect expertise gaps from all positions
  const allOutputs = positions.map(p => p.position);
  const gaps = parseExpertiseGaps(allOutputs);
  console.log('EXPERTISE_GAPS=' + JSON.stringify(gaps));
})();
"
```

#### Step D: Specialist Summoning (if gaps detected)

If `EXPERTISE_GAPS` is non-empty, for each gap (max 3):

1. Check if a specialist exists:
```bash
node -e "
require('dotenv').config();
const { findSpecialist, generateSpecialistIdentity, registerSpecialist } = require('./lib/brainstorm/specialist-registry.js');
(async () => {
  let specialist = await findSpecialist('<GAP_DESCRIPTION>');
  if (!specialist) {
    specialist = generateSpecialistIdentity('<GAP_DESCRIPTION>', '<TOPIC>');
    await registerSpecialist(specialist);
    console.log('NEW_SPECIALIST=true');
  } else {
    console.log('NEW_SPECIALIST=false');
  }
  console.log('SPECIALIST_CODE=' + specialist.agentCode);
  console.log('SPECIALIST_IDENTITY=' + JSON.stringify(specialist.identity));
})();
"
```

2. Spawn an Agent with the specialist's identity as the system prompt:
```
<SPECIALIST_IDENTITY>

The Board of Directors is deliberating on: "<TOPIC>"
They identified an expertise gap in: <GAP_DESCRIPTION>

Provide your expert testimony. Be specific, actionable, and grounded in domain knowledge.
```

3. Persist specialist testimony via `recordBoardArgument` (same pattern as Round 1).

#### Step E: Round 2 — Rebuttals in Parallel

Spawn **all 6 seats as Agents again in parallel**, this time with cross-seat awareness.

For each seat, include in the prompt:
- Their original Round 1 position
- All OTHER seats' Round 1 positions (truncated to 400 chars each)
- Any specialist testimony from Step D

Prompt template:
```
You are the <SEAT_TITLE> (<SEAT_CODE>) on EHG's Board of Directors.
<SEAT_MEMORY>

ROUND 2 REBUTTAL — Deliberation Topic: "<TOPIC>"

Your Round 1 position has been recorded. Now review other board members' positions and specialist testimony, then produce your rebuttal.

OTHER BOARD POSITIONS:
<OTHER_POSITIONS>

<SPECIALIST_TESTIMONY>

Reference specific positions from other seats by their code (e.g., "The CRO raises a valid concern about..."). Incorporate specialist testimony where relevant. Refine or defend your position based on new information.
```

Persist Round 2 rebuttals via `recordBoardArgument` with `roundNumber: 2, argumentType: 'rebuttal'`.

#### Step F: Judiciary Synthesis

Spawn **one Agent** for the judiciary verdict:

```
You are the Judiciary of EHG's Board of Directors governance system.

Your role: Synthesize the board's deliberation into a clear verdict.

You MUST:
1. Identify consensus points across all seats
2. Identify tension points where seats disagree
3. Cite specific constitutional rules (CONST-001 through CONST-010, FOUR_OATHS, DOCTRINE) where relevant
4. Determine if positions are reconcilable or require chairman escalation
5. Provide a clear recommendation

Set escalation_required=true if:
- Positions are fundamentally irreconcilable after Round 2
- Constitutional concerns require human judgment
- Confidence in synthesis is below 0.6

ROUND 1 POSITIONS:
<ALL_ROUND_1_POSITIONS>

ROUND 2 REBUTTALS:
<ALL_ROUND_2_REBUTTALS>

<SPECIALIST_TESTIMONY>

Produce your verdict with sections: CONSENSUS, TENSIONS, CONSTITUTIONAL CITATIONS, RECOMMENDATION, ESCALATION (true/false with reason).
```

Persist the verdict:
```bash
node -e "
require('dotenv').config();
const { recordJudiciaryVerdict, extractConstitutionalCitations, updateDebateRound } = require('./lib/brainstorm/board-judiciary-bridge.js');
(async () => {
  await updateDebateRound('<DEBATE_SESSION_ID>', 2);
  const citations = extractConstitutionalCitations('<VERDICT_TEXT>');
  const citationsWithScores = citations.map(c => ({
    source: c.startsWith('CONST-') ? 'PROTOCOL' : c,
    rule_number: c,
    relevance_score: 0.80
  }));
  const escalation = /escalation.*(?:required|needed|true)/i.test('<VERDICT_TEXT>');
  const verdictId = await recordJudiciaryVerdict({
    debateSessionId: '<DEBATE_SESSION_ID>',
    summary: '<VERDICT_TEXT>'.slice(0, 500),
    detailedRationale: '<VERDICT_TEXT>',
    constitutionCitations: citationsWithScores,
    constitutionalScore: 0.80,
    confidenceScore: escalation ? 0.5 : 0.8,
    escalationRequired: escalation
  });
  console.log('VERDICT_ID=' + verdictId);
  console.log('ESCALATION=' + escalation);
})();
"
```

#### Step G: Synthesis Output

After all steps complete, compile the deliberation results:

- **Board Consensus**: Points where 3+ seats agree
- **Key Tensions**: Where seats disagree (with constitutional citations if relevant)
- **Specialist Insights**: Deep expertise from auto-summoned specialists
- **Risk Assessment**: Composite from CRO (risk), CISO (security), COO (execution)
- **Strategic Recommendation**: From judiciary verdict
- **Escalation Status**: Whether chairman override is needed

**Error Handling:**
- If any individual seat agent fails or times out, proceed with remaining seats (quorum requires 4/6)
- If quorum fails (<4 seats responded): Fall back to Step 6D.1b (legacy 3-persona)
- If judiciary agent fails: Synthesize verdict manually from Round 1 + Round 2 positions

Store the board deliberation results for document generation (Step 9).

### 6D.1b: Legacy 3-Persona Analysis (Fallback)

**This is the fallback when `BOARD_GOVERNANCE_ENABLED=false` or `--no-board` flag is present.**

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

Then proceed to Top 3 Improvement Areas (Step 7.9).

---

## Step 7: Conversational Mode (Default)

Lighter brainstorming flow with 2-3 questions at a time.

### 7A: Initial Questions

Ask 2-3 phase-appropriate questions from the domain's question bank (pick the required ones). Present them together in a single message.

### 7B: Follow-Up Questions

Based on the answers, ask 1-2 follow-up questions to deepen understanding. These can be from optional questions in the bank or generated based on the conversation.

### 7B.1: Multi-Perspective Team Analysis (Default ON)

**Skip this step if `--no-team` flag is present.**

Same team analysis as Step 6D.1 — use the governance model selection logic from 6D.1. If Board of Directors is enabled (default), use the board deliberation flow (6D.1a). Otherwise, fall back to the legacy 3-persona analysis (6D.1b). Use discovery insights from Step 7A/7B as the deliberation topic context.

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

Then proceed to Step 7E (Not-Doing Contract).

### 7E: Not-Doing Contract (UN_DONE_PROPOSAL — Conversational Mode)

**Same logic as structured-mode Step 6C.** Before outcome classification, capture an explicit "Not Doing" list with confidence-based triage.

Review the brainstorm conversation and board deliberation to generate **specific, contextual exclusions**:

**High confidence** — features explicitly discussed as "future/later", unanimously deprioritized by the board, or clearly deferred during the conversation (e.g., chairman said "we'll add voice later").
→ **Auto-record these. Do NOT ask the chairman.** List them in the question text so the chairman can see them and override if needed, but do not require confirmation.

**Medium confidence** — adjacent to the topic, came up in discussion but wasn't explicitly ruled in or out, or board had split opinions. These are the borderline cases.
→ **Present ONLY these to the chairman** as a multi-select AskUserQuestion.

**Low confidence** — tangentially related, might surprise the chairman if excluded.
→ Include as options but flag them.

Use AskUserQuestion with `multiSelect: true`:
```
question: "I've auto-excluded [N] obvious items: [list them]. These borderline items need your call — select which are also out of scope:"
header: "Not Doing"
multiSelect: true
options:
  - label: "[Specific medium-confidence exclusion]"
    description: "[Why this is related but potentially out of scope — rationale from the discussion]"
  - label: "[Specific medium/low-confidence exclusion]"
    description: "[Rationale]"
  - label: "Nothing else — keep scope broad"
    description: "Only the auto-excluded items are out of scope"
```

**Do NOT present generic categories** like "Adjacent features" or "Scale concerns." Every option must name a specific feature/capability with a rationale derived from this brainstorm's discussion. Do NOT waste the chairman's time confirming obvious exclusions — the value is in the borderline calls.

**Persistence**: Combine auto-excluded items + chairman-confirmed items into the `not_doing` array. Pass to Step 10's metadata. The array will be rendered in Step 9's brainstorm document under the `## Out of Scope` section.

**Skip condition**: If the brainstorm was invoked from `/distill` (pre-seeded source) AND the chairman has already specified out-of-scope in the distill input, set `not_doing` from that source and skip the prompt.

Then proceed to Top 3 Improvement Areas (Step 7.9).

---

## Step 7.9: Top 3 Improvement Areas (Board Consensus)

After multi-perspective analysis completes (board deliberation or legacy team analysis), the board must identify and reach consensus on the **top 3 areas for improvement** related to whatever was evaluated.

### 7.9A: Extract Candidate Improvement Areas

Review all board positions (Round 1 + Round 2), specialist testimony, judiciary verdict, and domain-specific evaluation results. Extract **5-7 candidate improvement areas** — these are specific, actionable things that would make the evaluated topic stronger, more viable, or less risky.

Each candidate must include:
- **Area**: A concise label (e.g., "Customer validation depth", "API rate-limit resilience")
- **Source**: Which board seat(s) or specialist raised it
- **Rationale**: Why this matters — what risk it mitigates or opportunity it unlocks

### 7.9B: Board Consensus Vote

Spawn **all responding board seats in parallel** (same seats from Round 1) as Agents. Each seat receives the candidate list and votes:

```
You are the <SEAT_TITLE> (<SEAT_CODE>) on EHG's Board of Directors.

The board has identified these candidate improvement areas for "<TOPIC>":

<CANDIDATE_LIST>

From your <SEAT_TITLE> perspective, rank your TOP 3 from this list (by number). For each pick, provide ONE sentence explaining why it's critical from your seat's vantage point.

IMPORTANT: Return your response as a JSON object:
{
  "seat": "<SEAT_CODE>",
  "rankings": [<1st_choice_number>, <2nd_choice_number>, <3rd_choice_number>],
  "reasons": {
    "<1st_choice_number>": "<one-sentence reason>",
    "<2nd_choice_number>": "<one-sentence reason>",
    "<3rd_choice_number>": "<one-sentence reason>"
  }
}
```

**After all board agents return**, collect votes using the tally module (`lib/brainstorm/tally-module.js`):

```javascript
import { collectVotes, scoreBorda, paretoSignal, formatTallyDisplay } from './lib/brainstorm/tally-module.js';

// boardVotes = array of { seat, rankings } from agent responses
const voteMatrix = collectVotes(boardVotes, candidateCount);
```

### 7.9C: Tally and Rank

Use Borda count scoring via the tally module for deterministic, auditable ranking:

```javascript
const scores = scoreBorda(voteMatrix);
const pareto = paretoSignal(scores);
const display = formatTallyDisplay(scores, pareto, candidateLabels);
```

Display the ASCII tally results to the user. The top 3 by Borda score become the board's consensus improvement areas.

For each of the top 3, compile a **rationale block**:
- **Area**: The improvement area label
- **Board Support**: N/M seats voted for this (list which seats from `scores[i].voters`)
- **Composite Rationale**: Synthesize the strongest arguments from the voting seats into 2-3 sentences explaining why this matters

The Pareto signal indicates consensus strength:
- **Concentrated** (top 2 ≥ 80%): Strong agreement — present with confidence
- **Dispersed** (top 2 < 80%): Weak consensus — flag to chairman that opinions are spread

If there is a tie for 3rd place, Borda stable sort breaks ties by candidate number. Include all tied items (up to 4 total).

### 7.9D: Present to Chairman (Multi-Select)

Present the board's consensus top 3 to the chairman using AskUserQuestion with `multiSelect: true`. Include the Pareto signal in the header:

```
question: "The board has reached consensus on the top areas for improvement. Select which to prioritize:"
header: "Improvements (Board consensus: <PARETO_SIGNAL> — top 2 = <TOP_TWO_PERCENT>%)"
multiSelect: true
options:
  - label: "1. <AREA_1>"
    description: "<COMPOSITE_RATIONALE_1> (Board support: <N>/6 seats — <SEAT_LIST>) [<SCORE> pts, <PERCENTAGE>%]"
  - label: "2. <AREA_2>"
    description: "<COMPOSITE_RATIONALE_2> (Board support: <N>/6 seats — <SEAT_LIST>) [<SCORE> pts, <PERCENTAGE>%]"
  - label: "3. <AREA_3>"
    description: "<COMPOSITE_RATIONALE_3> (Board support: <N>/6 seats — <SEAT_LIST>) [<SCORE> pts, <PERCENTAGE>%]"
  - label: "None — override"
    description: "Reject board recommendation, proceed to outcome classification without improvement focus"
```

**Processing chairman's selection:**
- Selected items become **improvement focus areas** — carry them forward into the brainstorm document (Step 9) under a `## Board-Recommended Improvement Areas` section, and into vision/architecture documents (Step 9.5) as prioritized items.
- If "None — override" is selected (alone), record the chairman override and proceed normally without improvement focus.
- Chairman can select any combination of 1, 2, or all 3 items — record only selected items as prioritized.

### 7.9E: Legacy Team Fallback

If using legacy 3-persona analysis (Step 6D.1b) instead of board deliberation, extract the top 3 improvement areas from the Challenger's blind spots, Pragmatist's constraints, and Visionary's opportunities. Present the same multi-select to the chairman (Step 7.9D) but note "Team consensus" instead of "Board support" in the rationale.

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

**Outcome-to-DB mapping** (use the DB value in the INSERT statement, not the display label):

| Display Label          | DB `outcome_type` value   |
|------------------------|---------------------------|
| Ready for SD           | `sd_created`              |
| Quick Fix              | `quick_fix`               |
| No Action              | `no_action`               |
| Needs Triage           | `needs_triage`            |
| Consideration Only     | `consideration_only`      |
| Potential Conflict     | `conflict`                |
| Significant Departure  | `significant_departure`   |

Present the classification to the user:
```
**Outcome Classification**: [bucket]
[Brief explanation of why this classification]
```

---

## Step 8.7: Chairman Sanity Check (MANDATORY)

**BLOCKING GATE** — Do NOT proceed to vision/architecture generation until the chairman reviews flagged items.

After outcome classification (Step 8), but BEFORE vision and architecture creation (Step 8.5/9.5), present a structured review checkpoint. This catches over-optimistic claims, unvalidated assumptions, and vague assertions before they propagate into planning documents.

**When to fire**: Every brainstorm classified as "Ready for SD", "Needs Triage", or "Potential Conflict". Skip only for "Consideration Only" or "Significant Departure".

### 8.7A: Extract Flagged Items

Review the brainstorm discussion and extract items that fall into these 8 rubric categories. For each category, identify the specific claim or assumption from the brainstorm that warrants review:

| Category | What to Flag |
|----------|-------------|
| **Market Size** | Any TAM/SAM/SOM estimates, market growth claims, or addressable audience assertions |
| **Competitive Moat** | Claims about defensibility, unique advantages, or barriers to entry |
| **Technical Feasibility** | Assumptions about what can be built, integration complexity, or timeline estimates |
| **Revenue Model** | Pricing assumptions, monetization claims, or unit economics |
| **Team Fit** | Whether EHG (solo entrepreneur) has the skills/bandwidth for this |
| **Timing** | Claims about market readiness, urgency, or window of opportunity |
| **Regulatory Risk** | Any compliance, legal, or regulatory assumptions (or absence of consideration) |
| **Capital Requirements** | Estimates of cost, infrastructure needs, or resource commitments |

For each category where the brainstorm made a notable claim or assumption, create a flagged item with:
- The specific claim/quote from the discussion
- A recommended action (Accept as-is, Flag for deeper analysis, or Needs more research)

**Skip categories** where the brainstorm did not make any relevant claims (e.g., a protocol brainstorm may have no Market Size claims).

### 8.7B: Present Chairman Review

For each flagged item, use AskUserQuestion:

```
question: "[Category]: [Specific claim from brainstorm]"
header: "Chairman Review — [Category]"
options:
  - label: "Accept as-is"
    description: "This claim is reasonable — proceed to vision generation"
  - label: "Flag for deeper analysis"
    description: "Include a risk note in the vision document for this item"
  - label: "Needs more research"
    description: "HALT pipeline — this needs a follow-up brainstorm before proceeding"
```

Present items one at a time so the chairman can make individual decisions.

### 8.7C: Process Decisions

After all items are reviewed:

- **If ANY item received "Needs more research"**: HALT the pipeline. Do NOT proceed to Step 8.5 or Step 9.5. Instead:
  ```
  ⛔ Pipeline Halted — Research Needed

  The following items need more research before this brainstorm can proceed to vision/architecture:
  - [Category]: [Claim] — Chairman decision: Needs more research

  Suggested follow-up: Run `/brainstorm --domain <same-domain> "<specific research topic>"`
  ```
  Save the brainstorm document (Step 9) with outcome reclassified to "Needs Triage" and skip Steps 9.5+.

- **If items received "Flag for deeper analysis"**: Record the flags. These will be injected as risk notes into the vision document (Step 9.5A) under a new `## Chairman Review Flags` section.

- **If all items "Accept as-is"**: Proceed normally to Step 8.5.

### 8.7D: Record Decisions

Store the chairman review decisions in the brainstorm document metadata section:
```markdown
- **Chairman Review**: [N items reviewed, M accepted, F flagged, R research-needed]
```

---

## Step 8.5: Vision & Architecture Plan Creation (MANDATORY)

**ANTI-PATTERN**: Skipping vision and architecture documents to go straight to SD creation. Brainstorms that skip planning documents produce SDs with incomplete thinking — the exact problem the Universal Planning Completeness Framework addresses.

**ALWAYS proceed to Step 9.5** (Vision & Architecture Document Pipeline) after saving the brainstorm document. This is not conditional — every brainstorm that reaches "Ready for SD" classification gets a vision document and architecture plan.

**Why this is mandatory**:
- Vision documents capture the *what* and *why* — without them, SDs drift from original intent
- Architecture plans capture the *how* — without them, implementation decisions are made ad-hoc during EXEC
- EVA/HEAL scoring requires registered vision documents to validate SD alignment
- The brainstorm already contains all the raw material — synthesis into formal documents is low-cost, high-value

**Exception**: Only "Consideration Only" and "Significant Departure" classifications may skip vision/arch creation, since those outcomes indicate the idea is not ready for implementation.

No AskUserQuestion needed — proceed directly to Step 9.5 after Step 9.

---

## Step 9: Generate and Save to Database

### DB-Only Storage (MANDATORY)

**Do NOT write a markdown file to the filesystem.** Brainstorm content is stored in the `brainstorm_sessions.content` column.

Build the brainstorm document **in-memory** using the template below. You will pass this content to the database insert at the end of this step.

### Document Template

Build the following markdown content in-memory (do NOT use the Write tool):

```markdown
# Brainstorm: [Topic Title]

## Metadata
- **Date**: YYYY-MM-DD
- **Domain**: [Venture / Protocol / Integration / Architecture]
- **Phase**: [domain-specific phase]
- **Mode**: [Conversational / Structured]
- **Crystallization Score**: [score/1.0] (structured mode only)
- **Outcome Classification**: [bucket from Step 8]
- **Team Analysis**: [Board of Directors (6/6 seats) / Board of Directors (N/6 seats) / Legacy (3/3 personas) / Skipped (--no-team)]
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

## Board of Directors Deliberation
(Included when board governance is active — default. Omitted with --no-team.)

### Round 1: Board Positions

| Seat | Standing Question | Position Summary |
|------|------------------|-----------------|
| CSO | Does this move EHG forward or sideways? | [position summary] |
| CRO | What's the blast radius if this fails? | [position summary] |
| CTO | What do we already have? What's the real build cost? | [position summary] |
| CISO | What attack surface does this create? | [position summary] |
| COO | Can we actually deliver this given current load? | [position summary] |
| CFO | What does this cost and what's the return? | [position summary] |

### Specialist Testimony
(Included when board flagged expertise gaps — omitted if no gaps detected)
- **[Specialist Agent Code]**: [testimony summary]

### Round 2: Key Rebuttals
- [Notable rebuttals where seats changed or refined their positions]

### Judiciary Verdict
- **Board Consensus**: [points where 3+ seats agree]
- **Key Tensions**: [where seats disagree, with constitutional citations]
- **Constitutional Citations**: [relevant rules referenced with relevance scores]
- **Recommendation**: [judiciary recommendation]
- **Escalation**: [Yes/No — whether chairman override was needed]

### Institutional Memory
- [Relevant past positions loaded, with lifecycle annotations: Active/Mitigated/Superseded/Validated]

---

<details>
<summary>Legacy Team Perspectives (when --no-board flag used)</summary>

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

</details>

## Board-Recommended Improvement Areas
(Included when Step 7.9 was executed. Omitted if chairman selected "None — override".)

| Priority | Area | Board Support | Rationale |
|----------|------|---------------|-----------|
| 1 | [area label] | N/6 seats (CSO, CTO, ...) | [composite rationale] |
| 2 | [area label] | N/6 seats (CRO, COO, ...) | [composite rationale] |
| 3 | [area label] | N/6 seats (CFO, CISO, ...) | [composite rationale] |

**Chairman Selection**: [All three / Items 1,2 / Item 1 only / Override — none selected]

## Out of Scope
(Captured in Step 6C for structured mode OR Step 7E for conversational mode. Render from `metadata.not_doing` if present, else empty list.)
- [Item 1 from not_doing array]
- [Item 2 from not_doing array]
- [Item 3 from not_doing array]

## Open Questions
- [Unresolved questions that emerged during brainstorming]

## Suggested Next Steps
- [Actionable next steps based on the brainstorm and outcome classification]
```

### After Building Content

The in-memory markdown content will be stored in the database in the session recording step below. Do NOT write it to the filesystem.

---

## Step 9.5: Vision & Architecture Document Pipeline (MANDATORY)

**ALWAYS execute this step** for brainstorms classified as "Ready for SD", "Needs Triage", or "Potential Conflict". Only skip for "Consideration Only" or "Significant Departure" outcomes.

This step creates formal planning documents and registers them in EVA's tracking system (eva_vision_documents, eva_architecture_plans) so they are scored by HEAL and referenced by downstream SDs.

### 9.5A: Auto-Generate Vision Document

**AUTOMATED**: Synthesize a vision document from brainstorm content. Generate the content in-memory — do NOT write to the filesystem. The content will be passed directly to EVA registration via `--content` flag.

Use the brainstorm discovery answers, team perspectives (Challenger, Visionary, Pragmatist), and evaluation results to generate **all** of the following sections. Every section is **required** — EVA registration will fail if any are missing.

**Required sections** (use these exact markdown headings):
```markdown
# Vision: <Topic Title>

## Executive Summary
[2-3 paragraph synthesis of the brainstorm's core thesis]

## Problem Statement
[What problem this addresses, who is affected, current impact]

## Personas
[For each persona: name, goals, mindset, key activities — derived from brainstorm user/stakeholder discussion]

## Information Architecture
[Views, routes, data sources, navigation structure — derived from Pragmatist feasibility analysis]

## Key Decision Points
[Critical decision/intervention points identified during brainstorm — from Challenger analysis]

## Integration Patterns
[How this connects to existing systems — derived from brainstorm integration discussion]

## Evolution Plan
[Phasing strategy: what ships first, what comes later — from Visionary growth analysis]

## Out of Scope
[Explicit boundaries — what this is NOT, derived from scope discussion]

## UI/UX Wireframes
[ASCII mockups for key views if UI-related, or "N/A — no UI component" for backend work]

## Success Criteria
[Measurable outcomes — derived from brainstorm evaluation criteria and team consensus]

## Chairman Review Flags
[Include ONLY if Step 8.7 produced flagged items. List each flagged category with the specific concern and recommended mitigation. Omit this section entirely if all items were accepted as-is.]
```

**After generating the content in-memory**, verify it has all 10 required sections before proceeding to 9.5B. Do NOT write this content to the filesystem — it will be passed directly to the registration command.

### 9.5B: Register Vision in EVA (with Key Capture)

Run the vision command with dimensions derived from the vision doc's success criteria and key sections:

```bash
node scripts/eva/vision-command.mjs upsert \
  --vision-key VISION-<TOPIC-KEY>-L2-001 \
  --level L2 \
  --content '<VISION_CONTENT_FROM_STEP_9.5A>' \
  --brainstorm-id <SESSION_ID> \
  --dimensions '<JSON_ARRAY>'
```

**IMPORTANT**: Use `--content` to pass the in-memory vision content directly. Do NOT use `--source` with a file path — that would create a markdown file, violating the DB-only policy.

**Dimension derivation** (no LLM needed):
- Extract 6-10 dimensions from the vision doc's success criteria and key sections
- Each dimension: `{name, weight, description, source_section}`
- Weights should sum to ~1.0 — verify before passing (warn if outside 0.9-1.1)
- Use `timeout: 30000` for the command

**Key format**: `VISION-<CONTEXT>-L2-NNN` where CONTEXT = venture_id when available, topic key otherwise

**CRITICAL — Key Capture and Error Handling:**
1. Parse the command output for the returned vision key (look for `VISION-` pattern in stdout)
2. **Store the vision_key** — you will need it for Step 9.5D and Step 11
3. **If the command fails** (non-zero exit code or error in output):
   - Report the specific error to the user (e.g., "Missing required section: Problem Statement")
   - **HALT** — do NOT proceed to Step 9.5C
   - Suggest fixing the in-memory vision content and retrying Step 9.5B
4. **If the command succeeds**, confirm: `✅ Vision registered: VISION-<KEY> (L2, N dimensions)`

5. **MANDATORY — Database Quality Validation Check:**
   After registration, query the database to verify the quality trigger passed:
   ```bash
   node -e "
   require('dotenv').config();
   const { createClient } = require('@supabase/supabase-js');
   const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
   supabase.from('eva_vision_documents')
     .select('vision_key, quality_checked, quality_issues, quality_checked_at')
     .eq('vision_key', '<VISION_KEY>')
     .single()
     .then(({data, error}) => {
       if (error) console.error('Error:', error.message);
       else {
         console.log('QUALITY_CHECKED=' + data.quality_checked);
         console.log('QUALITY_ISSUES=' + JSON.stringify(data.quality_issues));
       }
     });
   "
   ```
   - **If `QUALITY_CHECKED=true`**: Proceed to Step 9.5C
   - **If `QUALITY_CHECKED=false`**: The database trigger found quality issues.
     1. Read the `QUALITY_ISSUES` array for specific failures (e.g., content too short, missing sections)
     2. **Enrich the vision content** to address each issue (e.g., expand sections to meet minimum length)
     3. **Re-upsert** the vision document with the enriched content
     4. **Re-check** quality_checked (max 2 rewrite attempts)
     5. If still failing after 2 rewrites: report issues to user and continue (non-blocking warning)

### 9.5C: Auto-Generate Architecture Plan

**AUTOMATED**: Synthesize an architecture plan from brainstorm content. Generate the content in-memory — do NOT write to the filesystem. The content will be passed directly to EVA registration via `--content` flag.

Use the Pragmatist's feasibility analysis, the Challenger's risk assessment, and the brainstorm's technical discussion to generate **all** of the following sections. Every section is **required**.

**Required sections** (use these exact markdown headings):
```markdown
# Architecture Plan: <Topic Title>

## Stack & Repository Decisions
[Technology choices, repo structure — from Pragmatist analysis]

## Legacy Deprecation Plan
[What existing systems this replaces/modifies, migration path — or "N/A — greenfield"]

## Route & Component Structure
[Routes, components, module organization — from Information Architecture discussion]

## Data Layer
[Supabase tables, queries, mutations, RLS requirements — from data discussion]

## API Surface
[RPC functions, REST endpoints, governance endpoints — from integration discussion]

## Implementation Phases
[Phase 1/2/3 with time estimates and deliverables — from Pragmatist phasing]

## Testing Strategy
[Unit, integration, E2E test approach — from quality discussion]

## Risk Mitigation
[Technical risks with specific mitigation strategies — from Challenger risk analysis]
```

**No-Deferral Enforcement (BLOCKING)**:

Before saving the architecture plan, scan ALL sections for deferral language. The following phrases (and variations) are PROHIBITED:

- "deferred to future work"
- "to be determined later"
- "TBD", "TBC" (when used as a placeholder for missing decisions)
- "will be addressed in a future phase" (without specifying WHICH phase)
- "out of scope for now" (without a specific phase reference)
- "details to follow"

**If deferral language is detected**: Rewrite the offending section to either:
1. Make a concrete decision now (preferred), OR
2. Assign to a specific numbered phase with explicit deliverables (e.g., "Phase 2 deliverable: implement caching layer with Redis — estimated 3 days")

**Allowed phasing language** (these are NOT deferrals):
- "Phase 2: [specific deliverable with timeline]"
- "Deferred to Phase N with [explicit scope and acceptance criteria]"
- "Not included in MVP; Phase 2 adds [specific feature]"

**Conversation Context Referencing (MANDATORY)**:

Architecture plans MUST reference specific details from the brainstorm conversation, not just the summary document. For each major architectural decision:
- Cite the specific brainstorm discussion point that informed it (e.g., "Per the Challenger's concern about vendor lock-in, we use...")
- Reference team perspective insights by name (Challenger, Visionary, Pragmatist)
- Include specific data points or examples discussed during the brainstorm, not generic statements

**If Chairman Review flags exist** (from Step 8.7): Include a `## Chairman Review Flags` section listing each flagged item and how the architecture addresses or mitigates the concern.

**After generating the content in-memory**, verify it has all 8 required sections (plus Chairman Review Flags if applicable) before proceeding to the quality gate. Do NOT write this content to the filesystem.

### 9.5C-GATE: Architecture Plan Quality Gate (BLOCKING)

**MANDATORY** — Score the architecture plan before registration. Plans below threshold are rewritten automatically.

**Scoring Dimensions** (each scored 0-100, weighted):

| Dimension | Weight | What to Check |
|-----------|--------|---------------|
| Section Completeness | 0.25 | All 8 required sections present with substantive content (>3 sentences each). Empty or stub sections score 0. |
| Technical Depth | 0.20 | Specific technology names, table schemas, endpoint signatures, config details — not vague descriptions. |
| Deferral-Free Language | 0.20 | No prohibited deferral phrases (from 9.5C enforcement list). Each instance deducts 20 points. |
| Phasing Specificity | 0.15 | Implementation phases have time estimates, deliverables, and dependencies — not just labels. |
| Chairman Flag Coverage | 0.20 | If chairman flags exist (Step 8.7): each flag addressed with mitigation. If no flags: score 100 for this dimension. |

**Scoring Procedure:**

1. Review the in-memory architecture plan content
2. For each dimension, assign a score 0-100 based on the criteria above
3. Compute weighted total: `total = (completeness * 0.25) + (depth * 0.20) + (deferral * 0.20) + (phasing * 0.15) + (chairman * 0.20)`
4. Record the scores in the brainstorm session context for metadata capture at Step 11

**Threshold: 70% minimum**

- **If total >= 70**: `✅ Architecture plan quality: <score>/100 — proceeding to registration`
- **If total < 70**:
  1. Report: `⚠️ Architecture plan quality: <score>/100 — below 70% threshold`
  2. List the lowest-scoring dimensions with specific deficiencies
  3. **Rewrite** the deficient sections in the architecture plan file (do NOT ask — auto-fix)
  4. **Re-score** after rewrite (max 2 rewrite attempts)
  5. If still below 70% after 2 rewrites: `❌ Architecture plan failed quality gate after 2 rewrites. HALT — report to user for manual review.`

**No user interaction** — this gate runs automatically. Only halt on persistent failure.

### 9.5D: Register Architecture Plan in EVA (with Key Capture)

```bash
node scripts/eva/archplan-command.mjs upsert \
  --plan-key ARCH-<TOPIC-KEY>-001 \
  --vision-key VISION-<TOPIC-KEY>-L2-001 \
  --content '<ARCHITECTURE_CONTENT_FROM_STEP_9.5C>' \
  --dimensions '<JSON_ARRAY>'
```

**IMPORTANT**: Use `--content` to pass the in-memory architecture content directly. Do NOT use `--source` with a file path — that would require creating a markdown file, violating the DB-only policy. The `--sections` flag is also available as an alternative for structured JSON input.

Architecture dimensions focus on structural/implementation aspects (6-8 dimensions).
Weights should sum to ~1.0 — verify before passing (warn if outside 0.9-1.1).

**Key format**: `ARCH-<CONTEXT>-NNN` where CONTEXT = venture_id when available, topic key otherwise

**CRITICAL — Key Capture and Error Handling:**
1. Parse the command output for the returned plan key (look for `ARCH-` pattern in stdout)
2. **Store the plan_key** — you will need it for Step 9.5E and Step 11
3. **Use the vision_key from Step 9.5B** for the `--vision-key` flag (do NOT re-derive it)
4. **If the command fails** (non-zero exit code or error in output):
   - Report the specific error to the user
   - **HALT** — do NOT proceed to Step 9.5E
   - Suggest fixing the architecture document and retrying
5. **If the command succeeds**, confirm: `✅ Arch plan registered: ARCH-<KEY> (linked to VISION-<KEY>)`

6. **MANDATORY — Database Quality Validation Check:**
   After registration, query the database to verify the quality trigger passed:
   ```bash
   node -e "
   require('dotenv').config();
   const { createClient } = require('@supabase/supabase-js');
   const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
   supabase.from('eva_architecture_plans')
     .select('plan_key, quality_checked, quality_issues, quality_checked_at')
     .eq('plan_key', '<PLAN_KEY>')
     .single()
     .then(({data, error}) => {
       if (error) console.error('Error:', error.message);
       else {
         console.log('QUALITY_CHECKED=' + data.quality_checked);
         console.log('QUALITY_ISSUES=' + JSON.stringify(data.quality_issues));
       }
     });
   "
   ```
   - **If `QUALITY_CHECKED=true`**: Proceed to Step 9.5E
   - **If `QUALITY_CHECKED=false`**: The database trigger found quality issues.
     1. Read the `QUALITY_ISSUES` array for specific failures
     2. **Enrich the architecture content** to address each issue
     3. **Re-upsert** the architecture plan with enriched content
     4. **Re-check** quality_checked (max 2 rewrite attempts)
     5. If still failing after 2 rewrites: report issues to user and continue (non-blocking warning)

### 9.5E: Validation Checkpoint (BLOCKING)

**MANDATORY GATE** — Do NOT proceed to Step 10 until this passes.

Verify both registrations succeeded:

1. **Check vision_key**: Must be non-null and captured from Step 9.5B
   - If null: `❌ Vision registration missing. Re-run Step 9.5B before continuing.`
   - **BLOCK** — do not proceed

2. **Check plan_key**: Must be non-null and captured from Step 9.5D
   - If null: `❌ Architecture plan registration missing. Re-run Step 9.5D before continuing.`
   - **BLOCK** — do not proceed

3. **If both keys exist**, report success:
```
✅ Vision & Architecture Pipeline Complete
   Vision:    VISION-<KEY> (L2, N dimensions) — tracked by HEAL
   Arch Plan: ARCH-<KEY> (linked to VISION-<KEY>) — tracked by HEAL
   Quality:   <SCORE>/100 (from 9.5C-GATE)
   Brainstorm: <SESSION_ID>

   These keys will be passed to /eva review and /leo create in Step 11.
```

4. **Store both keys for Step 11**: The vision_key and plan_key must be available when Step 11 executes. If the brainstorm session was recorded in Step 10, also store them in the session's metadata:
```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('brainstorm_sessions')
  .update({ metadata: { vision_key: '<VISION_KEY>', plan_key: '<PLAN_KEY>', arch_quality_score: <SCORE> } })
  .eq('id', '<SESSION_ID>')
  .then(({error}) => {
    if (error) console.error('Failed to store keys:', error.message);
    else console.log('Keys stored in brainstorm session metadata');
  });
"
```

---

## Step 9.6: Outcome Auto-Upgrade (SD-LEO-INFRA-BRAINSTORM-SD-PIPELINE-001)

**After Step 9.5E validates both vision_key and plan_key exist**, check if the outcome_type should be upgraded:

- If `outcome_type` is **"Needs Triage"** AND both vision_key and plan_key are captured:
  - Auto-upgrade `outcome_type` to **`sd_created`**
  - Set `outcome_auto_classified` to `true` in the brainstorm session record
  - Log: `"Step 9.6: Auto-upgraded outcome from 'needs_triage' to 'sd_created' — vision+arch artifacts exist"`
  - **Rationale**: If the brainstorm produced complete vision and architecture documents, the outcome is substantive enough for SD creation regardless of the LLM classification.

- If `outcome_type` is **"Potential Conflict"**: Do NOT auto-upgrade. Conflicts require human review even when artifacts exist.

- All other outcome types: No change needed.

---

## Step 10: Session Retrospective

Record the session with the in-memory brainstorm content stored in the `content` column:

**IMPORTANT**: Pass the brainstorm markdown content (built in-memory above) as the `content` field value.
Do NOT set `document_path` — that field is deprecated. All brainstorm content goes in the `content` column.

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
  session_quality_score: <0.0-1.0>,
  crystallization_score: <0.0-1.0 or null>,
  retrospective_status: 'pending',
  content: \`<BRAINSTORM_MARKDOWN_CONTENT>\`,
  metadata: {
    questions_asked: <count>,
    questions_skipped: <count>,
    evaluation_performed: <true|false>,
    team_used: <true|false>,
    team_perspectives: <{challenger: {...}, visionary: {...}, pragmatist: {...}, synthesis: {...}} or null>,
    team_agents_responded: <0|1|2|3>,
    related_ventures: [<venture_names>],
    not_doing: <ARRAY_OF_STRINGS_FROM_STEP_6C_OR_7E>  // A1: Not-Doing contract — empty array if chairman picked "Nothing — keep open"
  }
}).select().single().then(({data, error}) => {
  if (error) console.error('Session record error:', error.message);
  else console.log('SESSION_ID=' + data.id);
});
"
```

**Note**: The `<BRAINSTORM_MARKDOWN_CONTENT>` placeholder must be replaced with the actual in-memory markdown content from the template above. Use backtick template literal for multi-line content. Escape any backticks in the content with `\\\``.

**NEVER write brainstorm content to `brainstorm/*.md` files.** The PreToolUse hook will block it, and it violates the DB-only policy.

<!-- DB SCHEMA REFERENCE (brainstorm_sessions) - verify against live DB before editing:
  session_quality_score: numeric(4,3), CHECK 0.0-1.0
  crystallization_score: numeric(4,3), CHECK 0.0-1.0
  stage: CHECK ('ideation','validation','mvp','growth','scale',
                'discovery','design','implement',
                'intake','process','output',
                'explore','decide','execute')
  outcome_type: CHECK ('sd_created','quick_fix','no_action',
                       'consideration_only','needs_triage',
                       'conflict','significant_departure')
  domain: CHECK ('venture','protocol','integration','architecture')
  mode: CHECK ('conversational','structured')
-->

**Session quality score** (0.0-1.0): Rate based on:
- Did the user engage with all required questions? (+0.20 per question answered)
- Was the evaluation framework used? (+0.20)
- Was an outcome classification reached? (+0.20)
- Did it lead to a clear next step? (+0.20)
- Topic depth (substantive vs surface-level answers) (+0.20)

Cap at 1.0. This score feeds into the self-improvement loop.

---

## Step 11: Command Ecosystem Integration

After the session is recorded in the database, suggest next steps based on the outcome classification:

### 11.0: Distill Pipeline Auto-Chain (SD-DISTILLTOBRAINSTORM-ORCH-001-A)

**When brainstorm was invoked from `/distill`** (pre-seeded context contains `source: 'distill'` or `source: distill`):

Skip the AskUserQuestion in Step 11 entirely. Instead, auto-chain directly:

1. **Auto-select "Create SDs"** — no user prompt needed (chairman already expressed intent during distill review)
2. **Skip `/eva review`** — distill-sourced brainstorms don't need a separate review cycle
3. **Invoke `/leo create`** directly with vision/arch keys:
   - Use the Skill tool to invoke `leo` with args: `create --vision-key <VISION_KEY> --arch-key <PLAN_KEY>`
4. **Capture the created SD key** from the `/leo create` output (look for `SD Created: <SD-KEY>` pattern)
5. **Return control to distill** with the SD key available for wave item linkage
6. **Output a machine-readable line**: `DISTILL_SD_CREATED=<SD-KEY>` so the calling distill skill can parse it

**If vision/arch registration failed** (keys missing from Step 9.5E): Still auto-chain but report the failure:
```
⚠️ Brainstorm complete but vision/arch registration failed.
DISTILL_SD_CREATED=NONE
```

**For all other invocation sources** (interactive brainstorm, not from distill): use the standard AskUserQuestion flow below.

---

**If outcome is "Ready for SD" AND vision/arch were registered in Step 9.5:**
```
question: "Vision and architecture plan are registered in EVA. Ready to create SDs?"
header: "Next Steps"
options:
  - label: "Create SDs (Recommended)"
    description: "Run /eva review then /leo create with VISION-<KEY> and ARCH-<KEY> auto-populated"
  - label: "Review documents first"
    description: "Run /eva review for 3-agent review of vision and architecture docs"
  - label: "Triangulate first"
    description: "Get external AI opinions on open questions via /triangulation-protocol"
  - label: "Done for now"
    description: "Documents are registered — SDs can be created in a future session"
```

**Auto-chaining when "Create SDs" or "Review documents first" is selected (vision/arch keys available):**

1. **Invoke /eva review** with the registered keys:
   - Use the Skill tool to invoke `review-vision` with args: `--vision-key <VISION_KEY> --plan-key <PLAN_KEY>`
   - The vision_key and plan_key come from Step 9.5E (stored during that step)
   - Do NOT ask the user to type the keys — they are auto-populated

2. **After review completes, invoke /leo create** with the keys:
   - Use the Skill tool to invoke `leo` with args: `create --vision-key <VISION_KEY> --arch-key <PLAN_KEY>`
   - The keys are passed as CLI flags so the created SD has vision/arch traceability in its metadata
   - Do NOT ask the user for the keys — they are auto-populated from Step 9.5

**If outcome is "Ready for SD" AND no vision/arch registered:**
This path should NOT occur under normal operation — Step 9.5 is mandatory for "Ready for SD" outcomes.
If it does occur (e.g., EVA registration failed), prompt the user to fix the registration issue before creating SDs.
Do NOT offer a "Create SD without vision/arch" option — that is an anti-pattern.

**If outcome is "Needs Triage" or "Potential Conflict" WITH vision/arch keys registered (Step 9.5E completed):**

Step 9.6 may have auto-upgraded "Needs Triage" to "Ready for SD" — but if the outcome remains
"Needs Triage" (e.g., Step 9.6 was skipped) or is "Potential Conflict" (never auto-upgraded),
AND vision_key + plan_key exist from Step 9.5E, offer SD creation alongside triage options:

```
question: "This outcome has vision and architecture documents registered. What would you like to do?"
header: "Next Steps"
options:
  - label: "Create SDs (Recommended)"
    description: "Vision+arch artifacts exist — create Strategic Directives from this brainstorm"
  - label: "Triangulate"
    description: "Get external AI opinions on the unresolved questions"
  - label: "Brainstorm again"
    description: "Run another brainstorm with more specific scope"
  - label: "Capture pattern"
    description: "Record insights as learnings via /learn"
  - label: "Done for now"
    description: "End brainstorming session"
```

When "Create SDs (Recommended)" is selected, follow the same auto-chaining as "Ready for SD":
invoke /eva review with the registered keys, then invoke /leo create with vision/arch traceability.

**If outcome is "Needs Triage" or "Potential Conflict" WITHOUT vision/arch keys:**
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
