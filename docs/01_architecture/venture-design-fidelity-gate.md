---
category: architecture
status: approved
version: 1.0.0
author: EXEC (SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001)
last_updated: 2026-07-06
tags: [design-fidelity, venture-build, observe-only-gate, gate_witness_events]
---

# Venture Design-Fidelity Gate: Routing + Observe-Only Activation

## Overview

Two Strategic Directives together implement an **observe-only-first** design-quality
gate for customer-facing venture landings:

1. **SD-LEO-INFRA-ACTIVATE-DESIGN-FIDELITY-001** — built the harness: a would-reject
   recorder (`observeDesignFidelityWouldReject`) writing to the existing
   `gate_witness_events` table, fenced on `isCustomerFacingLanding()`, gated by
   `DESIGN_FIDELITY_GATE_MODE` (`observe` | `bind`; only `bind` ever blocks).
2. **SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001** (this doc) — routes real per-venture
   design data (locked tokens, motion grammar, design references) into the UI-leaf
   grandchild SD's build description, derives a mechanical audit-instruction
   checklist from the shared design-audit rubric, and gives the harness's second
   scorer (`dispatchDesignPromptRubricScorer`) its first live, self-recording
   dispatch.

Neither SD introduces a second gate mechanism or a second witness table — every
would-reject observation, from either scorer, funnels through the same
`observeDesignFidelityWouldReject` → `recordWitnessEvent` → `gate_witness_events`
write path (verified: exactly one `recordWitnessEvent(...)` call site in
`lib/eva/bridge/`).

## Data flow

```
venture decomposition (lib/eva/lifecycle-sd-bridge.js: createGrandchildren)
  │
  ├─ resolveLockedDesignTokens(ventureId, supabase)      → { source: gvos|legacy|none, tokens }
  │     venture_gvos_profile.locked_prompt_snapshot  (preferred)
  │     blueprint_token_manifest via stage-17/token-manifest.js  (legacy fallback)
  │
  ├─ resolveMotionGrammar(ventureId, supabase)           → micro_animations | null
  │     venture_artifacts.wireframe_screens.screens[].micro_animations
  │
  ├─ buildDesignInstructionBlock(sharedDesignPrompts)    → checklist text | null
  │     shared-design-prompts.json Prompts 2/3/4 only, verbatim-wrapped
  │     (ONLY built when hasLockedSource — no checklist with nothing to check against)
  │
  └─ computeLeafContent({ layer:'ui', ventureContext: {designTokens, motionGrammar,
        designInstructionBlock}, childPayload })
        → buildDesignInputBlock(...) composes whatever is present
        → byte-identical to the legacy template when nothing is present (zero regression)

EXEC-TO-PLAN gate (scripts/modules/implementation-fidelity/sections/design-fidelity.js)
  fenced on isCustomerFacingLanding(sd, scope, title)
  │
  ├─ dispatchDesignFidelityScorer   (SD-LEO-INFRA-ACTIVATE-DESIGN-FIDELITY-001)
  │     scores stitchData/repoAnalysis (both deprecated → null in practice)
  │
  └─ dispatchDesignPromptRubricScorer   (SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001)
        renderedHtml  <- venture_artifacts.stage_17_approved_desktop.artifact_data.html
                          (the closest real, per-venture "rendered output" evidence that
                          exists anywhere in this codebase — no post-build page-render
                          mechanism exists; see Design Notes below)
        instructionBlock <- buildDesignInstructionBlock(sharedDesignPrompts)
        self-records its own would-reject (no companion recorder exists for this scorer,
        unlike the sibling whose recording is owned by observeVentureCompletionDesignPass)
  │
  └─ observeVentureCompletionDesignPass  (fenced on isCustomerFacingLanding, hasDesignPass)
```

## Key files

| File | Role |
|------|------|
| `lib/eva/bridge/design-token-resolver.js` | `resolveLockedDesignTokens`, `resolveMotionGrammar` — venture-wide, resolve-once |
| `lib/eva/bridge/design-input-instructions.js` | `buildDesignInstructionBlock`, `loadSharedDesignPrompts` (single vendored JSON-read) |
| `lib/eva/bridge/leaf-content.js` | `computeLeafContent`, `buildDesignInputBlock` — the UI-leaf build-description seam |
| `lib/eva/lifecycle-sd-bridge.js` | `createGrandchildren` — resolves tokens/motion once per child, routes into the `ui` layer only |
| `lib/eva/bridge/customer-facing-design-detector.js` | `isCustomerFacingLanding`, `hasDesignPass`, `resolveDesignFidelityGateMode` |
| `lib/eva/bridge/design-fidelity-observe.js` | `observeDesignFidelityWouldReject` (single writer), `dispatchDesignFidelityScorer`, `dispatchDesignPromptRubricScorer`, `observeVentureCompletionDesignPass` |
| `scripts/modules/implementation-fidelity/sections/design-fidelity.js` | The real EXEC-TO-PLAN wiring — both scorers dispatched here |

## Design notes / known gaps

- **No rendered-HTML source exists for a genuinely post-build page.** The evidence
  used for `dispatchDesignPromptRubricScorer`'s `renderedHtml` is the Stage-17
  *approved design mockup* (`stage_17_approved_desktop`), not literal built/coded
  page output — confirmed via search that no such mechanism exists anywhere in this
  codebase (`genesis_deployments` is Genesis-simulation-scoped, unrelated to the
  venture-build grandchild pipeline). A future SD could build a genuine
  post-build-render capture if that gap needs closing.
- **`motionGrammar` and `designReference` are independent of `hasLockedSource`.**
  A token-less venture (`source==='none'`) that HAS `wireframe_screens.micro_animations`
  or a `childPayload.design_reference` still receives an additive block — the
  byte-identical guarantee applies only when the venture has *no design inputs at
  all*, not merely no locked token source. This is intentional (FR-1's purpose is
  routing whatever design signal exists), not a regression.
- **Bind mode.** Neither scorer ever blocks a real gate result while
  `DESIGN_FIDELITY_GATE_MODE !== 'bind'`. Flipping to `bind` is a separate,
  hand-verified operational decision once the observe→bind criterion (≥25 evals,
  ≥48h, zero false-rejects, named flipper) is met — out of scope for both SDs.

## Related

- Retrospective: SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001 (`retrospectives` table,
  id `fd3d6b38-2e41-4041-9b94-3cbbd4e00340`)
- PRD: `PRD-SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001` (`product_requirements_v2`)
