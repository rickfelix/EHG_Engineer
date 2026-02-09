# /brainstorm - EHG-Aware Strategic Brainstorming

EHG-aware brainstorming with structured output. Produces a document in `brainstorm/`.

**Arguments**: `$ARGUMENTS`

---

## Step 1: Parse Arguments

Parse `$ARGUMENTS` for:
- **Topic**: Everything that isn't a flag (e.g., "AI-powered customer support chatbot")
- **`--structured`**: If present, use Structured Mode (full Phase 0 rigor). Otherwise, use Conversational Mode (default).
- **`--stage <stage>`**: One of `ideation`, `validation`, `mvp`, `growth`, `scale`. If not provided, ask the user.

If no topic is provided, ask the user: "What would you like to brainstorm?"

---

## Step 2: Determine EHG Stage

If `--stage` was not provided in arguments, ask the user using AskUserQuestion:

```
question: "What EHG lifecycle stage is this venture/idea in?"
header: "EHG Stage"
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

(The 5th option "Scale" is available via "Other" if needed: optimizing efficiency, automation, enterprise readiness)

---

## Step 3: Route to Mode

- If `--structured` flag is present → Go to **Structured Mode** (Step 4)
- Otherwise → Go to **Conversational Mode** (Step 5)

---

## Step 4: Structured Mode (`--structured`)

Full Phase 0 rigor: one-question-at-a-time, checkpoints, un-done proposals, crystallization scoring.

### 4A: Discovery Questions (One at a Time)

Ask questions ONE AT A TIME from the stage-appropriate question bank below. Wait for the user's answer before asking the next question. Ask all required questions (minimum 3), then offer optional ones.

**After each answer**, briefly acknowledge the response before asking the next question.

### 4B: STAGED_CHECKPOINT - Intent Synthesis

After all required questions are answered, synthesize an intent summary:

Present to the user:
```
**Intent Summary** (max 500 chars):
[Your synthesis of the brainstorm topic based on answers so far]

Does this capture the core intent? (yes / refine)
```

Use AskUserQuestion with options: "Yes, that captures it" and "Let me refine" (which lets them correct the summary).

### 4C: UN_DONE_PROPOSAL - Out of Scope List

Generate a list of at least 3 things that are explicitly OUT OF SCOPE for this idea. Present as:

```
**Explicitly Out of Scope:**
1. [Thing that might seem related but isn't part of this]
2. [Adjacent feature/capability we're NOT building]
3. [Scale/complexity we're NOT targeting yet]
```

Ask user to confirm or adjust the out-of-scope list.

### 4D: Crystallization Score

Evaluate the crystallization of the idea on a 0.0-1.0 scale:

| Factor | Weight | Score |
|--------|--------|-------|
| Problem clarity | 25% | 0.0-1.0 |
| User/audience defined | 20% | 0.0-1.0 |
| Success criteria exist | 20% | 0.0-1.0 |
| Scope boundaries clear | 20% | 0.0-1.0 |
| Risk/unknowns identified | 15% | 0.0-1.0 |

**Threshold: 0.7** - Below this, note that more discovery is recommended before committing to implementation.

Present the score breakdown to the user.

### 4E: Four-Plane Evaluation Matrix

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

Present the full matrix assessment, then proceed to document generation (Step 6).

---

## Step 5: Conversational Mode (Default)

Lighter brainstorming flow with 2-3 questions at a time.

### 5A: Initial Questions

Ask 2-3 stage-appropriate questions from the question bank below (pick the required ones for the selected stage). Present them together in a single message.

### 5B: Follow-Up Questions

Based on the answers, ask 1-2 follow-up questions to deepen understanding. These can be from the optional questions in the bank or generated based on the conversation.

### 5C: Arguments For and Against

Based on answers so far, present:

**Arguments For:**
- [3-4 compelling reasons to pursue this]

**Arguments Against:**
- [2-3 honest risks, challenges, or reasons to pause]

### 5D: Optional Four-Plane Evaluation

Ask the user using AskUserQuestion:

```
question: "Would you like a Four-Plane Evaluation Matrix analysis?"
header: "Evaluation"
options:
  - label: "Yes, full evaluation"
    description: "Walk through all 4 planes: Capability Impact, Vector Alignment, Constraints, Explore/Exploit"
  - label: "Skip for now"
    description: "Save evaluation for later, proceed to document"
```

If yes, run through the Four-Plane matrix from Step 4E.

Then proceed to document generation (Step 6).

---

## Step 6: Generate and Save Document

### File Naming

Generate a slug from the topic (lowercase, hyphens, no special chars, max 50 chars).

**File path**: `brainstorm/YYYY-MM-DD-<topic-slug>.md`

Example: `brainstorm/2026-02-09-ai-customer-support-chatbot.md`

### Document Template

Write the document using the Write tool with this structure:

```markdown
# Brainstorm: [Topic Title]

## Metadata
- **Date**: YYYY-MM-DD
- **EHG Stage**: [stage]
- **Mode**: [Conversational / Structured]
- **Crystallization Score**: [score/1.0] (structured mode only)

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

## Four-Plane Evaluation Matrix
(Include if evaluation was performed)

### Plane 1: Capability Graph Impact
| Dimension | Score |
|-----------|-------|
| New Capability Node | X/5 |
| Capability Reuse Potential | X/5 |
| Graph Centrality Gain | X/5 |
| Maturity Lift | X/5 |
| Extraction Clarity | X/5 |
| **Total** | **X/25** |

### Plane 2: External Vector Alignment
| Vector | Direction | Strength |
|--------|-----------|----------|
| Market Demand | Tailwind/Headwind | X/5 |
| Technology Cost | Tailwind/Headwind | X/5 |
| Regulatory | Tailwind/Headwind | X/5 |
| Competitive Density | Tailwind/Headwind | X/5 |
| Timing Window | Tailwind/Headwind | X/5 |
| **Net Score** | | **X** |

Primary tailwind: [X]
Primary headwind: [X]
Mitigation: [X]

### Plane 3: Constraints
| Area | Exposure |
|------|----------|
| Spend Risk | Low/Medium/High |
| Legal/Regulatory | Low/Medium/High |
| Brand Risk | Low/Medium/High |
| Security/Data | Low/Medium/High |
| Autonomy Risk | Low/Medium/High |

**Status**: Pass / Block / Escalate

### Plane 4: Exploration vs Exploitation
- **Dial Position**: [position]
- **Review Interval**: [X weeks]
- **Auto-Expiry**: [date, if exploratory]

## Out of Scope
(Structured mode only)
- [Item 1]
- [Item 2]
- [Item 3]

## Open Questions
- [Unresolved questions that emerged during brainstorming]

## Suggested Next Steps
- [Actionable next steps based on the brainstorm]
```

### After Saving

Confirm the file was saved:
```
Brainstorm saved to: brainstorm/YYYY-MM-DD-<topic-slug>.md
```

---

## Step 7: Command Ecosystem Integration

After the document is saved, suggest next steps based on context:

Use AskUserQuestion:

```
question: "What would you like to do next?"
header: "Next Steps"
options:
  - label: "Create an SD"
    description: "Turn this brainstorm into a Strategic Directive via /leo create"
  - label: "Triangulate"
    description: "Get external AI opinions on open questions via /triangulation-protocol"
  - label: "Capture pattern"
    description: "Record insights as learnings via /learn"
  - label: "Done for now"
    description: "End brainstorming session"
```

**Auto-invoke behavior**: When user selects a command option, immediately invoke that skill using the Skill tool.

---

## Question Bank (by EHG Stage)

### Ideation
| ID | Question | Required |
|----|----------|----------|
| problem | What specific problem are you trying to solve? | Yes |
| user | Who is the primary user affected by this problem? | Yes |
| outcome | What outcome would success look like for this feature? | Yes |
| validation | How would you validate that this solves the problem? | No |
| risk | What is the biggest risk or unknown for this work? | No |

### Validation
| ID | Question | Required |
|----|----------|----------|
| hypothesis | What hypothesis are you testing with this feature? | Yes |
| metric | What metric will prove/disprove the hypothesis? | Yes |
| mvp | What is the minimum implementation to test this? | Yes |
| pivot | What would trigger a pivot or change in direction? | No |

### MVP
| ID | Question | Required |
|----|----------|----------|
| user_value | What user value does this feature provide? | Yes |
| integration | How does this integrate with existing features? | Yes |
| success_metric | What metric defines success for this feature? | Yes |
| dependencies | What dependencies or blockers exist? | No |

### Growth
| ID | Question | Required |
|----|----------|----------|
| retention | How does this improve user retention or engagement? | Yes |
| scalability | What scalability considerations are there? | Yes |
| measurement | How will you measure impact? | Yes |
| iteration | What iteration plan exists after launch? | No |

### Scale
| ID | Question | Required |
|----|----------|----------|
| efficiency | How does this improve operational efficiency? | Yes |
| automation | What can be automated in this feature? | Yes |
| enterprise | How does this support enterprise requirements? | Yes |
| maintenance | What is the long-term maintenance burden? | No |

---

## Command Ecosystem Integration

### Cross-Reference

This command is part of the **Command Ecosystem**. For full workflow context, see:
- **[Command Ecosystem Reference](../../docs/reference/command-ecosystem.md)** - Complete inter-command flow diagram and relationships

**Note**: `/brainstorm` is typically invoked at the start of new venture/feature exploration, before SD creation.

### Related Commands
| Command | Relationship |
|---------|-------------|
| `/leo create` | Create SD from crystallized brainstorm |
| `/triangulation-protocol` | Validate open questions with external AIs |
| `/learn` | Capture patterns discovered during brainstorming |
| `/quick-fix` | If brainstorm reveals a small fix needed first |
