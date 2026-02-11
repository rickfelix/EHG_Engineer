# SD-ARTIFACT-INTEGRATION-001: Proposed File Tree Changes


## Metadata
- **Category**: Architecture
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: api, schema, protocol, leo

**SD**: SD-ARTIFACT-INTEGRATION-001
**Title**: 25-Stage Artifact Integration + Stage-Gated Runtime Consumption
**Created**: 2025-12-14
**Phase**: LEAD Step 1 (Pre-Approval)

---

## Boundary Overview

```
EHG_Engineering (Governance)          EHG (Runtime)
├── GENERATES artifacts               ├── CONSUMES approved artifacts
├── OWNS stage_policy.yaml            ├── READS stage_policy (build-time or API)
├── RUNS LEO Protocol                 ├── NEVER calls governance scripts
└── STORES to Supabase                └── READS from Supabase
```

---

## New Files: EHG_Engineering (Governance)

### 1. Stage Policy Configuration
```
config/
└── stage_policy.yaml                    # NEW: Single source of truth
```

**Purpose**: Canonical definition of artifact requirements per stage.

**Structure**:
```yaml
# config/stage_policy.yaml
version: "1.0"
stages:
  1:
    name: "Draft Idea & Chairman Review"
    required_artifacts: []
    optional_artifacts: [idea_brief]
    gate_type: soft
  2:
    name: "AI Multi-Model Critique"
    required_artifacts: [critique_report]
    optional_artifacts: [vision_visualization]
    gate_type: soft
  3:
    name: "Market Validation & RAT"
    required_artifacts: [market_validation, rat_assessment]
    optional_artifacts: []
    gate_type: hard  # Decision gate
    epistemic_required: true
  # ... stages 4-25
```

**Ownership**: EHG_Engineering (governance)
**Consumers**: EHG runtime (read-only via build copy or API)

---

### 2. Artifact Contract Schema
```
config/
└── artifact_contract.schema.json        # NEW: Schema validation
```

**Purpose**: JSON Schema for validating artifact structure.

**Structure**:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "type", "version", "provenance", "content"],
  "properties": {
    "id": { "type": "string", "pattern": "^ART-[A-Z]+-\\d{3}$" },
    "type": { "enum": ["vision_brief", "market_validation", "design_contract", ...] },
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+$" },
    "provenance": {
      "type": "object",
      "required": ["generator", "timestamp", "sd_id"],
      "properties": {
        "generator": { "enum": ["governance", "superdesign", "nano_banana"] },
        "timestamp": { "type": "string", "format": "date-time" },
        "sd_id": { "type": "string" },
        "prompt_hash": { "type": "string" }
      }
    },
    "validation_status": {
      "type": "object",
      "properties": {
        "score": { "type": "number", "minimum": 0, "maximum": 100 },
        "threshold": { "type": "number", "default": 85 },
        "passed": { "type": "boolean" }
      }
    },
    "epistemic_classification": {
      "type": "object",
      "properties": {
        "facts": { "type": "array" },
        "assumptions": { "type": "array" },
        "simulations": { "type": "array" },
        "unknowns": { "type": "array" }
      }
    },
    "content": { "type": "object" }
  }
}
```

**Ownership**: EHG_Engineering
**Validation**: Run on artifact insert in governance scripts

---

### 3. Artifact Generation Scripts (Future Enhancement)
```
scripts/
├── generate-vision-brief.js            # EXISTS: Vision brief generation
├── generate-vision-visualization.js    # EXISTS: Image generation
├── approve-vision-brief.js             # EXISTS: Approval workflow
└── generate-design-contract.js         # FUTURE: SuperDesign output
```

**No changes required** for Phase 1 - existing scripts already store artifacts correctly.

---

## New Files: EHG (Runtime)

### 4. Artifact Display Components
```
src/components/artifacts/
├── ArtifactPanel.tsx                   # NEW: Generic artifact display
├── ArtifactCard.tsx                    # NEW: Individual artifact card
├── VisionBriefViewer.tsx               # NEW: Vision brief + image display
├── DesignContractViewer.tsx            # FUTURE: SuperDesign viewer
└── index.ts                            # NEW: Exports
```

**ArtifactPanel.tsx** (Primary Component):
```tsx
interface ArtifactPanelProps {
  ventureId: string;
  stageNumber: number;
  stagePolicy: StagePolicy;
  onArtifactRequest?: (type: string) => void;
}

// Displays:
// - Required artifacts (with gate indicator)
// - Optional artifacts (if present)
// - Missing artifact placeholders with request button
// - Validation status badges
```

---

### 5. Gate Enforcement Components
```
src/components/gates/
├── GateIndicator.tsx                   # NEW: Visual gate status
├── GateBlocker.tsx                     # NEW: Blocks progression
├── GateOverrideRequest.tsx             # NEW: Chairman override request
└── index.ts                            # NEW: Exports
```

**GateIndicator.tsx**:
```tsx
interface GateIndicatorProps {
  gateType: 'soft' | 'hard';
  requiredArtifacts: ArtifactRequirement[];
  presentArtifacts: Artifact[];
  validationThreshold: number;  // 85
}

// Shows:
// - Green: All required artifacts present and validated
// - Yellow: Soft gate, can proceed with warning
// - Red: Hard gate, must have artifacts to proceed
```

---

### 6. Stage Viewer Extensions
```
src/components/stages/
├── StageViewer1.tsx                    # EXISTS: Modify to include ArtifactPanel
├── StageViewer2.tsx                    # EXISTS: Add VisionBriefViewer
├── StageViewer3.tsx                    # EXISTS: Add gate enforcement
├── StageViewer4.tsx                    # EXISTS: Modify
├── StageViewer5.tsx                    # EXISTS: Add epistemic display
├── StageViewer6.tsx                    # EXISTS: Modify
├── StageViewer7.tsx                    # NEW: Create
├── StageViewer8.tsx                    # NEW: Create
├── StageViewer9.tsx                    # NEW: Create
├── StageViewer10.tsx                   # NEW: Create (with design contract)
├── StageViewer11.tsx                   # NEW: Create (brand identity)
├── StageViewer12.tsx                   # NEW: Create
├── StageViewer13.tsx                   # NEW: Create
├── StageViewer14.tsx                   # NEW: Create
├── StageViewer15.tsx                   # NEW: Create
└── StageViewer16.tsx                   # NEW: Create (decision gate)
```

**Modification Pattern for Existing Viewers**:
```tsx
// Add to each StageViewer
import { ArtifactPanel } from '@/components/artifacts';
import { GateIndicator } from '@/components/gates';

export function StageViewer2({ venture, stage }: Props) {
  const stagePolicy = useStagePolicy(stage.number);

  return (
    <div>
      <GateIndicator
        gateType={stagePolicy.gate_type}
        requiredArtifacts={stagePolicy.required_artifacts}
        presentArtifacts={venture.artifacts}
        validationThreshold={85}
      />

      {/* Existing stage content */}

      <ArtifactPanel
        ventureId={venture.id}
        stageNumber={stage.number}
        stagePolicy={stagePolicy}
        onArtifactRequest={handleArtifactRequest}
      />
    </div>
  );
}
```

---

### 7. Runtime Stage Policy Hook
```
src/hooks/
└── useStagePolicy.ts                   # NEW: Fetch stage policy
```

**Purpose**: Load stage_policy.yaml at runtime (via API or bundled).

```tsx
export function useStagePolicy(stageNumber: number): StagePolicy {
  // Option A: Bundled at build time (preferred for Phase 1)
  // Option B: API fetch from governance (Phase 2)

  return stagePolicyData.stages[stageNumber];
}
```

---

### 8. Artifact Service Layer
```
src/services/
└── artifactService.ts                  # NEW: Artifact data access
```

**Functions**:
```ts
// Read artifact from venture_artifacts table
getArtifactsForVenture(ventureId: string, stageNumber?: number): Promise<Artifact[]>

// Read governance visualization URL from SD metadata
getVisionVisualizationUrl(sdId: string): Promise<string | null>

// Check artifact validation status
validateArtifactGate(artifacts: Artifact[], requirements: string[]): GateStatus

// NEVER: No generation functions here (boundary enforcement)
```

---

## Modified Files: EHG (Runtime)

### 9. Workflow Orchestrator
```
src/components/workflow/
└── CompleteWorkflowOrchestrator.tsx    # MODIFY: Add gate checks
```

**Changes**:
```tsx
// Add gate enforcement before stage transition
const canProceedToStage = (currentStage: number, venture: Venture): boolean => {
  const policy = stagePolicy[currentStage];

  if (policy.gate_type === 'hard') {
    const hasRequiredArtifacts = policy.required_artifacts.every(
      type => venture.artifacts.some(a => a.type === type && a.validation_status.passed)
    );
    return hasRequiredArtifacts;
  }

  return true; // Soft gate allows progression with warning
};
```

---

## Summary: File Tree

```
EHG_Engineering/
├── config/
│   ├── stage_policy.yaml               # NEW (Phase 1)
│   └── artifact_contract.schema.json   # NEW (Phase 1)
├── scripts/
│   ├── generate-vision-brief.js        # EXISTS
│   ├── generate-vision-visualization.js # EXISTS
│   └── approve-vision-brief.js         # EXISTS
└── docs/
    └── architecture/
        └── sd-artifact-integration-001-file-tree.md  # THIS FILE

EHG/
├── src/
│   ├── components/
│   │   ├── artifacts/
│   │   │   ├── ArtifactPanel.tsx       # NEW (Phase 2)
│   │   │   ├── ArtifactCard.tsx        # NEW (Phase 2)
│   │   │   ├── VisionBriefViewer.tsx   # NEW (Phase 2)
│   │   │   └── index.ts                # NEW (Phase 2)
│   │   ├── gates/
│   │   │   ├── GateIndicator.tsx       # NEW (Phase 2)
│   │   │   ├── GateBlocker.tsx         # NEW (Phase 3)
│   │   │   └── index.ts                # NEW (Phase 2)
│   │   ├── stages/
│   │   │   ├── StageViewer1-6.tsx      # MODIFY (Phase 2-3)
│   │   │   └── StageViewer7-16.tsx     # NEW (Phase 3)
│   │   └── workflow/
│   │       └── CompleteWorkflowOrchestrator.tsx  # MODIFY (Phase 3)
│   ├── hooks/
│   │   └── useStagePolicy.ts           # NEW (Phase 2)
│   └── services/
│       └── artifactService.ts          # NEW (Phase 2)
```

---

## Phase Mapping

| Phase | Files | LOC Est. | Focus |
|-------|-------|----------|-------|
| 1 | stage_policy.yaml, artifact_contract.schema.json | 200 | Policy + Schema (Governance) |
| 2 | ArtifactPanel, VisionBriefViewer, GateIndicator, hooks, services | 400 | Display + Consumption (Runtime) |
| 3 | StageViewer7-16, GateBlocker, Orchestrator changes | 500 | Expansion + Enforcement |

**Total Estimated LOC**: ~1,100 (split across governance and runtime)

---

## Boundary Enforcement Verification

Before merging any PR, verify:

1. **No governance imports in runtime**:
   ```bash
   # In EHG repo
   grep -r "generate-vision" src/
   grep -r "approve-vision" src/
   grep -r "LEO Protocol" src/
   # All should return empty
   ```

2. **No write paths in artifactService**:
   ```bash
   # In artifactService.ts
   grep -E "insert|update|delete|create" src/services/artifactService.ts
   # Should only have read operations
   ```

3. **Stage policy is read-only**:
   ```bash
   # useStagePolicy hook should only import, not modify
   grep -E "setStagePolicy|updatePolicy" src/hooks/useStagePolicy.ts
   # Should return empty
   ```
