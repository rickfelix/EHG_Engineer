---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-03-01
tags: [guide, auto-generated]
---

## Table of Contents

- [Purpose](#purpose)
- [Architectural Position](#architectural-position)
- [Stage 18 Sprint Plan Structure](#stage-18-sprint-plan-structure)
  - [Expected Input Shape](#expected-input-shape)
- [Conversion Flow](#conversion-flow)
  - [Step-by-Step Process](#step-by-step-process)
- [SD Key Generation](#sd-key-generation)
- [Type Mapping](#type-mapping)
- [Idempotency: Preventing Duplicate Orchestrators](#idempotency-preventing-duplicate-orchestrators)
  - [Lookup Strategy](#lookup-strategy)
  - [Why JSONB Metadata Lookup?](#why-jsonb-metadata-lookup)
- [Orchestrator SD Structure](#orchestrator-sd-structure)
- [Child SD Structure](#child-sd-structure)
- [Bridge Artifact Record](#bridge-artifact-record)
- [Pre-Build Panel Enrichment Rail](#pre-build-panel-enrichment-rail)
- [Integration Points](#integration-points)
  - [Upstream: Eva Orchestrator](#upstream-eva-orchestrator)
  - [Downstream: LEO Protocol](#downstream-leo-protocol)
  - [SD Key Generator](#sd-key-generator)
- [Error Handling](#error-handling)
- [Dependency Injection](#dependency-injection)
- [Key Design Decisions](#key-design-decisions)
  - [Why Orchestrator + Children (Not Flat SDs)?](#why-orchestrator-children-not-flat-sds)
  - [Why Idempotency via Metadata Query?](#why-idempotency-via-metadata-query)
  - [Why All Children Start in LEAD Phase?](#why-all-children-start-in-lead-phase)
- [Related Components](#related-components)

---
Category: Architecture
Status: Approved
Version: 1.1.0
Author: DOCMON Sub-Agent
Last Updated: 2026-06-03
Tags: [cli-venture-lifecycle, eva, orchestrator, pre-build-rail]
Related SDs: [SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001, SD-LEO-INFRA-PRE-BUILD-SUB-001]
---

# 06 - Lifecycle-to-SD Bridge

## Purpose

The Lifecycle-to-SD Bridge is the critical integration point where the Eva
Orchestrator's venture lifecycle **feeds into** the LEO Protocol workflow
system. When a venture reaches Stage 18 (MVP Development Loop) and produces a
sprint plan, this bridge converts each sprint item into a LEO Strategic
Directive (SD) that can be tracked, planned, and executed through the standard
LEAD-PLAN-EXEC workflow.

Without this bridge, venture stage outputs would remain as artifacts with no
mechanism to drive actual implementation work through LEO.

**Module**: `lib/eva/lifecycle-sd-bridge.js` (orchestrator + children + grandchild/leaf factory)
**Pre-build leaf rail**: `lib/eva/bridge/*.js` — see [Pre-Build Panel Enrichment Rail](#pre-build-panel-enrichment-rail)
**Related SD**: SD-LEO-FEAT-LIFECYCLE-SD-BRIDGE-001, SD-LEO-INFRA-PRE-BUILD-SUB-001

---

## Architectural Position

```
Eva Orchestrator Lifecycle                    LEO Protocol Workflow
========================                    ======================

Stage 17 (Product Planning)
        |
        v
Stage 18 (MVP Development Loop)
        |
        | sprint plan with
        | sd_bridge_payloads[]
        |
        v
+---------------------------+
| Lifecycle-to-SD Bridge    |---+
| convertSprintToSDs()      |   |
+---------------------------+   |
        |                       |
        |  Creates              | Records
        |                       |
        v                       v
+------------------+    +------------------+
| strategic_       |    | venture_         |
| directives_v2    |    | artifacts        |
| (orchestrator    |    | (bridge result)  |
|  + N children)   |    |                  |
+--------+---------+    +------------------+
         |
         v
  LEO LEAD Phase
  (SD approval, PRD creation)
         |
         v
  LEO PLAN Phase
  (validation, design)
         |
         v
  LEO EXEC Phase
  (implementation, testing)
```

The bridge occupies the boundary between two systems:
- **Upstream**: Eva Orchestrator stage execution (venture lifecycle)
- **Downstream**: LEO Protocol SD workflow (engineering execution)

---

## Stage 18 Sprint Plan Structure

Stage 18 produces a sprint plan that includes an `sd_bridge_payloads` array.
Each payload represents one sprint item that needs to become an SD.

### Expected Input Shape

The bridge expects `stageOutput` with these fields:

| Field | Type | Purpose |
|-------|------|---------|
| `sprint_name` | string | Human-readable sprint identifier |
| `sprint_goal` | string | Sprint objective statement |
| `sprint_duration_days` | number | Duration of the sprint |
| `sd_bridge_payloads` | array | Sprint items to convert to SDs |

Each item in `sd_bridge_payloads` contains:

| Field | Type | Purpose |
|-------|------|---------|
| `title` | string | Sprint item title (becomes SD title) |
| `description` | string | Detailed description (becomes SD description) |
| `scope` | string | Scope statement (becomes SD scope) |
| `type` | string | Item type: feature, bugfix, enhancement, refactor, infra |
| `priority` | string | Priority level (defaults to "medium") |
| `success_criteria` | string | Acceptance criteria for the item |
| `target_application` | string | Target app (defaults to "EHG_Engineer") |
| `risks` | array | Risk items (string or {risk, mitigation} objects) |
| `dependencies` | array | Dependencies on other sprint items |

---

## Conversion Flow

```mermaid
flowchart TD
    A[Stage 18 Sprint Output] --> B{Has sd_bridge_payloads?}
    B -->|No| C[Return: no items to convert]
    B -->|Yes| D[Check for existing orchestrator]

    D --> E{findExistingOrchestrator}
    E -->|Found| F[Return existing keys - idempotent]
    E -->|Not found| G[Generate orchestrator SD key]

    G --> H[Create orchestrator SD in strategic_directives_v2]
    H --> I{Orchestrator created?}
    I -->|Error| J[Return error]
    I -->|Success| K[Loop: create child SDs]

    K --> L[For each payload item]
    L --> M[Generate child SD key]
    M --> N[Map type via TYPE_MAP]
    N --> O[Insert child SD with parent_sd_id]
    O --> P{Child created?}
    P -->|Error| Q[Log error, continue to next]
    P -->|Success| R[Add to childKeys array]
    Q --> L
    R --> L

    L --> S[Return result with orchestratorKey + childKeys]
```

### Step-by-Step Process

1. **Input validation** -- Check that `sd_bridge_payloads` array is non-empty
2. **Venture prefix** -- Normalize venture name into SD key prefix via
   `normalizeVenturePrefix()` from `scripts/modules/sd-key-generator.js`
3. **Idempotency check** -- Query `strategic_directives_v2` for an existing
   orchestrator matching the venture ID and sprint name
4. **Orchestrator creation** -- Generate SD key via `generateSDKey()`, insert
   orchestrator row into `strategic_directives_v2`
5. **Child creation loop** -- For each sprint item, generate a child key via
   `generateChildKey()`, map the type, and insert the child SD row
6. **Result assembly** -- Return the orchestrator key, all child keys, and
   any errors encountered during child creation

---

## SD Key Generation

The bridge delegates key generation to `scripts/modules/sd-key-generator.js`,
which produces LEO-standard SD keys:

```
Orchestrator Key Pattern:
   SD-{VENTURE_PREFIX}-ORCH-SPRINT-{NAME}-001

Child Key Pattern:
   SD-{VENTURE_PREFIX}-ORCH-SPRINT-{NAME}-001-A
   SD-{VENTURE_PREFIX}-ORCH-SPRINT-{NAME}-001-B
   SD-{VENTURE_PREFIX}-ORCH-SPRINT-{NAME}-001-C
   ...
```

Child keys use alphabetic suffixes (A, B, C, ...) derived from the sprint
item's array index via `String.fromCharCode(65 + index)`.

The `skipLeadValidation: true` flag is set on key generation because the
bridge creates SDs programmatically, bypassing the normal LEAD approval
flow at creation time. The SDs will still go through LEAD approval when
they enter the LEO workflow.

---

## Type Mapping

The bridge maps Stage 18 output types to database `sd_type` values:

| Stage 18 Type | Database sd_type |
|---------------|-----------------|
| `feature` | `feature` |
| `bugfix` | `bugfix` |
| `enhancement` | `feature` |
| `refactor` | `refactor` |
| `infra` | `infrastructure` |

If a payload type is not in the map, it defaults to `feature`. This ensures
every sprint item maps to a valid `sd_type` that is registered in the LEO
Protocol's 13 reference points (see MEMORY.md for the full list).

---

## Idempotency: Preventing Duplicate Orchestrators

The `findExistingOrchestrator()` function provides idempotency by checking
whether an orchestrator SD already exists for a given venture + sprint
combination.

### Lookup Strategy

```
Query strategic_directives_v2 WHERE:
  - sd_type = 'orchestrator'
  - metadata->>'venture_id' = ventureId
  - metadata->>'sprint_name' = sprintName
  LIMIT 1
```

If found, the function also loads the orchestrator's children by querying
for rows where `parent_sd_id` matches the orchestrator's UUID.

### Why JSONB Metadata Lookup?

The venture_id and sprint_name are stored in the SD's `metadata` JSONB
column rather than in dedicated columns. This is because the
`strategic_directives_v2` table serves all SD types, and venture-specific
fields would be NULL for non-venture SDs. The JSONB approach keeps the
table schema clean while allowing structured queries via PostgreSQL's
`->>` operator.

---

## Orchestrator SD Structure

The bridge creates the orchestrator with these field mappings:

| SD Field | Source |
|----------|--------|
| `title` | `Sprint: {sprint_name}` |
| `description` | Composed from sprint name, goal, duration, item count |
| `scope` | Sprint orchestrator description |
| `rationale` | Stage 18 produced N items requiring LEO workflow |
| `sd_type` | `orchestrator` |
| `status` | `draft` |
| `priority` | `medium` |
| `current_phase` | `LEAD` |
| `created_by` | `lifecycle-sd-bridge` |
| `success_criteria` | Array of sprint item titles |
| `metadata.venture_id` | Venture UUID |
| `metadata.sprint_name` | Sprint identifier |
| `metadata.created_via` | `lifecycle-sd-bridge` |

---

## Child SD Structure

Each child SD maps a single sprint item to an SD row:

| SD Field | Source |
|----------|--------|
| `title` | payload.title |
| `description` | payload.description |
| `scope` | payload.scope |
| `rationale` | Composed from sprint name and description |
| `sd_type` | Mapped via TYPE_MAP |
| `parent_sd_id` | UUID of the orchestrator SD |
| `priority` | payload.priority or "medium" |
| `current_phase` | `LEAD` |
| `created_by` | `lifecycle-sd-bridge` |
| `metadata.sprint_item_index` | Array index of the item |
| `metadata.dependencies` | payload.dependencies array |

---

## Bridge Artifact Record

After conversion, the bridge can produce an artifact record for storage in
`venture_artifacts` via `buildBridgeArtifactRecord()`. This creates a
permanent link between the venture stage execution and the SDs that were
created.

```
Bridge Artifact Record
======================

venture_id:        Venture UUID
lifecycle_stage:   18 (Stage 18)
artifact_type:     'lifecycle_sd_bridge'
title:             'Lifecycle-to-SD Bridge - Stage 18'
content:           JSON with orchestratorKey, childKeys, errors
quality_score:     100 if no errors, decremented by 25 per error
validation_status: 'validated' or 'pending'
source:            'lifecycle-sd-bridge'
```

The quality score formula: `max(0, 100 - (error_count * 25))`. A clean
conversion with zero errors scores 100; each failed child creation drops
the score by 25 points.

---

## Integration Points

### Upstream: Eva Orchestrator

The Eva Orchestrator calls `convertSprintToSDs()` when Stage 18 completes.
The orchestrator passes:

- `stageOutput` -- The full output from Stage 18 execution
- `ventureContext` -- Venture metadata including `{ id, name }`

### Downstream: LEO Protocol

Once the bridge creates SDs, they enter the standard LEO workflow:

```
Bridge creates SDs (status: 'draft', phase: 'LEAD')
         |
         v
LEAD Phase: Chairman/Lead reviews and approves SDs
         |
         v
PLAN Phase: PRD creation, design, validation
         |
         v
EXEC Phase: Implementation, testing, deployment
         |
         v
Completion: SD marked complete, child-to-child continues
```

The orchestrator SD coordinates its children using LEO's standard
orchestrator-child workflow, including AUTO-PROCEED child-to-child
continuation.

### SD Key Generator

The bridge depends on `scripts/modules/sd-key-generator.js` for:

- `generateSDKey()` -- Creates the orchestrator SD key
- `generateChildKey()` -- Creates child SD keys from parent key
- `normalizeVenturePrefix()` -- Converts venture name to a valid key prefix

---

## Error Handling

The bridge uses a **continue-on-error** strategy for child creation:

```
Create Orchestrator
    |
    +--> FAIL: Return immediately (no children without parent)
    |
    +--> SUCCESS: Begin child loop
              |
              +--> Child 1: SUCCESS --> add to childKeys
              +--> Child 2: FAIL    --> log error, add to errors[], continue
              +--> Child 3: SUCCESS --> add to childKeys
              +--> Child 4: SUCCESS --> add to childKeys
              |
              v
         Return { created: true, childKeys: [1,3,4], errors: ["Child 2: ..."] }
```

If the orchestrator fails to create, the entire operation fails. If
individual children fail, the successful ones are still created and returned.
The caller can inspect the `errors` array to determine if any children were
lost.

---

## Dependency Injection

The `convertSprintToSDs()` function accepts a `deps` parameter for testing:

| Dependency | Default | Override Purpose |
|-----------|---------|------------------|
| `supabase` | Created from env vars | Mock DB client for tests |
| `logger` | `console` | Capture log output in tests |

The internal `getSupabaseClient()` helper creates a client from
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables.

---

## Key Design Decisions

### Why Orchestrator + Children (Not Flat SDs)?

Sprint items are logically grouped -- they share a sprint goal, timeline, and
context. The orchestrator pattern enables:

1. **Grouped tracking** -- View all sprint items as a cohesive unit
2. **AUTO-PROCEED** -- LEO's child-to-child continuation processes items
   sequentially
3. **Progress visibility** -- Orchestrator completion reflects sprint
   completion

### Why Idempotency via Metadata Query?

Re-running Stage 18 (e.g., after a crash) must not create duplicate SDs.
The metadata-based lookup ensures that calling `convertSprintToSDs()` with
the same venture + sprint combination returns existing SDs rather than
creating new ones.

### Why All Children Start in LEAD Phase?

Even though the SDs were generated programmatically, they still need human
approval before planning and implementation begin. Starting in LEAD phase
ensures the Chairman reviews and approves each item before engineering
resources are committed.

---

## Pre-Build Panel Enrichment Rail

**Related SD**: SD-LEO-INFRA-PRE-BUILD-SUB-001 · **Root cause**: RCA-LEO-BRIDGE-DECOMP-001
**Modules**: `lib/eva/bridge/*.js` (12 modules) · **Seam**: `computeLeafContent()` in `lib/eva/bridge/leaf-content.js`
**Flag**: `PREBUILD_PANEL_ENRICHMENT` (default **OFF**)

### The Problem This Solves

The bridge described above creates an orchestrator and its **children**. When a child is
itself decomposed, the bridge's leaf factory (`createGrandchildren` in
`lib/eva/lifecycle-sd-bridge.js`) historically stamped each grandchild (leaf) with a
**complexity-blind static template** — e.g. `"REST endpoints, request handling, validation
for X"` — and did **not** route the leaf through the 32-agent LEO sub-agent PLAN rail that
human-driven SDs pass through. The decomposition was *edges-intelligent, middle-blind*: the
orchestrator and children carried real venture context, but the leaves degraded to scaffolding.

This is why an autonomously-built venture (e.g. DataDistill) shipped only a landing-page +
auth scaffold instead of its actual engine — the leaf that should have specified the
SCAN/WALK/DIST engine was a template stub, so EXEC built the stub.

### The Fix: a Single Decision Seam

`createGrandchildren` now derives each leaf's `description`/`scope` from one function:

```
computeLeafContent({ layer, childPayload, leafKey, ventureContext })
```

- **Flag OFF (default)** → returns the legacy template verbatim (`templateLeafContent`).
  Behavior is **byte-identical** to before this SD; the rail is fully inert.
- **Flag ON _and_ `ventureContext` supplies a panel driver** → runs the leaf through the
  ordered sub-agent panel (`enrichLeafViaPanel`) and returns enriched content grounded in
  prior-stage venture artifacts (S0–S18).
- **Fail-closed**: if a *required* panel agent cannot deliver, the leaf is `status:'held'`
  and `computeLeafContent` **throws `PREBUILD_PANEL_HELD`** rather than emitting a stub —
  the core behavior the RCA demands (a missing specification halts the build; it never
  silently degrades to a template).

The panel runs via an **injected driver** (`driver`), mirroring the existing
`venture-build-consumer` `driveLeaf` seam: the lib owns the bounded, fail-closed control
loop (headlessly unit-testable), and the live session injects the LLM-backed sub-agents.

### Module Map (6 units, 12 modules)

| Unit | Module | Responsibility |
|------|--------|----------------|
| U1 Select | `agent-panel-manifest.js` | `PANEL_AGENTS`, per-venture `selectAgentManifest`, `orderPanelDAG` (Kahn topo-sort: architecture→schema→ui→tests; security/compliance cross-cut; acceptance last) |
| U1 Select | `venture-criteria-resolver.js` | `deriveVentureCriteria` — maps S0–18 artifact signals → panel-selection criteria |
| U1 Enrich | `leaf-panel-enrichment.js` | `enrichLeafViaPanel` — bounded, **fail-closed** panel runner via injected driver |
| U1 Seam | `leaf-content.js` | `computeLeafContent` / `templateLeafContent` / `isPrebuildPanelEnrichmentEnabled` (the flag gate + bridge seam) |
| U2 Compliance | `venture-stack-agent.js` | Deterministic venture-stack conformance (reuses `venture-stack-policy` SSOT); **HOLDS** on forbidden tech |
| U3 Verify | `verification-verdict.js` | `verifySection` — N independent refuters, majority-refute kills a section (fail-closed) |
| U3 Verify | `completeness-critic.js` | `assessCompleteness` — flags capabilities not covered by any enriched section |
| U4 Sequence | `build-sequencer.js` | `computeBuildSequence` — Kahn order + parallel waves + cycle detection |
| U4 Contract | `interface-contracts.js` | `checkContractConsistency` / `checkTreeContracts` — produced-vs-consumed interface match across the SD tree |
| U5 Gate | `leaf-gate.js` | `evaluateLeafReadiness` → `SUBAGENT_EVIDENCE_MISSING` until required agents + verification present |
| U5 Hygiene | `regeneration-hygiene.js` | `planRegeneration` — idempotent re-runs; never resurrects `cancelled`/`completed` leaves |
| U6 Persist | `capability-persistence.js` | `toCapabilityRecord` / `findReusable` — persists each dimension's output to `sd_capabilities` so ventures compound capability |

### Current Status (as of this SD)

The rail is **landed but inert** — `PREBUILD_PANEL_ENRICHMENT` is OFF and no live driver is
wired into the venture-build flow yet, so production decomposition is unchanged. Enabling it
is gated on follow-on work:

1. Wire a live Task-based panel / refute / judge driver into the venture-build consumer.
2. Flip `PREBUILD_PANEL_ENRICHMENT` for a controlled pilot (DataDistill engine-D).
3. Compose the 6 units end-to-end (generate → verify → sequence → gate → persist).
4. Add a PLAN-VERIFY integration smoke over the DB-reading / live-driver seams.

A pilot run of the panel against real DataDistill S14 artifacts (via the `database-agent`)
produced a full engine schema — users/connections/jobs/runs plus SCAN/WALK/DIST state tables
— where the legacy template emitted only `"REST endpoints"`, and even caught an artifact
drift (an `api_key_hash` field that Clerk-owned auth makes redundant). That validates the
seam; the follow-ons make it the default path.

---

## Related Components

| Component | Relationship |
|-----------|-------------|
| Eva Orchestrator | Calls bridge at Stage 18 completion |
| Pre-Build Panel Rail (`lib/eva/bridge/`) | Enriches leaf SDs via the sub-agent panel before EXEC (flag-gated) |
| `venture-stack-policy` SSOT | Compliance source of truth reused by `venture-stack-agent.js` |
| `sd_capabilities` | Persists per-dimension panel output so ventures compound capability |
| SD Key Generator | Generates LEO-standard SD keys |
| `strategic_directives_v2` | Target table for created SDs |
| `venture_artifacts` | Stores bridge artifact record |
| LEO Protocol Workflow | Executes the created SDs through LEAD-PLAN-EXEC |
| AUTO-PROCEED | Drives child-to-child continuation after SD creation |
