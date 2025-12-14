# Merge Summary (Vision Discovery + Vision Visualization)

## What shipped (end-to-end)
This merge adds a persona-driven "Vision Discovery" layer that feeds the PRD pipeline, plus an optional "Vision Visualization" generator that produces and stores a UI mockup image for an approved vision brief.

The result: we stop missing Chairman KPIs (ROI/portfolio oversight needs) by institutionalizing persona capture + gating before PRDs are generated.

---

## Included commits (ordered newest → oldest)
- 19a7457 docs(vision-viz): Add provider documentation and preflight warning
- 79e9c82 fix(vision-viz): Use Gemini Nano Banana as primary provider
- 31ab5af feat(vision-viz): Add visualization generator for vision briefs
- 087c3e5 fix(vision-brief): Improve JSON parse reliability to >95%
- d565e82 fix(vision-brief): Fix async Supabase client and OpenAI params
- 213ca37 feat(vision-brief): Add Vision Discovery & Persona-Driven PRD Pipeline

---

## Key capabilities

### 1) Vision Discovery → Persona-driven PRDs (Governance: EHG_Engineering)
- PRD creation now **ingests persona payloads** from `strategic_directives_v2.metadata.vision_discovery`.
- PRD `stakeholders` is now populated (no longer perpetually empty).
- DESIGN / DATABASE sub-agent prompts receive persona context (when enabled).
- STORIES role assignment can use persona-based roles with safe fallback behavior.
- Optional soft-gate can require an **approved** vision brief before PRD creation.

### 2) Vision Brief Generator + Approval (CLI workflow)
Adds two scripts:
- `scripts/generate-vision-brief.js`
  - Produces `sd.metadata.vision_discovery` with `stakeholder_personas`, optional chairman_perspective, and `approval.status='draft'`
  - Safety latch: default is preview; requires `--confirm` to write; supports `--dry-run` and `--force`
- `scripts/approve-vision-brief.js`
  - Approve/reject flow that updates only metadata approval fields
  - Reject supports `--reject "reason"`

### 3) Vision Visualization Generator (Gemini primary, OpenAI fallback)
- `scripts/generate-vision-visualization.js` generates a UI mock image from the approved vision brief.
- Provider factory:
  - **Gemini "Nano Banana" primary**: `gemini-2.5-flash-image`
  - **OpenAI fallback**: DALL-E 3
- Stores image in Supabase Storage bucket `vision-briefs`
- Writes metadata to `sd.metadata.vision_discovery.visualization` including provider, url, timestamps, and prompt hash.
- Supports `--provider auto|gemini|openai`, `--dry-run`, `--confirm`, `--allow-draft`.

---

## Feature flags / controls (behavioral defaults)
- PERSONA_SOFT_GATE_ENABLED defaults to **false** (opt-in blocking gate)
- Persona ingestion / prompt injection / story role features are designed to be **null-safe** with fallbacks

---

## How to use (quickstart)

### Vision brief
1) Generate draft (preview by default)
```bash
node scripts/generate-vision-brief.js SD-XXX
node scripts/generate-vision-brief.js SD-XXX --dry-run
```

2) Write to DB
```bash
node scripts/generate-vision-brief.js SD-XXX --confirm
```

3) Approve (required if soft gate enabled)
```bash
node scripts/approve-vision-brief.js SD-XXX
```

### Visualization
Preview provider + prompt
```bash
node scripts/generate-vision-visualization.js SD-XXX --dry-run
```

Generate + upload (auto provider selection)
```bash
node scripts/generate-vision-visualization.js SD-XXX --confirm
```

Force Gemini
```bash
node scripts/generate-vision-visualization.js SD-XXX --confirm --provider gemini
```

Force OpenAI
```bash
node scripts/generate-vision-visualization.js SD-XXX --confirm --provider openai
```

---

## Acceptance checks (post-merge smoke)
- [x] Generate vision brief for a feature SD (preview, then --confirm)
- [x] Approve vision brief
- [ ] With PERSONA_SOFT_GATE_ENABLED=true:
      - PRD blocks if brief missing/draft (unless --skip-vision-brief)
      - PRD passes if brief approved
- [x] Generate visualization using provider=auto and verify Gemini selected when GEMINI_API_KEY is present
- [x] Confirm visualization_url saved into SD metadata and object exists in bucket

---

## Rollback / recovery
### Fast rollback (Git)
This is a set of additive script + pipeline changes. If rollback is needed:
- revert the commits (or revert the merge commit)
- no DB schema rollback required (metadata-only storage)

Known safe single-commit rollback for PR #5 hardening:
```bash
git revert 087c3e5
```

### Runtime safety
- If Gemini is misconfigured, `--provider auto` falls back to OpenAI with explicit logging.
- If AI JSON generation fails, persona generation falls back to defaults (with diagnostics).
