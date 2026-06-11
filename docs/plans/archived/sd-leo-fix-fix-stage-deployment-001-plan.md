<!-- Archived from: scripts/one-off/_plan-resolver.md -->
<!-- SD Key: SD-LEO-FIX-FIX-STAGE-DEPLOYMENT-001 -->
<!-- Archived at: 2026-06-07T15:26:30.043Z -->

# Fix Stage 21 deployment-URL resolver reading a non-existent column (resource_url) causing false NO_DEPLOYMENT_URL skips for ALL deployed ventures

## Type
fix

## Priority
high

## Summary
`resolveDeploymentUrl()` in `lib/eva/stage-templates/analysis-steps/stage-21-visual-assets.js` (L129-161) resolves a venture's live deployment URL to feed the Stage 21 (Visual Assets) precondition check. It SELECTs `resource_url, metadata, status` (L139) and reads `row.resource_url` (L133) — but `venture_resources` has NO `resource_url` column. The real column is `deployment_url`. As a result the resolver always returns `''`, the S21 preflight reports `venture_resources.deployment_url` missing, and S21 skips with `NO_DEPLOYMENT_URL` even for ventures that have a valid live deployment. Because `resource_url` is universally absent, this false-skips Stage 21 for EVERY deployed venture, blocking the entire post-build pipeline (S21->22->23...).

## Evidence (data-verified)
- DataDistill (venture 510177ba) `replit_deployment` row holds `deployment_url=https://3edb078c-...worf.replit.dev/` (status=active); it has artifacts through Stage 23.
- Live call of the actual function: `resolveDeploymentUrl(sb, '510177ba...')` returns `""`. Reading `deployment_url` on the same row returns the real URL.
- venture_resources columns: id, venture_id, resource_type, resource_identifier, provider, status, metadata, created_at, updated_at, repo_url, deployment_url — NO resource_url.

## Root Cause
Column-name mismatch: code reads `resource_url`; the column is `deployment_url`.

## Scope
Read-side only, single file `lib/eva/stage-templates/analysis-steps/stage-21-visual-assets.js`:
- L139 `.select('resource_url, metadata, status')` -> `.select('deployment_url, metadata, status')`
- L133 `const url = row.resource_url || ...` -> `const url = row.deployment_url || row.metadata?.deployment_url || row.metadata?.url || '';`
Preserve the existing `ventures.deployment_url` fallback. No schema change.

## Success Criteria
- `resolveDeploymentUrl(sb, ventureId)` returns the populated `venture_resources.deployment_url` for a deployed venture (regression test using a fixture/live row).
- S21 preflight for a deployed venture with S11+S17 artifacts no longer reports `venture_resources.deployment_url` missing.
- Existing behavior preserved: genuinely-undeployed ventures still resolve to `''` and skip honestly.
- Unit test pins the column name so the regression cannot silently return.

## Linkage
Found during DataDistill pilot chairman-lens walk (post SD-LEO-FIX-FIX-STAGE-VISUAL-001, which fixed the separate S11/S17 param-key resolution). Sibling: the S21 skip-churn/mislabel SD (replit-reentry-adapter.js:219).
