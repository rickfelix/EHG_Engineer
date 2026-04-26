# Stage 17 Cross-Repo Contracts

**Status**: Authoritative (single source of truth)
**Owner**: @rickfelix (CODEOWNERS-enforced)
**Consumers**: `EHG_Engineer` (writes), `EHG` (reads)
**Drift detection**: `scripts/audit-stage17-urls.mjs` + `.github/workflows/stage17-contract-smoke.yml`

This document is the contract that the Stage 17 backend (EHG_Engineer) **writes** and the Stage 17 frontend (EHG) **reads**. Any change to the backend artifact shape, the variant shape, or the `/api/stage17/*` endpoint surface MUST be paired with an update to this document AND the consuming frontend.

Three QFs (PR rickfelix/ehg#525, #526, #527) shipped on 2026-04-25/26 traced to violations of this paired-update rule. This contract + the audit script + the CI workflow exist to prevent recurrence.

## 1. Endpoint catalog

All endpoints are mounted under `/api/stage17` (`server/index.js:168`) and require auth (`requireAuth` middleware). Routes are defined in `server/routes/stage17.js`:

| Method | Path | Purpose | Source line |
|--------|------|---------|-------------|
| `POST` | `/api/stage17/:ventureId/strategy-recommendation` | Returns ranked design strategies | `server/routes/stage17.js:45` |
| `POST` | `/api/stage17/:ventureId/archetypes` | Generates 4 HTML archetypes per screen | `server/routes/stage17.js:80` |
| `POST` | `/api/stage17/:ventureId/archetypes/cancel` | Cancels in-flight archetype generation | `server/routes/stage17.js:129` |
| `POST` | `/api/stage17/:ventureId/select` | Pass 1 selection (2 archetypes → 4 refined) | `server/routes/stage17.js:149` |
| `POST` | `/api/stage17/:ventureId/refine` | Pass 2 selection (approve final variant) | `server/routes/stage17.js:179` |
| `POST` | `/api/stage17/:ventureId/approve` | Auto-advance chairman gate when all screens approved | `server/routes/stage17.js:243` |
| `POST` | `/api/stage17/:ventureId/qa` | Run QA rubric | `server/routes/stage17.js:282` |
| `POST` | `/api/stage17/:ventureId/upload` | Upload approved designs to GitHub | `server/routes/stage17.js:301` |

The `:ventureId` param is validated as UUID (`isValidUuid`); endpoints return HTTP 400 `{error, code:'INVALID_VENTURE_ID'}` on malformed input.

Routes that **do not exist** (intentional dead-URL ledger): `/api/stage17/seed-repo` and any `/api/stitch/*` path. The `/api/stitch/*` surface was removed by `SD-LEO-ORCH-REPLACE-GOOGLE-STITCH-001`. Any caller still referencing these is a contract violation.

## 2. `s17_archetypes` artifact shape

The backend writes ONE `venture_artifacts` row per screen (NOT one row containing all screens), discriminated by `metadata.screenId`. Write site: `lib/eva/stage-17/archetype-generator.js:921-927`.

### Row shape (per `venture_artifacts` schema)

```json
{
  "venture_id": "<uuid>",
  "lifecycle_stage": 17,
  "artifact_type": "s17_archetypes",
  "title": "<screenTitle> — 4 Archetypes",
  "content": "<JSON.stringify of content shape below>",
  "is_current": true,
  "metadata": { "screenId": "<screenId>" }
}
```

### `content` shape (parsed JSON)

```json
{
  "screenName": "string — human-readable screen name",
  "pageType": "string — classified by page-type-classifier.js",
  "deviceType": "mobile | desktop",
  "variants": [
    /* 4 variants — see Section 3 */
  ]
}
```

### Frontend read pattern (canonical)

```typescript
// EHG/src/components/stage17/Stage17ReviewPanel.tsx:84-121
const { data: art } = await supabase
  .from('venture_artifacts')
  .select('id, content')
  .eq('venture_id', ventureId)
  .eq('artifact_type', 's17_archetypes')
  .eq('is_current', true)
  .contains('metadata', { screenId })  // ← discriminator
  .maybeSingle();

const screenData = JSON.parse(art.content);
// screenData.variants is the array of 4 variants
```

**Anti-pattern (caused QF-20260425-423 / PR #525)**: querying without the `.contains('metadata', { screenId })` discriminator and expecting a multi-screen object indirection like `allScreens[screenId]`. The schema is per-screen; there is no parent object.

## 3. Variant shape

Each entry of `content.variants[]` (Section 2) has the following shape. Consumers MUST treat all fields beyond `variantIndex` and `html` as **optional** for forward compatibility. Defined at `archetype-generator.js:892` (write site) and `Stage17ReviewPanel.tsx:102-110` (read site).

```json
{
  "variantIndex": "number (1-4) — display order",
  "layoutDescription": "string — short layout name (first word becomes the variant title suffix)",
  "html": "string — fully-rendered HTML for iframe srcdoc",
  "prompt": "string? — user prompt that produced this variant (Copy Prompt button)",
  "systemPrompt": "string? — system prompt (Copy Prompt button)",
  "strategy_name": "string? — strategy filter that scoped this variant"
}
```

### Variant count

Backend produces exactly **4** variants per screen (`SD-MAN-REFAC-S17-SIMPLIFY-PIPELINE-001`). The frontend defines `EXPECTED_VARIANTS_PER_SCREEN = 4` at `Stage17ReviewPanel.tsx:45`. Any hardcoded `6` in skeleton/polling logic is stale (caused QF-20260425-130 / PR #526).

### Optional fields = optional UX

`prompt` and `systemPrompt` were dropped during `SD-MAN-REFAC-S17-SIMPLIFY-FRONTEND-001` and restored by QF-20260425-130. The Copy Prompt button MUST disable itself (not error) when both are missing — see `Stage17ReviewPanel.tsx:404-405`.

## 4. Versioning + change protocol

This contract is **unversioned** — there is one current shape, and the backend + frontend ship in lockstep via the paired-update gate below. If breaking changes accumulate, add a `contractVersion` field to the `content` shape and use it for migration windows; do not branch consumers without it.

### Paired-update gate (CODEOWNERS + CI)

Any PR that modifies one of these paths MUST also touch this contract document:

- `server/routes/stage17.js`
- `lib/eva/stage-17/**`
- `lib/eva/stage-templates/stage-17.js`

Enforcement:
- `.github/CODEOWNERS` flags the change to @rickfelix (Arm F)
- `.github/workflows/stage17-contract-smoke.yml` greps the PR diff for this file path; missing → fail closed (Arm C)
- `scripts/audit-stage17-urls.mjs` validates that every `/api/stage17/*` URL string in the EHG repo matches a registered route (Arm B)

### Frontend file inventory (URL consumers)

These EHG files reference `/api/stage17/*` URLs. Touching the backend route surface requires verifying each:

- `EHG/src/components/stage17/Stage17ReviewPanel.tsx` — `/select`, `/refine`
- `EHG/src/components/stage17/Stage17StrategySelector.tsx` — `/strategy-recommendation`
- `EHG/src/components/stages/Stage17BlueprintReview.tsx` — `/archetypes`, `/archetypes/cancel`
- `EHG/src/components/stages/shared/BuildMethodSelector.tsx` — `/seed-repo` ⚠️ **DEAD URL** (no matching backend route as of 2026-04-26; candidate for follow-up QF)

Add new files to this inventory when introduced.

## 5. Companion artifacts (informational)

The following artifact types are written by the same pipeline but not part of the read contract above. Documented for completeness:

- `s17_variant_wip` — per-variant checkpoints, soft-deleted after `s17_archetypes` is assembled (`archetype-generator.js:886`)
- `s17_session_state` — generation-progress log (`archetype-generator.js:706`)
- `s17_preview` — preview-mode artifact (Landing + Dashboard for top 2 strategies; same content shape as `s17_archetypes`)
- `stage_17_refined` — Pass 1 output (4 refined variants; one row per variant)
- `stage_17_approved_mobile` / `stage_17_approved_desktop` — Pass 2 final approvals

## 6. Historical drift cases (training set for Arm D fingerprint)

| QF | PR | Class | Symptom |
|----|----|-------|---------|
| QF-20260425-423 | rickfelix/ehg#525 | Schema mismatch | Frontend used `.maybeSingle()` on multi-row table without `metadata.screenId` discriminator; expected multi-screen object but backend ships per-screen rows |
| QF-20260425-130 | rickfelix/ehg#526 | Hardcoded count + dropped buttons | `EXPECTED_VARIANTS_PER_SCREEN = 6` was stale (backend ships 4); Copy Prompt + Download HTML buttons silently dropped during refactor |
| QF-20260425-422 | rickfelix/ehg#527 | Stale URL prefix | Frontend still calling `/api/stitch/*` after backend migrated to `/api/stage17/*` |

Each of these would have been caught pre-merge by Arms B + C if those gates had existed.
