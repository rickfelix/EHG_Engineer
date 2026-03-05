<!-- Archived from: .claude/plans/eva-pipeline-gui-wiring.md -->
<!-- SD Key: SD-LEO-FEAT-EVA-PIPELINE-GUI-001 -->
<!-- Archived at: 2026-03-05T11:06:55.502Z -->

# EVA Pipeline-to-GUI Data Wiring — Stage 10-12 and Capability Registry

## Problem Statement
SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-K (Pipeline-to-GUI Wiring) was marked completed but only the backend pipeline data aggregation APIs were built. No frontend components were created or wired to consume the data.

## Scope
Wire the existing backend pipeline APIs at `/api/eva/pipeline/*` into the `ehg` frontend app. Create the Capability Registry page and integrate stage 10-12 data into existing Chairman UI.

### Components to Build or Wire
1. **Stage 10 — Customer Intelligence** — Wire `/api/eva/pipeline/:ventureId/customer-intelligence` data into existing Chairman venture detail views
2. **Stage 11 — Brand Genome** — Wire `/api/eva/pipeline/:ventureId/brand-genome` data into Brand Genome Wizard component
3. **Stage 12 — GTM Strategy** — Wire `/api/eva/pipeline/:ventureId/gtm-strategy` data into GTM Dashboard views
4. **CapabilityRegistryPage.tsx** — New page showing cross-venture capability graph and Capability Contribution Scores (CCS) from Child E
5. **PipelineSummaryCard.tsx** — Aggregated pipeline summary widget using `/api/eva/pipeline/:ventureId/summary`

### Hooks & Routes
- Create `usePipelineData.ts` hook consuming pipeline APIs
- Create `useCapabilityRegistry.ts` hook for CCS data
- Add route `/chairman/capabilities` → CapabilityRegistryPage
- Wire pipeline summary into venture detail pages

### Existing Backend (Already Implemented)
- `lib/eva/pipeline-data/index.js` — 259 lines, 4 endpoints
- `server/routes/eva-pipeline.js` — 75 lines
- Capability Contribution Score module from Child E
- Financial consistency contract from Child F

## Type
feature

## Target Repository
ehg (frontend)

## Dependencies
None — all backend APIs already exist from Children E, F, K
