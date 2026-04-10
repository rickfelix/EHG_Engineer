# Feature Flag: EVA_WIREFRAME_GATING_ENABLED

**SD**: SD-EVA-FIX-WIREFRAME-CONTRACT-AND-SILENT-DEGRADATION-001
**Type**: Environment variable (boolean string)
**Default**: `false` (off)

## Purpose

Controls fail-closed behavior at Stage 15 (Design Studio) and Stage 17 (Blueprint Review) in the EVA venture pipeline. When enabled, wireframe generation failures are treated as hard errors that stop the pipeline, rather than being silently demoted to ASCII fallback.

## Affected Components

| Component | File | Behavior when `true` |
|-----------|------|---------------------|
| S15 schema | `lib/eva/stage-templates/stage-15.js` | `wireframes` field marked required; parse failures throw instead of falling back |
| S17 blueprint review | `lib/eva/stage-templates/analysis-steps/stage-17-blueprint-review.js` | Blocks if `stitch_project` artifact missing from S15 |
| S17 export hook | `lib/eva/stage-execution-worker.js` | Fails-closed if no stitch_project or Stitch unavailable |
| Wireframe gating check | `lib/eva/stage-templates/analysis-steps/stage-17-blueprint-review.js:277` | Wireframes move from supplementary to required |

## Enablement Criteria

Enable this flag **only after** all of the following are verified in staging:

1. `parseJSON` repair layer is deployed (handles Gemini anti-patterns)
2. S15 prompt emits `ascii_layout` as array-of-strings (not multiline string)
3. S17 precondition check is deployed
4. `ehg_alerts` rows are being created for fallback events
5. At least one full Stage 0→S17 pipeline run succeeds with the flag enabled

## Staged Rollout Plan

1. **Phase 1** (default): Flag off. All changes deployed but inactive. Existing fallback behavior preserved.
2. **Phase 2**: Enable per-venture in staging. Run 3 test ventures through full pipeline.
3. **Phase 3**: Enable globally in production. Monitor `ehg_alerts` for 48 hours.
4. **Phase 4**: If no unexpected alerts, consider removing the flag and making fail-closed the permanent default.

## Rollback Procedure

Set `EVA_WIREFRAME_GATING_ENABLED=false` (or remove the env var). No data migration or code rollback required. The pipeline immediately reverts to silent-fallback behavior.

## Configuration

```bash
# Enable in .env
EVA_WIREFRAME_GATING_ENABLED=true

# Disable (default)
EVA_WIREFRAME_GATING_ENABLED=false
# or simply omit the variable
```
