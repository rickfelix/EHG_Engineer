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
| `POST` | `/api/stage17/:ventureId/archetypes/resume` | Resumes interrupted generation; idempotent via `s17_session_state.metadata.resume_lock` (10-min TTL) — see §5.3 | `server/routes/stage17.js` (ARM F) |
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
  "metadata": {
    "screenId": "<screenId>",
    "has_failed_variants": "boolean — true if any variant exhausted retries (ARM C)",
    "failed_variant_count": "number — count of s17_variant_failed siblings (ARM C)"
  }
}
```

**ARM C metadata flags** (`has_failed_variants` + `failed_variant_count`) are written by `archetype-generator.js` whenever bounded retry (ARM B) writes one or more `s17_variant_failed` siblings for the same screen. Frontend (ARM D, PR4) reads these flags to decide whether to surface the "regenerate failed variants" affordance — see §5.1 for the contrast against the per-variant WIP marker pattern.

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

- `s17_variant_wip` — per-variant checkpoints, soft-deleted after `s17_archetypes` is assembled (`archetype-generator.js`)
- `s17_session_state` — generation-progress log (`archetype-generator.js`)
- `s17_preview` — preview-mode artifact (Landing + Dashboard for top 2 strategies; same content shape as `s17_archetypes`)
- `stage_17_refined` — Pass 1 output (4 refined variants; one row per variant)
- `stage_17_approved_mobile` / `stage_17_approved_desktop` — Pass 2 final approvals
- `s17_variant_failed` — per-variant failure marker written when bounded retry exhausts (SD-LEO-INFRA-STAGE-ARCHETYPE-GENERATION-001 ARM B). Migration `20260426_add_s17_heartbeat_and_variant_failed.sql`.
- `s17_heartbeat` — 30s liveness signal during generation (SD-LEO-INFRA-STAGE-ARCHETYPE-GENERATION-001 ARM E). Same migration.

### 5.1 Failure-marker pattern: per-screen vs per-variant

Two distinct artifact-shapes carry "this thing didn't fully complete" semantics. They are NOT redundant — each lives at a different granularity and serves a different consumer.

| Marker | Granularity | Path | Consumer | Lifetime |
|---|---|---|---|---|
| `s17_variant_wip` (PAT-PERSIST-CHECKPOINT-001) | Per-variant **success-in-progress** | `archetype-generator.js` writes after each successful variant; cleaned up after the per-screen `s17_archetypes` artifact assembles | The generator itself, on resume — picks up where a prior interrupted run left off | Transient (cleaned on `s17_archetypes` write) |
| `s17_variant_failed` (ARM B) | Per-variant **terminal failure** | `archetype-generator.js` writes after bounded retry exhausts on a single variant; never cleaned up by the generator | Frontend regenerate-failed-variants affordance (ARM D, PR4); resume endpoint (ARM F, PR3) decides whether to retry just the failed variants | Persistent until manually cleared or a successful regenerate writes a fresh per-screen artifact |
| `metadata.has_failed_variants` on `s17_archetypes` (ARM C) | Per-screen **summary flag** | Set on the screen-level archetypes write when at least one `s17_variant_failed` sibling exists | Frontend banner / regenerate button — single read off the same row the screen already loads | Lives with the `s17_archetypes` row |

**Why per-screen + per-variant + WIP all coexist:** the per-screen flag is the cheap-read for the UI (the frontend already pulls `s17_archetypes` once); the per-variant `s17_variant_failed` rows carry the diagnostic detail (error name, attempts, callerLabel) needed to decide retry vs escalate; and the WIP rows handle the orthogonal concern of *successful* in-progress variants surviving a crash. ARM C does NOT duplicate ARM B — it's a denormalized summary of ARM B for the UI's read-cost, written in the same transaction so they cannot diverge.

### 5.2 `s17_heartbeat` TTL + pruning policy

Heartbeats are written every 30s during active generation. The `writeArtifact` dedup logic UPDATEs the same row each tick (one row per active venture), so steady-state row count is bounded. A maintenance job (`scripts/maintenance/prune-s17-heartbeats.mjs`, ARM F TR-2) prunes rows whose `metadata.ttlExpiresAt` is in the past — TTL defaults to 7 days, configurable via the `ttlDays` option to `startHeartbeatWriter()`.

The TTL exists for the failure mode where a venture's generation crashed without `stop()` running (e.g. process kill -9): the row is left behind with no path to deletion via the normal `cleanupWipVariants` flow. After 7 days it is unconditionally garbage-collected by the maintenance job. Run manually as `node scripts/maintenance/prune-s17-heartbeats.mjs` (or `--dry-run` to inspect first).

### 5.3 Resume endpoint idempotency (`s17_session_state.metadata.resume_lock`)

`POST /api/stage17/:ventureId/archetypes/resume` (ARM F) claims a 10-minute lock on the venture's existing `s17_session_state` artifact before spawning the generator:

```json
"metadata": {
  "resume_lock": {
    "token": "<uuid>",
    "expires_at": "<ISO 8601 — now + 10 min>",
    "acquired_at": "<ISO 8601>"
  }
}
```

A second concurrent call within the TTL receives HTTP 409 `{code: 'RESUME_LOCKED', existingExpiresAt}`. After the generator's `.finally()` runs, the lock is released. Crashed jobs (no release) recover automatically once the TTL elapses — the next caller's `acquireResumeLock` overwrites the expired lock.

This pattern was chosen over a `job_id` UNIQUE constraint to avoid a schema migration: the `s17_session_state` row already exists per-venture (`writeArtifact` dedup ensures one row), and lock semantics are exactly what double-fire prevention needs.

Helpers: `lib/eva/stage-17/resume-lock.js` — `acquireResumeLock(supabase, ventureId, opts)` → `{acquired, token, expiresAt}` or `{acquired:false, reason:'LOCKED', existingExpiresAt}`; `releaseResumeLock(supabase, ventureId, token)` → `{released}` (token-mismatch is a no-op, defensive against late `.finally()`).

## 6. Historical drift cases (training set for Arm D fingerprint)

| QF | PR | Class | Symptom |
|----|----|-------|---------|
| QF-20260425-423 | rickfelix/ehg#525 | Schema mismatch | Frontend used `.maybeSingle()` on multi-row table without `metadata.screenId` discriminator; expected multi-screen object but backend ships per-screen rows |
| QF-20260425-130 | rickfelix/ehg#526 | Hardcoded count + dropped buttons | `EXPECTED_VARIANTS_PER_SCREEN = 6` was stale (backend ships 4); Copy Prompt + Download HTML buttons silently dropped during refactor |
| QF-20260425-422 | rickfelix/ehg#527 | Stale URL prefix | Frontend still calling `/api/stitch/*` after backend migrated to `/api/stage17/*` |

Each of these would have been caught pre-merge by Arms B + C if those gates had existed.
