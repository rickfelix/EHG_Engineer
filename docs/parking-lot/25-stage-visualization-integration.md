# Parking Lot: 25-Stage Visualization Integration

**Status:** Parked for future discussion
**Created:** 2025-12-14
**Owner:** EHG_Engineering
**Runtime Impact:** EHG App (not this repo)

---

## Context

The governance side (EHG_Engineering) now generates vision brief visualizations and stores them in:
- Supabase Storage: `vision-briefs/sd/<SD-ID>/vision/<timestamp>.png`
- SD Metadata: `sd.metadata.vision_discovery.visualization.url`

The question: **Where and how should the EHG runtime (25-stage venture workflow) consume these governance-generated visualizations?**

---

## Candidate Insertion Points

### Option 1: Stages 2-3 (THE TRUTH - Early Validation)

| Stage | Title | Fit |
|-------|-------|-----|
| 2 | AI Multi-Model Critique | **Conditional** - Visual aids Chairman review |
| 3 | Market Validation & RAT | **Conditional** - Stakeholder communication |

**Rationale:**
- Vision brief is generated during governance LEAD phase, which maps to early venture ideation
- Visual mockup helps Chairman evaluate "Is this what we're building?"
- Low cost if visualization already exists from governance

**When to show:** Only if `sd.metadata.vision_discovery.visualization.url` exists

---

### Option 2: Stages 10-11 (THE IDENTITY - Brand & GTM)

| Stage | Title | Fit |
|-------|-------|-----|
| 10 | Strategic Naming | **Strong** - Brand identity visualization |
| 11 | Go-to-Market Strategy | **Strong** - Marketing mockup validation |

**Rationale:**
- Brand/identity is the natural home for visual artifacts
- GTM strategy benefits from seeing a "preview" of the product
- Could trigger visualization regeneration with brand-specific prompts

**When to show:** Required artifact for UI-heavy ventures

---

### Option 3: Stage 16 (THE BLUEPRINT - Schema Firewall)

| Stage | Title | Fit |
|-------|-------|-----|
| 16 | Spec-Driven Schema Generation | **Required for UI-heavy** |

**Rationale:**
- Last checkpoint before implementation begins
- UI specification should include visual reference
- Prevents "build the wrong thing" syndrome

**When to show:** Required for ventures with UI components

---

## Integration Pattern Recommendation

### Pattern A: Runtime Consumes Governance Artifact URL (Recommended)

**Principle:** Governance owns visualization generation; runtime only displays.

**Flow:**
```
[Governance: EHG_Engineering]          [Runtime: EHG App]
         │                                    │
         ├─ generate-vision-brief.js          │
         ├─ approve-vision-brief.js           │
         ├─ generate-vision-visualization.js  │
         │         │                          │
         │         └── stores URL in ─────────┼──► reads URL from
         │            sd.metadata             │    sd.metadata
         │                                    │         │
         │                                    │         ▼
         │                                    │    displays in
         │                                    │    venture stage UI
```

**Why this pattern:**
- Single source of truth (governance)
- No duplicate image generation costs
- No runtime dependency on AI providers
- Clear boundary: governance creates, runtime consumes

---

## Proposed Artifact Contract

When runtime stores a reference to the governance visualization, use this structure:

### Table: `venture_artifacts` (already exists in EHG app)

```sql
INSERT INTO venture_artifacts (
  venture_id,
  lifecycle_stage,
  artifact_type,
  title,
  file_url,
  metadata,
  is_current
) VALUES (
  :venture_id,
  2,  -- or 10, 11, 16 depending on stage
  'governance_visualization',
  'Vision Brief Visualization',
  :sd_metadata_vision_discovery_visualization_url,
  '{
    "source": "governance",
    "provider": "gemini",
    "model": "gemini-2.5-flash-image",
    "prompt_hash": "abc123...",
    "generated_at": "2025-12-14T10:00:00Z",
    "sd_id": "SD-FEATURE-001"
  }',
  true
);
```

### Artifact Type Definition

| Field | Value | Notes |
|-------|-------|-------|
| `artifact_type` | `governance_visualization` | New type for governance-sourced images |
| `file_url` | URL from governance | Read from `sd.metadata.vision_discovery.visualization.url` |
| `metadata.source` | `"governance"` | Distinguishes from runtime-generated |
| `metadata.provider` | `"gemini"` or `"openai"` | For provenance tracking |
| `metadata.model` | Model name | e.g., `"gemini-2.5-flash-image"` |
| `metadata.prompt_hash` | SHA-256 prefix | For cache invalidation |
| `metadata.generated_at` | ISO timestamp | When governance created it |
| `metadata.sd_id` | SD identifier | Links back to governance SD |

---

## Smallest Experiment (Future)

**Goal:** Validate Pattern A with minimal runtime changes.

**Scope:**
1. Add read-only field to Stage 2 or Stage 10 component
2. Fetch `sd.metadata.vision_discovery.visualization.url` via existing venture/SD linkage
3. Display image if URL exists, show placeholder if not
4. No writes, no regeneration, no new API calls

**Runtime changes required (NOT in this session):**
1. Add `governance_visualization` to artifact type enum
2. Create React component `<GovernanceVisualization sdId={...} />`
3. Add to relevant stage component(s)
4. Add artifact insert on stage completion (optional, for history)

**Estimated effort:** 2-4 hours of runtime work

---

## Boundary Rules (Hard)

| Rule | Description |
|------|-------------|
| Runtime MUST NOT call governance scripts | No `generate-vision-*.js` from EHG app |
| Runtime MUST NOT run LEO Protocol | LEO stays in EHG_Engineering |
| Runtime CAN read governance artifact URLs | Via SD metadata or copied reference |
| Runtime CAN have its own viz service (separate) | If needed, independently governed |

---

## Open Questions

1. **Linking ventures to SDs:** How does runtime know which SD's visualization to fetch?
   - Option: Store `sd_id` in `ventures.metadata`
   - Option: Query by venture name/title match

2. **Stale visualizations:** What if governance regenerates after runtime cached the URL?
   - Recommendation: Use `prompt_hash` for cache key; refresh if hash changes

3. **Multiple visualizations per SD:** Should we support version history?
   - Visualization already has `version` field; runtime could display latest only

---

## Next Steps (When Unparked)

1. Decide on primary insertion stage(s): 2-3 vs 10-11 vs 16
2. Confirm venture-to-SD linking strategy
3. Create runtime ticket/SD for implementation
4. Implement smallest experiment
5. Gather Chairman feedback on visualization placement
