---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Genesis PRD Review - AntiGravity


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, e2e, migration, schema

## Executive Summary

The **Genesis Virtual Bunker (v3.1)** represents a significant and positive architectural pivot from "hard" infrastructure isolation to "virtual" application-level isolation. This shift correctly identifies that for a solo founder, complexity is the resource killer, not raw infrastructure cost. The "Simulation-First" approach with **Regeneration Gates** (Stage 16/17) is a bold, innovative strategy that theoretically eliminates technical debt by ensuring production code is always a "clean build" from validated requirements.

However, this specific "Regeneration" mechanism is also the **single highest point of failure**. The assumption that a "Soul Extraction" (JSON requirements) can be fed back into the *same* generation pipeline to produce a production-ready app that faithfully mirrors the validated simulation is optimistic. Without byte-level determinism or a "Reflex" test that strictly compares behavior, there is a high risk of **"Lobotomized Production"**—where the deployed app lacks the subtle nuances or fixes that verified the simulation.

The PRDs are generally robust and well-structured, particularly the **MASON** infrastructure pieces. The **DREAMCATCHER** AI logic is sound but heavily dependent on the quality of the "Pattern Library" (MASON-P1). If the patterns are too atomic, the AI struggles to glue them; if too monolithic, they lack flexibility. The current plan for 20+ patterns is a good start but likely insufficient for rich application diversity.

## Critical Issues (Must Fix Before EXEC)

1.  **Regeneration Fidelity Risk** - [MIRROR-ELEV]
    *   **Description**: The plan relies on "Fresh repo" generation at Stage 17. If the "Soul Extraction" misses *any* detail (e.g., a specific CSS tweak, a UX flow nuance, a modified error message) that was crucial to the simulation's ratification, that detail will be lost in production. The current PRD accepts "Fresh repo generated" but lacks a mechanism to guarantee *behavioral parity*.
    *   **Recommendation**: Add a **"Delta Check"** requirement. Before deleting the simulation, run a diff against the generated production code (ignoring mock/prod specific configs). Or better, implement "Reflex Tests" that run against *both* sim and prod to verify identical pass rates.

2.  **Mock Firewall "Network Interception" Vagueness** - [MASON-FIREWALL]
    *   **Description**: `FR-FW-3` specifies "External fetch calls intercepted". This is insufficient implementation detail for a critical security control. Monkey-patching `fetch` is fragile (libraries might use `XMLHttpRequest` or Node `http` module).
    *   **Recommendation**: Explicitly mandate **MSW (Mock Service Worker)** or a similar robust handling layer that captures *all* outbound traffic at the process level, not just the global `fetch` object.

3.  **Ambiguous Pattern Syntax** - [MASON-P1 / MASON-P2]
    *   **Description**: MASON-P2 mentions "Slot-based composition without regex", but MASON-P1 does not define the syntax spec (e.g., `{{variable}}`? `__SLOT__`?). Without a strict spec, the "Pattern Assembler" in P2 risks becoming a spaghetti of string replacements.
    *   **Recommendation**: Define the **Pattern Syntax Specification** in MASON-P1 (`requirements.md` or similar). Prefer an AST-aware transformation or a robust templating engine (Handlebars/Mustache) over custom string manipulation.

4.  **Schema Migration Gap** - [DREAM-P2]
    *   **Description**: The PRD covers generating the *initial* schema. It does not address what happens if the user asks for a change during the simulation (Stage 4-15). Does the system generate a migration file? Does it nuke the DB and start over?
    *   **Recommendation**: Explicitly define the **"Schema Evolution Strategy"** for simulation phase. "Nuke and recreate" is acceptable for v1 but must be stated.

## High-Priority Recommendations

1.  **Implement "Behavioral Soul" Extraction**: Don't just extract static requirements. Extract the *test cases* that passed in the simulation. These tests become the "Soul" that validates the production build.
2.  **Hard Cost Circuit Breakers**: The "EVA token optimization" is good, but add a hard **$5/venture logic cap**. If a loop gets stuck, the system must abort, not optimize.
3.  **Pattern Library "Atomic vs. Molecular" Balance**: The addendum suggests "Large (preferred)". This is smart for reliability but hurts diversity. I recommend a **"Layout + Widget"** model where layouts are rigid/large, but widgets (tables, forms) are composable.
4.  **Add "Human Escape Hatch"**: If the AI generation fails 3 times, allow the user to manually edit the `idea_brief` or `seed_text` to unblock the pipeline.

## PRD-Specific Feedback

### PRD-SD-GENESIS-V31-MASON-P1 (Pattern Library)
-   **Strengths**: Database-backed patterns allow dynamic updates without code deploys. Good separation of concerns.
-   **Weaknesses**: "20+ patterns" is an arbitrary number. Quality > Quantity.
-   **Missing**: **Versioning Strategy**. If a pattern is updated, do old simulations break? (Addendum mentions `version`, but logic isn't PRD'd).
-   **Recommendations**: Add requirement for `version` pinning in `simulation_sessions`.

### PRD-SD-GENESIS-V31-MASON-FIREWALL
-   **Strengths**: `EHG_MOCK_MODE` as canonical truth is excellent.
-   **Weaknesses**: "Network interception" implementation detail is weak.
-   **Missing**: Handling of **Third-Party SDKs** (e.g., Stripe, Supabase client) which might bypass simple fetch mocks.
-   **Recommendations**: Mandate using the `setupServer` (Node) / `setupWorker` (Browser) pattern from MSW.

### PRD-SD-GENESIS-V31-DREAM-P2 (Schema/Repo Gen)
-   **Strengths**: Context crystallization (`.claude/`) is a brilliant addition for AI-assisted dev.
-   **Weaknesses**: "Review if any PRDs are missing critical information" -> **RLS Policies**. The PRD mentions them, but asserting their *content* is hard.
-   **Missing**: **Foreign Key Constraint** validation. AI often hallucinations IDs that don't exist.
-   **Recommendations**: Add a "Schema Linter" step that checks for dangling FKs or circular dependencies.

### PRD-SD-GENESIS-V31-MIRROR-ELEV (Regeneration)
-   **Strengths**: Clean separation of Sim vs Prod artifacts.
-   **Weaknesses**: As noted in Critical Issues, the **"Lobotomy Risk"** is high.
-   **Missing**: **Data Migration Plan** (if any data is preserved). Currently assumes "Clean Slate".
-   **Recommendations**: Add `FR-ELEV-4`: "Reflex Parity Check" - run the same E2E suite on Prod that passed on Sim.

### PRD-SD-GENESIS-V31-RITUAL
-   **Strengths**: Clear timeline and ceremonial aspect.
-   **Weaknesses**: Feb 14 is a hard deadline. If Feb 13 verification fails, there is no buffer.
-   **Missing**: **"Broken Ritual" Protocol**. What if it fails live? Do we fallback to a manual script?
-   **Recommendations**: Create a `manual-override.ts` script that forces the steps if the orchestrator jams.

## User Story Quality Report

| SD | Stories | Quality Score | Issues |
|----|---------|---------------|--------|
| **MASON-P1** | 3 | 9/10 | Solid. `FR-P1-1` is effectively "do the db work". |
| **MASON-P2** | 3 | 8/10 | "Slot-based composition" story is implementation-heavy, less "User" focused. |
| **MASON-FIREWALL** | 4 | 9/10 | `FR-FW-3` needs better ACs regarding "how" interception works. |
| **DREAM-P1** | 3 | 10/10 | Excellent INVEST characteristics. |
| **DREAM-P3** | 3 | 7/10 | "Multi-council critique" has external dependency risks. AC should handle partial failure. |
| **MIRROR-ELEV** | 3 | 8/10 | "Story 2: Stage 17 repo regeneration" needs AC "Diffs checked against sim". |
| **RITUAL** | 3 | 10/10 | Simple, binary outcomes. Good ceremony. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation Gap |
|------|------------|--------|----------------|
| **Regeneration Drift** (Prod != Sim) | **High** | **Critical** | The current plan assumes "Soul" captures everything. It won't. **Needs Reflex Tests.** |
| **Pattern Exhaustion** (User needs unavailable UI) | **High** | **Medium** | 20 patterns is small. Users will hit walls. **Needs "Escape Hatch" to write custom code.** |
| **AI Hallucination in Schema** | **Medium** | **High** | AI might produce invalid SQL or bad relationships. **Needs "Schema Linter".** |
| **Cost "Death Spiral"** (Critique loop) | **Low** | **Low** | EVA optimizer is planned. **Add Hard Caps.** |
| **Vercel Preview Limits** | **Low** | **Low** | 100/day is generous for a solo founder. |

## Questions for the Team

1.  **Authentication Mocking**: How does the `EHG_MOCK_MODE` handle Supabase Auth `getUser()` calls? Do we mock the Supabase client entirely or just the network? (Recommendation: Mock the network via MSW).
2.  **Pattern Syntax**: What *specifically* is the slot syntax? `{{var}}`? Is it valid TypeScript before substitution, or does it require a build step to parse?
3.  **Soul Resolution**: Does the "Soul" include the *actual text* of the prompt that generated the final simulation, or just the abstract requirements? (Saving the final prompts would be safer for regeneration).

## Confidence Score

**8.5 / 10**

The architecture is sound and much simpler than the previous version. The primary deduction is for the **Regeneration Risk**—the assumption that we can faithfully recreate a validated simulation from abstract requirements without carrying over the code itself is the biggest gamble here. If that is addressed with "Reflex Parity Tests", confidence goes to 9.5.
