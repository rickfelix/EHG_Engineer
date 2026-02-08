---
Category: Guide
Status: Approved
Version: 1.0.0
Author: DOCMON Sub-Agent
Last Updated: 2026-02-08
Tags: [cli-venture-lifecycle, eva, stages]
Related SDs: [SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001]
---

# Stage Index - CLI Venture Lifecycle

Quick navigation index for all 25 stages across 6 phases.

## Visual Phase Map

```
 PHASE 1: THE TRUTH             PHASE 2: THE ENGINE
 (Is it worth pursuing?)        (How does it make money?)
 +---------+---------+          +---------+---------+
 | Stage 1 | Stage 2 |          | Stage 6 | Stage 7 |
 | Draft   | AI      |          | Risk    | Pricing |
 | Idea    | Review  |          | Matrix  |         |
 +---------+---------+          +---------+---------+
 | Stage 3 | Stage 4 |          | Stage 8 | Stage 9 |
 | Market  | Compet. |          | BMC     | Exit    |
 | Valid.  | Intel   |          |         | Strategy|
 +---------+---------+          +---------+---------+
 | Stage 5 |         |             REALITY GATE 2->3
 | Profit  |  KILL   |          ========================
 | Forcast |  GATE   |
 +---------+---------+
    REALITY GATE 1->2
 ========================

 PHASE 3: THE IDENTITY          PHASE 4: THE BLUEPRINT
 (Who are we?)                  (What are we building?)
 +---------+---------+          +---------+---------+
 | Stage10 | Stage11 |          | Stage13 | Stage14 |
 | Naming/ | GTM     |          | Product | Tech.   |
 | Brand   | Strategy|          | Roadmap | Arch.   |
 +---------+---------+          +---------+---------+
 | Stage12 |         |          | Stage15 | Stage16 |
 | Sales   |         |          | Resource| Financ. |
 | Logic   |  GATE   |          | Plan    | Project.|
 +---------+---------+          +---------+---------+
    REALITY GATE 3->4           PROMOTION GATE 4->5
 ========================       ========================

 PHASE 5: THE BUILD LOOP        PHASE 6: LAUNCH & LEARN
 (Build the product)            (Ship, measure, improve)
 +---------+---------+          +---------+---------+
 | Stage17 | Stage18 |          | Stage23 | Stage24 |
 | Pre-    | Sprint  |          | Launch  | Metrics |
 | Build   | Plan    |          | Exec.   | & Learn |
 +---------+---------+          +---------+---------+
 | Stage19 | Stage20 |          | Stage25 |         |
 | Build   | Quality |          | Venture |  DRIFT  |
 | Exec.   | Assur.  |          | Review  |  CHECK  |
 +---------+---------+          +---------+---------+
 | Stage21 | Stage22 |
 | Integr. | Release |
 | Test    | Ready   |
 +---------+---------+
 PROMOTION GATE 5->6
 ========================
```

## Gate Types

| Symbol | Gate Type | Effect |
|--------|-----------|--------|
| KILL | Kill Gate | Can terminate the venture entirely |
| REALITY | Reality Gate | Validates all artifacts from the preceding phase |
| PROMOTION | Promotion Gate | Validates readiness before promoting to the next phase |
| ADVISORY | Advisory Checkpoint | Chairman review point, no automatic kill |

## Complete Stage Table

| # | Name | Phase | Slug | Gate | Template |
|---|------|-------|------|------|----------|
| 1 | Draft Idea | 1 - The Truth | `draft-idea` | -- | `stage-01.js` (56 lines) |
| 2 | AI Review | 1 - The Truth | `ai-review` | -- | `stage-02.js` (85 lines) |
| 3 | Market Validation | 1 - The Truth | `validation` | KILL | `stage-03.js` (133 lines) |
| 4 | Competitive Intel | 1 - The Truth | `competitive-intel` | -- | `stage-04.js` (115 lines) |
| 5 | Profitability | 1 - The Truth | `profitability` | KILL + REALITY | `stage-05.js` (193 lines) |
| 6 | Risk Matrix | 2 - The Engine | `risk-matrix` | -- | `stage-06.js` (126 lines) |
| 7 | Pricing | 2 - The Engine | `pricing` | -- | `stage-07.js` (163 lines) |
| 8 | Business Model Canvas | 2 - The Engine | `bmc` | -- | `stage-08.js` (112 lines) |
| 9 | Exit Strategy | 2 - The Engine | `exit-strategy` | REALITY | `stage-09.js` (222 lines) |
| 10 | Naming / Brand | 3 - The Identity | `naming-brand` | -- | `stage-10.js` (172 lines) |
| 11 | Go-To-Market | 3 - The Identity | `gtm` | -- | `stage-11.js` (162 lines) |
| 12 | Sales Logic | 3 - The Identity | `sales-logic` | REALITY | `stage-12.js` (232 lines) |
| 13 | Product Roadmap | 4 - The Blueprint | `product-roadmap` | KILL | `stage-13.js` (204 lines) |
| 14 | Technical Architecture | 4 - The Blueprint | `technical-architecture` | -- | `stage-14.js` (157 lines) |
| 15 | Resource Planning | 4 - The Blueprint | `resource-planning` | -- | `stage-15.js` (160 lines) |
| 16 | Financial Projections | 4 - The Blueprint | `financial-projections` | PROMOTION | `stage-16.js` (231 lines) |
| 17 | Pre-Build Checklist | 5 - The Build Loop | `pre-build-checklist` | -- | `stage-17.js` (142 lines) |
| 18 | Sprint Planning | 5 - The Build Loop | `sprint-planning` | -- | `stage-18.js` (134 lines) |
| 19 | Build Execution | 5 - The Build Loop | `build-execution` | -- | `stage-19.js` (118 lines) |
| 20 | Quality Assurance | 5 - The Build Loop | `quality-assurance` | -- | `stage-20.js` (130 lines) |
| 21 | Integration Testing | 5 - The Build Loop | `integration-testing` | -- | `stage-21.js` (105 lines) |
| 22 | Release Readiness | 5 - The Build Loop | `release-readiness` | PROMOTION | `stage-22.js` (193 lines) |
| 23 | Launch Execution | 6 - Launch & Learn | `launch-execution` | KILL | `stage-23.js` (151 lines) |
| 24 | Metrics & Learning | 6 - Launch & Learn | `metrics-learning` | -- | `stage-24.js` (160 lines) |
| 25 | Venture Review | 6 - Launch & Learn | `venture-review` | DRIFT CHECK | `stage-25.js` (196 lines) |

## Gate Locations by Phase Boundary

| Boundary | Gate Type | Evaluated In | Exported Function |
|----------|-----------|--------------|-------------------|
| Phase 1 -> 2 | Reality Gate | `stage-05.js` | `evaluateKillGate` (Stage 5) |
| Phase 2 -> 3 | Reality Gate | `stage-09.js` | `evaluateRealityGate` (Phase 2) |
| Phase 3 -> 4 | Reality Gate | `stage-12.js` | `evaluateRealityGate` (Phase 3) |
| Phase 4 -> 5 | Promotion Gate | `stage-16.js` | `evaluatePromotionGate` (Phase 4) |
| Phase 5 -> 6 | Promotion Gate | `stage-22.js` | `evaluatePromotionGate` (Phase 5) |
| Stage 3 | Kill Gate | `stage-03.js` | `evaluateKillGate` |
| Stage 5 | Kill Gate | `stage-05.js` | `evaluateKillGate` |
| Stage 13 | Kill Gate | `stage-13.js` | `evaluateKillGate` |
| Stage 23 | Kill Gate | `stage-23.js` | `evaluateKillGate` |
| Stage 25 | Drift Check | `stage-25.js` | `detectDrift` |

## Template Registry

All templates are accessed via the master index at `lib/eva/stage-templates/index.js`:

- `getTemplate(stageNumber)` -- Returns template by stage number (1-25)
- `getAllTemplates()` -- Returns array of all 25 templates
- Named exports for each kill/reality/promotion gate function

## Phase Documentation

| Phase | Doc | Stages |
|-------|-----|--------|
| 1 - The Truth | [phase-01-the-truth.md](phase-01-the-truth.md) | 1-5 |
| 2 - The Engine | [phase-02-the-engine.md](phase-02-the-engine.md) | 6-9 |
| 3 - The Identity | [phase-03-the-identity.md](phase-03-the-identity.md) | 10-12 |
| 4 - The Blueprint | [phase-04-the-blueprint.md](phase-04-the-blueprint.md) | 13-16 |
| 5 - The Build Loop | [phase-05-the-build-loop.md](phase-05-the-build-loop.md) | 17-22 |
| 6 - Launch & Learn | [phase-06-launch-and-learn.md](phase-06-launch-and-learn.md) | 23-25 |

## Common Template Structure

Every stage template (`lib/eva/stage-templates/stage-{NN}.js`) exports:

- **TEMPLATE** (default export) -- Object with `id`, `slug`, `title`, `version`, `schema`, `defaultData`, `validate(data)`, `computeDerived(data, prerequisites?)`
- **Named exports** -- Constants (thresholds, enums) and gate evaluation functions

Shared validation utilities live in `lib/eva/stage-templates/validation.js`:
- `validateString(value, fieldName, minLength)`
- `validateNumber(value, fieldName, min)`
- `validateInteger(value, fieldName, min, max)`
- `validateArray(value, fieldName, minItems)`
- `validateEnum(value, fieldName, allowedValues)`
- `collectErrors(results)`
