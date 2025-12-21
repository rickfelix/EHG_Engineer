# Component Registry

Reference document for locating UI components created by Strategic Directives.

## SD-UNIFIED-PATH-3.1: Glass Cockpit Components

### DecisionDeck.tsx
**Purpose**: Read-only visibility component for the Glass Cockpit (Pillar 1)

**Location**: `/mnt/c/_EHG/ehg/src/components/decision-deck/DecisionDeck.tsx`

**Repository**: EHG (main application, not EHG_Engineer)

**Architecture Note**: UI components belong in the `ehg` repository (user-facing app),
while backend tooling, scripts, and migrations belong in `EHG_Engineer`.

**Features**:
- 4 tabs: Handoffs, Transitions, Progress, Agents
- Read-only queries (no INSERT/UPDATE/DELETE)
- Uses Shadcn/ui components
- Queries: pending_ceo_handoffs, system_events, ventures, venture_stage_work, agent_registry

**Verification**:
```bash
ls -la /mnt/c/_EHG/ehg/src/components/decision-deck/
```

---

## Repository Structure

| Repository | Purpose | Component Type |
|------------|---------|----------------|
| EHG (ehg/) | Main user-facing application | UI Components, Pages |
| EHG_Engineer | Tooling, scripts, migrations | Backend, CLI, Database |

---

*Created by LEO Protocol Restoration (SD-UNIFIED-PATH) to resolve Codex/Anti-Gravity "Ghost Deck" finding.*
