<!-- Archived from: C:/Users/rickf/.claude/plans/brainstorm-expansion-plan.md -->
<!-- SD Key: SD-LEO-FIX-EXPAND-BRAINSTORM-COMMAND-001 -->
<!-- Archived at: 2026-02-09T14:31:27.745Z -->

# Plan: Expand Brainstorm Command - Universal Thinking Tool

## SD Type: enhancement
## Priority: high
## Source: LEO

## Problem Statement

The /brainstorm command is currently venture-only, with stages (Ideation → Scale), question banks, and evaluation frameworks all oriented around product/market evaluation. This makes it unusable for LEO protocol improvements, integration pipeline work, architecture decisions, and other non-venture brainstorming contexts. As the portfolio grows with more ventures, the tool also needs multi-venture awareness and capabilities graph integration.

## Requirements

### 1. Domain Routing (Core Expansion)

Add a domain selector at the start of each brainstorm session that routes to domain-specific question banks and evaluation frameworks:

| Domain | Stages / Phases | Evaluation Lens | Example Topics |
|--------|----------------|-----------------|----------------|
| **Venture** (existing) | Ideation → Scale | Four-Plane Matrix | "AI customer support chatbot" |
| **Protocol** | Discovery → Design → Implement | Friction/Value/Risk analysis | "Improve handoff gate scoring" |
| **Integration** | Intake → Process → Output | Data quality/Coverage/Edge cases | "Todoist pipeline optimization" |
| **Architecture** | Explore → Decide → Execute | Tradeoff matrix (complexity, maintainability, perf) | "Should we use WebSockets or SSE?" |

Each domain needs 5-8 questions in its question bank, similar to the existing venture stage questions.

### 2. Multi-Venture Awareness

As more ventures are added to the application, brainstorming should:
- Query the venture registry from the database to know what ventures exist
- Map brainstorm ideas to relevant ventures (could affect one or multiple)
- Flag cross-venture implications when an idea spans multiple ventures
- Use venture context to improve classification and question selection

### 3. Capabilities Graph Integration

EHG plans to have a capabilities log where some capabilities are shared across multiple ventures. The brainstorm tool should:
- Be aware of existing shared capabilities during evaluation
- Identify when a brainstorm idea could become a shared capability
- Surface existing capabilities that relate to the idea being brainstormed
- This is a dimension in the Four-Plane evaluation (Plane 1: Capability Graph Impact)

### 4. Self-Improving Retrospective Loop

After each brainstorm session completes, automatically run a retrospective:

**Self-Assessment:**
- Evaluate which questions surfaced useful insights vs. which were skipped/irrelevant
- Assess if the domain/stage selection was correct for the topic
- Track user corrections and re-answers as signals of poor question fit
- Measure crystallization of the outcome (did it lead to an SD?)

**Learning Record (brainstorm_sessions table):**
- Domain selected, topic, timestamp
- Questions asked and which ones produced substantive answers
- User satisfaction signal (did they skip questions? how many corrections?)
- Whether the brainstorm led to an SD, quick-fix, or no action
- Question effectiveness scores (evolve over time)

**Feed Forward:**
- Prioritize questions that historically produce better outcomes
- Deprioritize or retire questions that consistently get skipped
- Auto-suggest domain based on topic keywords
- Surface relevant past brainstorms ("You explored something similar on YYYY-MM-DD...")

### 5. Edge Case Handling (from user discussion)

- Items that don't fit neatly into categories → separate "needs-triage" bucket
- Items that are just "for consideration" not implementation → tag as consideration-only
- Items that conflict with existing features → flag as potential conflict
- Items that represent significant departures from what's built → separate bucket for deeper analysis before acting

## Database Changes

- New `brainstorm_sessions` table for tracking and self-improvement
- May need to query `ventures` table for multi-venture awareness
- May need to query planned `capabilities` table/view

## Files to Modify

- `.claude/commands/brainstorm.md` - Main brainstorm skill definition
- New: `lib/integrations/brainstorm-retrospective.js` - Retrospective logic
- New: `database/migrations/YYYYMMDD_brainstorm_sessions.sql` - Session tracking table

## Scope Notes

- The existing Venture domain and Four-Plane Matrix should remain unchanged
- New domains are additive, not replacing existing functionality
- The retrospective loop should be lightweight - not a heavy process
- Capabilities graph integration may be partial if the capabilities table doesn't exist yet
