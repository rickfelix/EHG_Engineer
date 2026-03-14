# Stage UI Design Evaluation Process

**Created**: 2026-03-09
**Source**: Stage 3 Kill Gate redesign session
**Purpose**: Repeatable methodology for evaluating and redesigning all 25 venture workflow stage UIs

---

## Process Overview

This process was developed during the Stage 3 Kill Gate UI evaluation. It covers the full cycle from initial implementation through design refinement. The goal is to apply this same approach to each of the 25 venture workflow stages.

---

## Phase 1: Implementation & Data Verification

### 1.1 Implement the Stage Renderer
- Build the stage component per the wireframe spec (from `docs/wireframes/25-stage-view-wireframes.md`)
- Follow the `StageRendererProps` interface contract
- Use existing Shadcn UI + Tailwind components — no new dependencies

### 1.2 Verify Data Flow
- Confirm `venture_stage_work.advisory_data` is populated for the target stage
- If NULL, trigger stage execution (`node scripts/eva/run-stage.js --venture-id <id> --stage <n>`) or manually populate with deterministic test data
- Verify the data flows through: `venture_stage_work.advisory_data` → `useStageDisplayData` hook → `StageContentRouter` → Stage renderer

### 1.3 Visual Inspection
- Navigate to a venture at the target stage in the EHG app
- Confirm the renderer loads and displays data
- Note any obvious gaps between wireframe spec and actual rendering

---

## Phase 2: Design Evaluation (The Core Process)

### 2.1 Full UI Inventory
Tally every visible element on the page, organized hierarchically:

1. **Global layout** — header, sidebar, floating elements
2. **Venture detail header** — back button, venture name, status, actions
3. **Navigation elements** — JourneyBadge, tabs, breadcrumbs
4. **Hero/summary area** — BuildingHero, progress cards, decision previews
5. **Stage content** — all cards, sections, and data displays within the stage renderer
6. **Supporting elements** — artifacts, evidence, collapsibles

### 2.2 Importance Ranking
Rank every inventoried element into 4 tiers based on TWO factors:

| Factor | Question |
|--------|----------|
| **Persona** | What does the Chairman (sole governance operator) need to decide at this stage? |
| **Stage context** | What is the primary output of this specific stage? (e.g., kill/continue decision for gate stages, artifact review for work stages) |

**Tier definitions:**
- **Tier 1 — Critical**: The decision or primary output. What the chairman came here to see.
- **Tier 2 — Important**: Evidence and data that directly supports the decision.
- **Tier 3 — Supporting**: Context that helps but isn't required for the decision.
- **Tier 4 — Low value / Removable**: Elements that add clutter without aiding the decision.

### 2.3 One-at-a-Time Design Observations
Present observations sequentially via `AskUserQuestion` with wireframe previews. Key principles:

1. **One observation per question** — don't bundle multiple decisions
2. **Show wireframe previews** — ASCII mockups for each option so the chairman can visually compare
3. **Cascading decisions** — each answer informs subsequent questions (e.g., if rationale moves into the banner, don't show it again in later wireframes)
4. **Options should be concrete** — "shrink it" vs "remove it" vs "keep it", not abstract principles
5. **Start with the biggest impact** — address the most valuable changes first (hero area, primary content layout, then details)

### 2.4 Redundancy Elimination
After each decision, check: **does this create redundancy with other elements?**

Example from Stage 3:
- Moving rationale INTO the banner → remove separate rationale block below
- Health score in banner → viability score card becomes redundant → remove it
- Stage name in banner → JourneyBadge can collapse to minimal badge

### 2.5 Final Composite Wireframe
After all observations are resolved, present a single composite wireframe showing the complete redesigned page. Include a "REMOVED" section listing everything that was cut and why.

---

## Phase 3: SD Creation

### 3.1 Create the Strategic Directive
Convert the approved wireframe into an SD with:
- **Scope**: Reference the specific wireframe and list all changes
- **Type**: `enhancement` (UI enrichment/redesign)
- **Acceptance criteria**: Derived from each design decision

### 3.2 Implementation Constraints
- Single component modification where possible
- No new npm dependencies
- TypeScript strict compliance
- Graceful null/empty data handling
- Responsive layout (mobile + desktop)

---

## Design Decisions Log: Stage 3 Kill Gate

These are the specific decisions made during the Stage 3 evaluation. They serve as a reference for similar stage types (gate stages: 3, 5, 13, 16, 17, 22, 23).

| # | Element | Decision | Rationale |
|---|---------|----------|-----------|
| 1 | BuildingHero | **Remove entirely** for kill gate stages | Gate decision IS the content — hero area is clutter |
| 2 | Decision display | **Compact colored banner** with decision + score + rationale in one unit | Maximum density, no separate cards for related info |
| 3 | Metrics | **Sorted worst-first**, failing group above passing | Chairman needs to spot problems immediately |
| 4 | Advisory data | **Two-column layout**: actionable (risks + go conditions) left, contextual (market fit + evidence) right | Reduces vertical scroll ~50%, groups by purpose |
| 5 | Tabs | **Remove tab bar** for stages 1-5; show content directly | Other tabs are empty at early stages, adds click barrier |
| 6 | JourneyBadge | **Collapse to inline badge** ("Stage 3/25") next to venture name, expandable on click | Chairman already knows what stage they're on |
| 7 | Evidence Brief | **Move into right column** of advisory layout | Keeps deep-dive data accessible but not prominent |
| 8 | Viability score | **Removed** | Redundant with health score already in banner |
| 9 | Rationale block | **Merged into banner** | Eliminated a separate card; keeps verdict + reasoning together |

---

## Stage Type Templates

The 25 stages fall into a few UI pattern types. Design decisions from one stage should inform similar stages:

| Template | Stages | Primary Output | Key UI Pattern |
|----------|--------|----------------|----------------|
| **Gate Decision View** | 3, 5, 13, 16, 17, 22, 23 | PASS/REVISE/KILL decision | Decision banner + sorted metrics + advisory two-column |
| **Draft/Input View** | 1, 2 | Idea capture | Form-like, editable fields |
| **Work Stage View** | 4, 6, 7, 8, 9, 10, 11, 12 | Artifact production | Artifact display + progress indicators |
| **Advanced Work View** | 14, 15, 18, 19, 20, 21 | Complex deliverables | Multi-section artifact display |
| **Launch/Exit View** | 24, 25 | Final approval + launch | Summary dashboard + action buttons |

Stage 3 decisions (especially #1-6) should be directly applicable to all Gate Decision View stages (5, 13, 16, 17, 22, 23).

---

## Lessons Learned

1. **Data before design**: Always verify advisory_data is populated before evaluating the UI. NULL data makes the page look broken when it's actually a data pipeline issue.
2. **Persona drives priority**: The chairman persona eliminates entire sections that would matter to other roles (e.g., DecisionCard "Next Decision Stage 5" — useful for a project manager, useless for a chairman).
3. **Cascading decisions matter**: Present questions in dependency order. Moving rationale into the banner changes what the advisory section should contain.
4. **Redundancy is the #1 killer**: Health score in banner + viability score card + metric averages = same number shown 3 times. Eliminate ruthlessly.
5. **"Who cares?" is a valid design test**: If the chairman's reaction to an element is "who cares?", remove it. Don't defend it with logic — trust the user's instinct.
