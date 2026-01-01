# Genesis Completion Blueprint
## Strategic Directive: SD-GENESIS-COMPLETE-001

**Status**: DRAFT - Pending LEAD Approval
**Type**: Parent SD (Multi-Phase)
**Estimated Scope**: Large (5-7 Child SDs)
**Origin**: Triangulation Research (OpenAI + Gemini + Claude Code analysis)

---

## Executive Summary

Genesis is EHG's simulation-based venture development system designed to enable "fail fast, fail cheap" testing of business ideas before committing real resources. The triangulation research revealed Genesis is **~45-50% complete** — the architecture is sound and building blocks exist, but they're not connected into a working end-to-end flow.

This SD establishes a phased approach to complete Genesis, starting with research to fill knowledge gaps, then systematic implementation of missing components.

---

## Part 1: Triangulation Findings Summary

### What Works (GREEN)
| Component | Location | Status |
|-----------|----------|--------|
| Pattern Library | `EHG_Engineer/lib/genesis/pattern-library.js` | Operational |
| Mock Mode Enforcement | `EHG_Engineer/lib/genesis/mock-mode.js` | Operational |
| Quality Gates | `EHG_Engineer/lib/genesis/quality-gates.js` | Operational |
| Watermark Middleware | `EHG_Engineer/lib/genesis/watermark-middleware.js` | Operational |
| TTL Cleanup | `EHG_Engineer/lib/genesis/ttl-cleanup.js` | Operational |
| Branch Lifecycle | `EHG_Engineer/lib/genesis/branch-lifecycle.js` | Operational |
| Ratification API | `ehg/src/pages/api/genesis/ratify.ts` | Operational |

### What's Disconnected (YELLOW)
| Component | Location | Issue |
|-----------|----------|-------|
| Soul Extractor (Stage 16) | `ehg/scripts/genesis/soul-extractor.js` | Script exists but not wired to orchestrator |
| Production Generator (Stage 17) | `ehg/scripts/genesis/production-generator.js` | Script exists but not wired to orchestrator |
| Genesis Pipeline | `ehg/scripts/genesis/genesis-pipeline.js` | CLI-only, no API/UI integration |
| Regeneration Gate | `ehg/scripts/genesis/regeneration-gate.js` | Exists but unused |

### What's Stubbed/Missing (RED)
| Component | Issue | Impact |
|-----------|-------|--------|
| PRD Generation | Returns hardcoded template (lines 190-212 in genesis-pipeline.js) | Cannot generate real PRDs from seed ideas |
| SD Generation | **NOT IMPLEMENTED** | PRDs exist without parent SDs — violates data model |
| Simulation UI | No UI exists | Must use CLI to create simulations |
| SSOT Alignment | `CompleteWorkflowOrchestrator.tsx` uses different components than `venture-workflow.ts` | Stage 16/17 show wrong UI |

---

## Part 2: Critical Gap — PRD ↔ SD Relationship

### Current Data Model
```
Strategic Directive (SD)
    └── PRD (belongs_to SD)
        └── User Stories
        └── Functional Requirements
```

### Genesis Current Behavior
```
Genesis Pipeline
    └── Creates PRD directly (no parent SD!)
```

### Required Behavior
```
Genesis Pipeline
    └── Creates SD first (simulation type)
        └── Then creates PRD attached to SD
            └── User stories generated from simulation data
```

**This is a data integrity issue** — orphan PRDs without SDs break the governance model.

---

## Part 3: Research Phase (Pre-Implementation)

Before implementing, we need answers to these open questions:

### 3.1 Architecture Questions
| # | Question | Why It Matters |
|---|----------|----------------|
| R1 | Should Genesis create "Simulation SDs" as a new SD type? | Determines database schema changes |
| R2 | How should simulation data map to PRD sections? | Defines the PRD generation algorithm |
| R3 | Should simulations auto-create SDs or require human approval? | Governance workflow design |
| R4 | What's the handoff from simulation → real venture? | Stage 16/17 integration design |

### 3.2 Integration Questions
| # | Question | Why It Matters |
|---|----------|----------------|
| R5 | Which LLM should power PRD generation (OpenAI/Claude/both)? | API integration, cost, quality |
| R6 | How does Genesis UI integrate with existing venture dashboard? | UX consistency |
| R7 | Should Stage 16 soul-extractor run automatically or on-demand? | Workflow automation level |
| R8 | How do patterns compose? Can a venture use multiple patterns? | Pattern assembler design |

### 3.3 UX Questions
| # | Question | Why It Matters |
|---|----------|----------------|
| R9 | What's the minimum UI for simulation creation? | MVP scope |
| R10 | How are simulation results visualized? | Dashboard design |
| R11 | How does a user know their simulation passed/failed gates? | Notification/feedback system |

---

## Part 4: Proposed Child SDs

### Phase A: Research & Design (1 SD)

**SD-GENESIS-RESEARCH-001**: Genesis Architecture Research
- Answer questions R1-R11
- Create detailed technical design document
- Define simulation → SD → PRD data flow
- Prototype LLM-based PRD generation
- Deliverable: Genesis Technical Design Document (TDD)

### Phase B: Data Model (1 SD)

**SD-GENESIS-DATAMODEL-001**: Genesis Data Model Alignment
- Add `simulation_id` foreign key to strategic_directives table
- Create `genesis_simulations` table if needed
- Add `sd_type = 'simulation'` support
- Ensure PRDs always have parent SDs
- Fix orphan PRD prevention

### Phase C: Core Integration (2 SDs)

**SD-GENESIS-PRD-001**: PRD Generation Integration
- Replace stubbed `generatePRD()` with real LLM call
- Map simulation seed → PRD sections
- Auto-generate user stories from simulation data
- Include SD creation in the flow

**SD-GENESIS-STAGE16-17-001**: Stage 16/17 Orchestrator Integration
- Wire `soul-extractor.js` to Stage 16 in orchestrator
- Wire `production-generator.js` to Stage 17
- Fix SSOT divergence in `CompleteWorkflowOrchestrator.tsx`
- Add UI components for soul extraction results

### Phase D: User Interface (1-2 SDs)

**SD-GENESIS-UI-001**: Genesis Simulation Creation UI
- Create simulation creation form/wizard
- Pattern selector UI
- Simulation status dashboard
- Gate pass/fail visualization

**SD-GENESIS-UI-002**: Genesis Results & Ratification UI (Optional)
- Simulation results review screen
- One-click ratification flow
- Simulation → Venture transition UI

### Phase E: Polish & Testing (1 SD)

**SD-GENESIS-E2E-001**: Genesis End-to-End Testing
- E2E tests for full simulation lifecycle
- Integration tests for Stage 16/17
- Performance testing for LLM calls
- Documentation finalization

---

## Part 5: Dependency Graph

```
SD-GENESIS-RESEARCH-001 (Phase A)
    │
    ├──► SD-GENESIS-DATAMODEL-001 (Phase B)
    │        │
    │        ├──► SD-GENESIS-PRD-001 (Phase C)
    │        │        │
    │        │        └──► SD-GENESIS-UI-001 (Phase D)
    │        │
    │        └──► SD-GENESIS-STAGE16-17-001 (Phase C)
    │                 │
    │                 └──► SD-GENESIS-UI-002 (Phase D)
    │
    └──► SD-GENESIS-E2E-001 (Phase E) [after all others]
```

---

## Part 6: Success Criteria

### MVP (Minimum Viable Genesis)
- [ ] User can create simulation via UI (not just CLI)
- [ ] Simulation creates SD + PRD (not orphan PRD)
- [ ] PRD content is LLM-generated (not hardcoded)
- [ ] Stage 16/17 show correct components in orchestrator
- [ ] One simulation can be ratified to real venture

### Full Vision
- [ ] All items above, plus:
- [ ] Pattern composition (multiple patterns per venture)
- [ ] Automated gate checking
- [ ] Simulation analytics dashboard
- [ ] Soul extraction produces actionable artifacts
- [ ] Production generator creates deployable code

---

## Part 7: Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM costs for PRD generation | High API spend | Cache patterns, limit tokens, use cheaper models for drafts |
| SSOT divergence recurrence | Technical debt | Add automated SSOT consistency check |
| Scope creep in research phase | Timeline slip | Timebox research to single SD, answer only critical questions |
| Two-codebase complexity | Developer confusion | Documentation complete (see PR #147), add cross-repo scripts |

---

## Part 8: Immediate Next Steps

1. **LEAD Approval**: Review this blueprint, approve/modify scope
2. **Create Parent SD**: `SD-GENESIS-COMPLETE-001` as parent
3. **Create First Child**: `SD-GENESIS-RESEARCH-001` for research phase
4. **Begin Research**: Answer R1-R11 questions
5. **Design Review**: Present TDD before Phase B begins

---

## Appendix: File References

### EHG_Engineer Codebase
- `lib/genesis/pattern-library.js` - Pattern storage and retrieval
- `lib/genesis/quality-gates.js` - Gate evaluation logic
- `lib/genesis/mock-mode.js` - Simulation isolation
- `lib/genesis/vercel-deploy.js` - Ephemeral deployment (CLI)

### EHG App Codebase
- `scripts/genesis/genesis-pipeline.js` - Main pipeline (PRD stub at L190-212)
- `scripts/genesis/soul-extractor.js` - Stage 16 logic
- `scripts/genesis/production-generator.js` - Stage 17 logic
- `src/pages/api/genesis/ratify.ts` - Ratification endpoint
- `lib/genesis/ScaffoldEngine.js` - Code generation from patterns

### Documentation
- `docs/architecture/GENESIS_IMPLEMENTATION_GUIDE.md` - Full guide
- `docs/reference/genesis-codebase-guide.md` - Quick reference

---

*Blueprint created: 2026-01-01*
*Origin: Triangulation Research (OpenAI + Gemini + Claude Code)*
*Author: Claude Code (Architect Mode)*
