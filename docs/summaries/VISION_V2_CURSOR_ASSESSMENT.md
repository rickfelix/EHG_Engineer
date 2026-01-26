# Vision v2 Assessment - Anti-Gravity (Cursor)


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-12
- **Tags**: testing, unit, feature, infrastructure

## 1. The "Solo Founder" UI Audit

### Complexity Check
**Verdict:** High Cognitive Load.
The current application structure imposes a heavy cognitive load on the "Solo Founder" (Chairman). The existence of over **90 top-level and nested routes** (found in `App.tsx`) and **100+ stage components** suggests an interface that asks the user to manually drive a process that should be automated.
-   **Issue**: The user is presented with a "Control Panel" meant for a team of 50, rather than a "Cockpit" for a solo pilot.
-   **Work-to-Value Ratio**: Low. The user spends more time navigating to find the "right stage" than executing the work.

### Route Bloat & "Ghost Towns"
The routing configuration reveals significant bloat from legacy or testing phases that clutter the primary navigation.
-   **Ghost Towns (Routes to Hide/Archive)**:
    -   `/phase2-testing`, `/phase2-test-execution`, `/phase2-dashboard`: These are developer-centric, not Chairman-centric.
    -   `/phase3-verification`, `/gtm-intelligence`, `/development`: Likely relics or specific tool views that break the flow.
    -   `/automation`, `/eva-orchestration`: Should be background services, not primary navigation destinations.
-   **Redundant/Confusing**:
    -   `/ventures` vs `/portfolios` vs `/companies`: Overlapping concepts for a solo founder starting one factory.

### Navigation Flow: The 6-Phase Proposal
To mirror the 25-stage reality, the navigation must be radically simplified into the **6 Phases**. The Sidebar should essentially be a progress bar.

1.  **Truth** (Stages 1-4)
    -   *Focus*: Market gap, problem definition.
2.  **Engine** (Stages 5-9)
    -   *Focus*: Business model, unit economics.
3.  **Identity** (Stages 10-14)
    -   *Focus*: Branding, positioning, naming.
4.  **Blueprint** (Stages 15-19)
    -   *Focus*: Technical specs, architecture.
5.  **Build** (Stages 20-22)
    -   *Focus*: MPP development, infrastructure.
6.  **Launch** (Stages 23-25)
    -   *Focus*: GTM, feedback loops, scale.

---

## 2. Codebase "Feel"

### Directory Structure vs. 25-Stage Reality
**Verdict:** Misaligned.
The codebase is currently structured for a massive, fragmented workflow (40-52 stages) rather than the streamlined 25-stage "Venture Factory".
-   `src/components/stages` contains **79+ files** and subdirectories.
-   Files like `Stage52DataManagementKB.tsx` and `Stage40VentureActive.tsx` exist, directly contradicting the 25-stage model.
-   `App.tsx` imports dozens of these individually, creating a massive bundle of "potential" rather than "actual" value.

### Dead Code Identification
The following components represent the "Old 40-Stage Model" and should be flagged for immediate deletion or archiving. They create noise and confusion for any developer (and AI) trying to maintain the system.

**Candidates for Deletion (Sample):**
-   `Stage26OperationalExcellence.tsx`
-   `Stage27PerformanceOptimization.tsx`
-   `Stage28CustomerSuccess.tsx`
-   `Stage29RevenueOptimization.tsx`
-   `Stage30TeamScaling.tsx`
-   ... through ...
-   `Stage40VentureActive.tsx`
-   `Stage52DataManagementKB.tsx` (Outlier)

---

## 3. Vision v2 UX Proposal

### UX Critique: "Analysis Paralysis"
The Chairman *feels* overwhelmed because the UI presents "Everything, Everywhere, All at Once".
-   **Friction Point**: Opening the sidebar reveals a wall of text (Stages 1-52 potential).
-   **Friction Point**: Context switching between "Chairman Settings", "Escalations", "Reports", and "Ventures" disconnects the user from the *Flow*.
-   **Corrective Action**: The interface should be **Modal-Driven** or **Flow-Driven** rather than **Menu-Driven**. The user should be in a "Phase" and only see tools relevant to that Phase.

### Navigation Redesign
**Proposed Sidebar Structure:**

```
[ LOGO ]

[ DASHBOARD ] (High-level metrics)

-- VENTURE FACTORY --
1. TRUTH       (Active)
2. ENGINE      (Locked)
3. IDENTITY    (Locked)
4. BLUEPRINT   (Locked)
5. BUILD       (Locked)
6. LAUNCH      (Locked)

-- ASSETS --
[ Vault ] (Files, Exports)
[ Team ]  (Agents)

[ SETTINGS ]
```

### Frontend Debt Action Plan
1.  **Purge Stages 26-52**: Delete `src/components/stages/Stage26...` through `Stage52...`.
2.  **Route Consolidation**: Remove`/phase2-*` and `/phase3-*` routes from `App.tsx` (move to a separate `AdminApp.tsx` or behind a feature flag if truly needed for dev).
3.  **Component Renaming**: Verify Stages 1-25 match the new Phase definitions.
4.  **Sidebar Refactor**: Implement the 6-Phase accordion/menu.
