# Dual-detection cluster audit — SD-LEO-INFRA-CONSOLIDATE-DUAL-DETECTION-001

Generated (deterministic): 2026-05-28T00:00:00Z
Repo: EHG_Engineer
Git HEAD: 0410b70d33
Files scanned: 2973

## Summary

| Cluster | Description | Total | MIGRATE | KEEP_META_ONLY | FOLLOW_UP | EXCLUDE |
|---------|-------------|------:|--------:|---------------:|----------:|--------:|
| A | SD-type detection | 98 | 14 | 7 | 39 | 38 |
| B | Claim ownership detection | 72 | 26 | 0 | 22 | 24 |
| C | Gate-skip detection | 15 | 3 | 0 | 6 | 6 |
| **Total** | — | **185** | **43** | — | **67** | — |

**This SD ships MIGRATE + KEEP_METADATA_ONLY.** MIGRATE_FOLLOW_UP sites file as a follow-up SD/QF after this one merges. EXCLUDE_OUT_OF_SCOPE sites are not touched.

## Cluster A: SD-type detection

Multiple call sites classify an SD's type by reading sd_type column, metadata.is_* flags, sd_key prefix, or LEGITIMATE_NO_VENTURE_SD_TYPES set. Migration target: `lib/sd/type-detection.js` (FR-2).

| Rule | File | Line | Classification | Snippet |
|------|------|-----:|----------------|---------|
| A.2 | `lib/analysis/scope-complexity-scorer.js` | 156 | MIGRATE_FOLLOW_UP | `const isOrchestrator = parentSd.sd_type === 'orchestrator' \|\|` |
| A.4 | `lib/analysis/scope-complexity-scorer.js` | 157 | MIGRATE_FOLLOW_UP | `parentSd.metadata?.is_orchestrator === true \|\|` |
| A.1 | `lib/drain-orchestrator.mjs` | 143 | MIGRATE_FOLLOW_UP | `const typeMatch = sd.sd_type === 'migration';` |
| A.2 | `lib/eva-support/sd-blocker-surface.js` | 146 | MIGRATE_FOLLOW_UP | `if (parentRow.sd_type === 'orchestrator') return true; // orchestrator children activate independently` |
| A.7 | `lib/eva/bridge/sd-router.js` | 40 | EXCLUDE_OUT_OF_SCOPE | `export const LEGITIMATE_NO_VENTURE_SD_TYPES = new Set([` |
| A.7 | `lib/eva/bridge/sd-router.js` | 53 | EXCLUDE_OUT_OF_SCOPE | `if (sd_type && LEGITIMATE_NO_VENTURE_SD_TYPES.has(sd_type)) return true;` |
| A.7 | `lib/eva/bridge/sd-router.js` | 80 | EXCLUDE_OUT_OF_SCOPE | `Array.from(LEGITIMATE_NO_VENTURE_SD_TYPES).join(', ') +` |
| A.2 | `lib/governance/guardrail-registry.js` | 183 | MIGRATE_FOLLOW_UP | `const isOrchestrator = childrenCount >= 3 \|\| sdData.sd_type === 'orchestrator';` |
| A.3 | `lib/handoff/parent-detection.js` | 36 | EXCLUDE_OUT_OF_SCOPE | `const metadataFlag = sd.metadata?.is_parent === true;` |
| A.3 | `lib/handoff/parent-detection.js` | 66 | EXCLUDE_OUT_OF_SCOPE | `return sd?.metadata?.is_parent === true;` |
| A.7 | `lib/sd/type-detection.js` | 19 | EXCLUDE_OUT_OF_SCOPE | `*   - lib/eva/bridge/sd-router.js — LEGITIMATE_NO_VENTURE_SD_TYPES Set` |
| A.7 | `lib/sd/type-detection.js` | 32 | EXCLUDE_OUT_OF_SCOPE | `import { LEGITIMATE_NO_VENTURE_SD_TYPES } from '../eva/bridge/sd-router.js';` |
| A.1 | `lib/sd/type-detection.js` | 53 | EXCLUDE_OUT_OF_SCOPE | `*   - sd.sd_type === 'orchestrator'` |
| A.2 | `lib/sd/type-detection.js` | 53 | EXCLUDE_OUT_OF_SCOPE | `*   - sd.sd_type === 'orchestrator'` |
| A.4 | `lib/sd/type-detection.js` | 54 | EXCLUDE_OUT_OF_SCOPE | `*   - sd.metadata?.is_orchestrator === true` |
| A.3 | `lib/sd/type-detection.js` | 55 | EXCLUDE_OUT_OF_SCOPE | `*   - sd.metadata?.is_parent === true   (legacy parent-orchestrator flag)` |
| A.1 | `lib/sd/type-detection.js` | 68 | EXCLUDE_OUT_OF_SCOPE | `sd.sd_type === 'orchestrator' \|\|` |
| A.2 | `lib/sd/type-detection.js` | 68 | EXCLUDE_OUT_OF_SCOPE | `sd.sd_type === 'orchestrator' \|\|` |
| A.4 | `lib/sd/type-detection.js` | 69 | EXCLUDE_OUT_OF_SCOPE | `sd.metadata?.is_orchestrator === true \|\|` |
| A.3 | `lib/sd/type-detection.js` | 70 | EXCLUDE_OUT_OF_SCOPE | `sd.metadata?.is_parent === true` |
| A.1 | `lib/sd/type-detection.js` | 100 | EXCLUDE_OUT_OF_SCOPE | `sd.sd_type === 'orchestrator' \|\|` |
| A.2 | `lib/sd/type-detection.js` | 100 | EXCLUDE_OUT_OF_SCOPE | `sd.sd_type === 'orchestrator' \|\|` |
| A.4 | `lib/sd/type-detection.js` | 101 | EXCLUDE_OUT_OF_SCOPE | `sd.metadata?.is_orchestrator === true \|\|` |
| A.3 | `lib/sd/type-detection.js` | 102 | EXCLUDE_OUT_OF_SCOPE | `sd.metadata?.is_parent === true` |
| A.1 | `lib/sd/type-detection.js` | 112 | EXCLUDE_OUT_OF_SCOPE | `*   - sd.sd_type === 'venture'  (rare; most ventures use other sd_types)` |
| A.2 | `lib/sd/type-detection.js` | 112 | EXCLUDE_OUT_OF_SCOPE | `*   - sd.sd_type === 'venture'  (rare; most ventures use other sd_types)` |
| A.5 | `lib/sd/type-detection.js` | 113 | EXCLUDE_OUT_OF_SCOPE | `*   - sd.metadata?.is_venture === true` |
| A.1 | `lib/sd/type-detection.js` | 126 | EXCLUDE_OUT_OF_SCOPE | `sd.sd_type === 'venture' \|\|` |
| A.2 | `lib/sd/type-detection.js` | 126 | EXCLUDE_OUT_OF_SCOPE | `sd.sd_type === 'venture' \|\|` |
| A.5 | `lib/sd/type-detection.js` | 127 | EXCLUDE_OUT_OF_SCOPE | `sd.metadata?.is_venture === true` |
| A.7 | `lib/sd/type-detection.js` | 141 | EXCLUDE_OUT_OF_SCOPE | `*   - sd.sd_type is in LEGITIMATE_NO_VENTURE_SD_TYPES (from lib/eva/bridge/sd-router.js)` |
| A.7 | `lib/sd/type-detection.js` | 148 | EXCLUDE_OUT_OF_SCOPE | `return LEGITIMATE_NO_VENTURE_SD_TYPES.has(sd.sd_type);` |
| A.3 | `lib/sd/type-detection.js` | 168 | EXCLUDE_OUT_OF_SCOPE | `if (sd.metadata?.is_orchestrator === true \|\| sd.metadata?.is_parent === true) {` |
| A.4 | `lib/sd/type-detection.js` | 168 | EXCLUDE_OUT_OF_SCOPE | `if (sd.metadata?.is_orchestrator === true \|\| sd.metadata?.is_parent === true) {` |
| A.1 | `lib/utils/sd-type-validation.js` | 259 | EXCLUDE_OUT_OF_SCOPE | `requiresDatabase: sd.sd_type === 'database' \|\| (sd.scope \|\| '').toLowerCase().includes('schema'),` |
| A.1 | `lib/utils/sd-type-validation.js` | 262 | EXCLUDE_OUT_OF_SCOPE | `requiresDesign: sd.sd_type === 'feature' && ((sd.scope \|\| '').toLowerCase().includes('ui') \|\|` |
| A.2 | `lib/utils/sd-type-validation.js` | 262 | EXCLUDE_OUT_OF_SCOPE | `requiresDesign: sd.sd_type === 'feature' && ((sd.scope \|\| '').toLowerCase().includes('ui') \|\|` |
| A.1 | `scripts/batch-enrich-draft-sds.js` | 232 | MIGRATE_FOLLOW_UP | `if (sd.sd_type === 'fix' \|\| sd.sd_type === 'bugfix') {` |
| A.2 | `scripts/batch-enrich-draft-sds.js` | 232 | MIGRATE_FOLLOW_UP | `if (sd.sd_type === 'fix' \|\| sd.sd_type === 'bugfix') {` |
| A.1 | `scripts/batch-enrich-draft-sds.js` | 236 | MIGRATE_FOLLOW_UP | `} else if (sd.sd_type === 'infrastructure') {` |
| A.2 | `scripts/batch-enrich-draft-sds.js` | 236 | MIGRATE_FOLLOW_UP | `} else if (sd.sd_type === 'infrastructure') {` |
| A.1 | `scripts/batch-enrich-draft-sds.js` | 240 | MIGRATE_FOLLOW_UP | `} else if (sd.sd_type === 'refactor') {` |
| A.1 | `scripts/batch-enrich-draft-sds.js` | 279 | MIGRATE_FOLLOW_UP | `impact: `${sd.sd_type === 'fix' ? 'Fix' : 'Improve'} ${extractPurpose(title)} in ${dir}`` |
| A.2 | `scripts/batch-enrich-draft-sds.js` | 279 | MIGRATE_FOLLOW_UP | `impact: `${sd.sd_type === 'fix' ? 'Fix' : 'Improve'} ${extractPurpose(title)} in ${dir}`` |
| A.1 | `scripts/batch-enrich-draft-sds.js` | 286 | MIGRATE_FOLLOW_UP | `if (sd.sd_type === 'fix' \|\| sd.sd_type === 'bugfix') {` |
| A.2 | `scripts/batch-enrich-draft-sds.js` | 286 | MIGRATE_FOLLOW_UP | `if (sd.sd_type === 'fix' \|\| sd.sd_type === 'bugfix') {` |
| A.1 | `scripts/batch-enrich-draft-sds.js` | 320 | MIGRATE_FOLLOW_UP | `if (sd.sd_type === 'fix' \|\| sd.sd_type === 'bugfix') {` |
| A.2 | `scripts/batch-enrich-draft-sds.js` | 320 | MIGRATE_FOLLOW_UP | `if (sd.sd_type === 'fix' \|\| sd.sd_type === 'bugfix') {` |
| A.1 | `scripts/claim-orchestrator-for-rollup.mjs` | 50 | MIGRATE_FOLLOW_UP | `let isOrchestrator = sd.sd_type === 'orchestrator';` |
| A.2 | `scripts/claim-orchestrator-for-rollup.mjs` | 50 | MIGRATE_FOLLOW_UP | `let isOrchestrator = sd.sd_type === 'orchestrator';` |
| A.1 | `scripts/hooks/pre-tool-enforce.cjs` | 818 | MIGRATE_FOLLOW_UP | `if (sd && sd.sd_type === 'bugfix') {` |
| A.8 | `scripts/lead-dossier.js` | 248 | MIGRATE_FOLLOW_UP | `const hasComplexType = ['orchestrator'].includes(sd.sd_type) \|\| sd.category === 'Orchestrator';` |
| A.1 | `scripts/lead-dossier.js` | 305 | MIGRATE_FOLLOW_UP | `: sd.sd_type === 'infrastructure' ? 'MEDIUM'` |
| A.2 | `scripts/lead-dossier.js` | 305 | MIGRATE_FOLLOW_UP | `: sd.sd_type === 'infrastructure' ? 'MEDIUM'` |
| A.7 | `scripts/leo-create-sd.js` | 53 | MIGRATE_FOLLOW_UP | `import { LEGITIMATE_NO_VENTURE_SD_TYPES } from '../lib/eva/bridge/sd-router.js';` |
| A.7 | `scripts/leo-create-sd.js` | 1762 | MIGRATE_FOLLOW_UP | `// engineering/governance LEO work (sd_type in LEGITIMATE_NO_VENTURE_SD_TYPES, or` |
| A.7 | `scripts/leo-create-sd.js` | 1767 | MIGRATE_FOLLOW_UP | `const isNoVentureWork = LEGITIMATE_NO_VENTURE_SD_TYPES.has(sdData.sd_type)` |
| A.2 | `scripts/leo-orchestrator/validation.js` | 44 | MIGRATE | `return currentSD && (currentSD.priority \|\| currentSD.sd_type === 'infrastructure');` |
| A.3 | `scripts/lib/handoff-preflight.js` | 163 | KEEP_METADATA_ONLY | `const isParentOrchestrator = sd.metadata?.is_parent === true;` |
| A.3 | `scripts/lib/handoff-preflight.js` | 294 | KEEP_METADATA_ONLY | `const isParentOrchestrator = sd.metadata?.is_parent === true;` |
| A.1 | `scripts/modules/auto-trigger-stories.mjs` | 398 | MIGRATE_FOLLOW_UP | `if (sd.sd_type === 'database' && prd.metadata?.schema) {` |
| A.3 | `scripts/modules/decomposition-gate.js` | 107 | KEEP_METADATA_ONLY | `if (sd.metadata?.is_parent === true \|\| sd.metadata?.requires_children === true) {` |
| A.3 | `scripts/modules/handoff/executors/plan-to-exec/parent-orchestrator.js` | 133 | MIGRATE | `return sd?.metadata?.is_parent === true;` |
| A.6 | `scripts/modules/handoff/executors/plan-to-lead/gates/smoke-test-evidence.js` | 44 | MIGRATE | `if (sdKey.startsWith('SD-LEARN-')) return false;` |
| A.6 | `scripts/modules/handoff/executors/plan-to-lead/index.js` | 110 | MIGRATE | `if (sdKey.startsWith('SD-LEARN-')) return;` |
| A.2 | `scripts/modules/handoff/orchestrator-completion-guardian.js` | 77 | KEEP_METADATA_ONLY | `// 1. sd_type === 'orchestrator'` |
| A.2 | `scripts/modules/handoff/orchestrator-completion-guardian.js` | 80 | KEEP_METADATA_ONLY | `const isOrchestratorType = parent.sd_type === 'orchestrator';` |
| A.3 | `scripts/modules/handoff/orchestrator-completion-guardian.js` | 81 | KEEP_METADATA_ONLY | `const hasIsParentFlag = parent.metadata?.is_parent === true;` |
| A.1 | `scripts/modules/handoff/verifiers/lead-to-plan/prd-readiness.js` | 286 | MIGRATE | `if (sd.sd_type === 'documentation') return result;` |
| A.2 | `scripts/modules/handoff/verifiers/lead-to-plan/prd-readiness.js` | 286 | MIGRATE | `if (sd.sd_type === 'documentation') return result;` |
| A.3 | `scripts/modules/handoff/verifiers/plan-to-exec/PlanToExecVerifier.js` | 84 | MIGRATE | `const isParentOrchestrator = sd.metadata?.is_parent === true;` |
| A.1 | `scripts/modules/human-verification-validator.js` | 392 | MIGRATE_FOLLOW_UP | `if (sd.sd_type === 'database') {` |
| A.1 | `scripts/modules/human-verification-validator.js` | 398 | MIGRATE_FOLLOW_UP | `if (sd.sd_type === 'security') {` |
| A.2 | `scripts/modules/implementation-fidelity/sections/data-flow-alignment.js` | 109 | MIGRATE_FOLLOW_UP | `if (sd?.sd_type === 'feature' && !hasUIScope) {` |
| A.2 | `scripts/modules/implementation-fidelity/sections/data-flow-alignment.js` | 136 | MIGRATE_FOLLOW_UP | `if (sd?.sd_type === 'feature' && (validation.details.target_application \|\| null) === 'EHG') {` |
| A.2 | `scripts/modules/implementation-fidelity/sections/design-fidelity.js` | 108 | MIGRATE_FOLLOW_UP | `if (sd?.sd_type === 'feature' && !hasUIScope) {` |
| A.2 | `scripts/modules/implementation-fidelity/sections/design-fidelity.js` | 138 | MIGRATE_FOLLOW_UP | `if (sd?.sd_type === 'feature' && (validation.details.target_application \|\| null) === 'EHG') {` |
| A.2 | `scripts/modules/leo-orchestrator/requirement-validators.js` | 118 | MIGRATE | `return currentSD && (currentSD.priority \|\| currentSD.sd_type === 'infrastructure');` |
| A.2 | `scripts/modules/orchestrator-validation.mjs` | 152 | MIGRATE_FOLLOW_UP | `return currentSD && (currentSD.priority \|\| currentSD.sd_type === 'infrastructure');` |
| A.2 | `scripts/modules/orchestrator/phase-requirements.js` | 95 | MIGRATE | `return currentSD && (currentSD.priority \|\| currentSD.sd_type === 'infrastructure');` |
| A.2 | `scripts/modules/parent-orchestrator-handler.js` | 57 | MIGRATE | `// sd_type === 'orchestrator', DB-children) now lives inside the canonical helper.` |
| A.1 | `scripts/modules/sd-next/SDNextSelector.js` | 415 | MIGRATE_FOLLOW_UP | `if (sd.sd_type === 'orchestrator' && sd.status !== 'completed' && sd.status !== 'cancelled') {` |
| A.2 | `scripts/modules/sd-next/SDNextSelector.js` | 415 | MIGRATE_FOLLOW_UP | `if (sd.sd_type === 'orchestrator' && sd.status !== 'completed' && sd.status !== 'cancelled') {` |
| A.7 | `scripts/one-off/_audit-dual-detection-clusters.mjs` | 9 | EXCLUDE_OUT_OF_SCOPE | `*   A - SD-type detection (sd_type column, metadata.is_* flags, sd_key prefix, LEGITIMATE_NO_VENTURE_SD_TYPES)` |
| A.1 | `scripts/one-off/_audit-dual-detection-clusters.mjs` | 41 | EXCLUDE_OUT_OF_SCOPE | `{ id: 'A.1', description: 'sd_type direct comparison (e.g. sd.sd_type === "orchestrator")', pattern: /\bsd\.sd` |
| A.2 | `scripts/one-off/_audit-dual-detection-clusters.mjs` | 41 | EXCLUDE_OUT_OF_SCOPE | `{ id: 'A.1', description: 'sd_type direct comparison (e.g. sd.sd_type === "orchestrator")', pattern: /\bsd\.sd` |
| A.7 | `scripts/one-off/_audit-dual-detection-clusters.mjs` | 47 | EXCLUDE_OUT_OF_SCOPE | `{ id: 'A.7', description: 'LEGITIMATE_NO_VENTURE_SD_TYPES usage', pattern: /\bLEGITIMATE_NO_VENTURE_SD_TYPES\b` |
| A.8 | `scripts/one-off/_audit-dual-detection-clusters.mjs` | 48 | EXCLUDE_OUT_OF_SCOPE | `{ id: 'A.8', description: 'category check (sd.category === "...")', pattern: /\bsd\.category\s*===?\s*["']/ },` |
| A.7 | `scripts/one-off/_audit-dual-detection-clusters.mjs` | 332 | EXCLUDE_OUT_OF_SCOPE | `description: 'Multiple call sites classify an SD\'s type by reading sd_type column, metadata.is_* flags, sd_ke` |
| A.4 | `scripts/orchestrator-preflight.js` | 135 | MIGRATE | `sd.metadata?.is_orchestrator === true \|\|` |
| A.1 | `scripts/pcvp-anomaly-detection.cjs` | 107 | MIGRATE_FOLLOW_UP | `severity: sd.sd_type === 'feature' ? 'critical' : 'warning',` |
| A.2 | `scripts/pcvp-anomaly-detection.cjs` | 107 | MIGRATE_FOLLOW_UP | `severity: sd.sd_type === 'feature' ? 'critical' : 'warning',` |
| A.3 | `scripts/phase-preflight.js` | 261 | KEEP_METADATA_ONLY | `explicitFlag: sd.metadata?.is_parent === true,` |
| A.1 | `scripts/sd-start.js` | 284 | MIGRATE | `*   1. sd.sd_type === 'orchestrator'` |
| A.2 | `scripts/sd-start.js` | 284 | MIGRATE | `*   1. sd.sd_type === 'orchestrator'` |
| A.2 | `scripts/sd-start.js` | 359 | MIGRATE | `* When a child is itself an orchestrator (sd_type === 'orchestrator' or has children),` |
| A.1 | `scripts/verify-l2p/prd-readiness.js` | 301 | MIGRATE_FOLLOW_UP | `if (sd.sd_type === 'documentation') return result;` |
| A.2 | `scripts/verify-l2p/prd-readiness.js` | 301 | MIGRATE_FOLLOW_UP | `if (sd.sd_type === 'documentation') return result;` |

### Rationale per classification

- **EXCLUDE_OUT_OF_SCOPE**: Canonical helper file — defines the pattern, not a consumer. / One-off diagnostic script; not part of production routing.
- **KEEP_METADATA_ONLY**: Hot-path runs mid-handoff; metadata-flag-only preserves read-after-write transactional consistency (per RISK C1). Uses sync helper variant.
- **MIGRATE**: HIGH-IMPACT call site on the production handoff/claim/routing path. In scope for this SD.
- **MIGRATE_FOLLOW_UP**: Lower-impact consumer (enrichment script, utility CLI, server route). Files as follow-up SD/QF after this SD ships.

## Cluster B: Claim ownership detection

Multiple call sites determine "who holds this SD" by reading claude_sessions.claiming_session_id, .active_session_id, .is_working_on, .is_alive, .has_uncommitted_changes. Migration target: `lib/claim/ownership-detection.js` (FR-3).

| Rule | File | Line | Classification | Snippet |
|------|------|-----:|----------------|---------|
| B.1 | `lib/claim-lifecycle-release.mjs` | 67 | MIGRATE | `if (error \|\| !data \|\| !data.claiming_session_id) return null;` |
| B.1b | `lib/claim-lifecycle-release.mjs` | 96 | MIGRATE | `.eq('claiming_session_id', snapshot.claiming_session_id)` |
| B.1 | `lib/claim-validity-gate.js` | 323 | MIGRATE | `if (!sd.claiming_session_id) {` |
| B.1 | `lib/claim-validity-gate.js` | 331 | MIGRATE | `if (sd.claiming_session_id !== mySessionId) {` |
| B.1 | `lib/claim-validity-gate.js` | 338 | MIGRATE | `.eq('session_id', sd.claiming_session_id)` |
| B.1 | `lib/claim-validity-gate.js` | 355 | MIGRATE | `.eq('claiming_session_id', sd.claiming_session_id);` |
| B.1b | `lib/claim-validity-gate.js` | 355 | MIGRATE | `.eq('claiming_session_id', sd.claiming_session_id);` |
| B.1 | `lib/claim-validity-gate.js` | 360 | MIGRATE | `await releaseClaimsByHolder({ holderSessionId: sd.claiming_session_id });` |
| B.1 | `lib/claim-validity-gate.js` | 368 | MIGRATE | ``[claim-validity-gate] Auto-released orphaned claim on ${sdKey}: owner ${sd.claiming_session_id} ` +` |
| B.1 | `lib/claim-validity-gate.js` | 379 | MIGRATE | `released_owner_session: sd.claiming_session_id,` |
| B.1 | `lib/claim-validity-gate.js` | 388 | MIGRATE | `ownerSessionId: sd.claiming_session_id,` |
| B.5 | `lib/claim/holding-statuses.cjs` | 23 | EXCLUDE_OUT_OF_SCOPE | `const CLAIM_HOLDING_STATUSES = new Set([` |
| B.5 | `lib/claim/holding-statuses.cjs` | 41 | EXCLUDE_OUT_OF_SCOPE | `if (CLAIM_HOLDING_STATUSES.has(s.status)) claimed.add(s.sd_key);` |
| B.5 | `lib/claim/holding-statuses.cjs` | 46 | EXCLUDE_OUT_OF_SCOPE | `module.exports = { CLAIM_HOLDING_STATUSES, computeClaimedSdKeys };` |
| B.3 | `lib/inbox/unified-inbox-builder.js` | 153 | MIGRATE_FOLLOW_UP | `is_working_on: row.is_working_on,` |
| B.3 | `lib/quality/context-analyzer.js` | 132 | MIGRATE_FOLLOW_UP | `const adjustedScore = sd.is_working_on ? score * 1.5 : score;` |
| B.3 | `lib/quality/context-analyzer.js` | 193 | MIGRATE_FOLLOW_UP | `const workingSD = recentSDs.find(sd => sd.is_working_on);` |
| B.3 | `lib/quality/context-analyzer.js` | 241 | MIGRATE_FOLLOW_UP | `if (related.sd.is_working_on) {` |
| B.1 | `scripts/cancel-sd.js` | 92 | MIGRATE_FOLLOW_UP | `const claimedSessionId = sd.claiming_session_id;` |
| B.3 | `scripts/cancel-sd.js` | 128 | MIGRATE_FOLLOW_UP | `old_value: { status: sd.status, current_phase: sd.current_phase, is_working_on: sd.is_working_on },` |
| B.1 | `scripts/cancel-sd.js` | 178 | MIGRATE_FOLLOW_UP | `console.log(`  Claim: ${sd.claiming_session_id ? sd.claiming_session_id.slice(0, 8) : '(none)'}`);` |
| B.1 | `scripts/claim-orchestrator-for-rollup.mjs` | 73 | MIGRATE_FOLLOW_UP | `if (sd.claiming_session_id && sd.claiming_session_id !== sessionId) {` |
| B.1 | `scripts/claim-orchestrator-for-rollup.mjs` | 77 | MIGRATE_FOLLOW_UP | `.eq('session_id', sd.claiming_session_id)` |
| B.1 | `scripts/claim-orchestrator-for-rollup.mjs` | 83 | MIGRATE_FOLLOW_UP | `return { ok: false, action: 'refused', reason: `parent ${sd.sd_key} is claimed by a different LIVE session ${s` |
| B.3b | `scripts/eva/friday-meeting.mjs` | 609 | MIGRATE_FOLLOW_UP | `.eq('is_working_on', true),` |
| B.3b | `scripts/eva/friday-meeting.mjs` | 613 | MIGRATE_FOLLOW_UP | `.eq('is_working_on', false),` |
| B.1 | `scripts/get-working-on-sd.js` | 133 | MIGRATE_FOLLOW_UP | `Claimed by: ${sd.claiming_session_id \|\| 'unknown (legacy is_working_on)'}` |
| B.3b | `scripts/handoff-export.cjs` | 92 | MIGRATE_FOLLOW_UP | `.eq('is_working_on', true)` |
| B.3b | `scripts/hooks/auto-learning-capture.cjs` | 197 | MIGRATE_FOLLOW_UP | `.eq('is_working_on', true)` |
| B.3b | `scripts/hooks/concurrent-session-worktree.cjs` | 327 | MIGRATE_FOLLOW_UP | `.eq('is_working_on', true)` |
| B.3 | `scripts/leo-cleanup.js` | 136 | MIGRATE | `const workingOn = sd.is_working_on ? '🔴' : '⚪';` |
| B.3b | `scripts/leo-continuous.js` | 345 | MIGRATE_FOLLOW_UP | `.eq('is_working_on', true)` |
| B.3b | `scripts/modules/claim-health/triangulate.js` | 270 | MIGRATE_FOLLOW_UP | `.eq('is_working_on', true);` |
| B.1 | `scripts/modules/handoff/executors/lead-final-approval/helpers.js` | 78 | MIGRATE | `{ supabase, shippingResults, callerSessionId: sd.claiming_session_id }` |
| B.1 | `scripts/modules/handoff/executors/lead-final-approval/helpers.js` | 106 | MIGRATE | `{ supabase, shippingResults, callerSessionId: sd.claiming_session_id }` |
| B.1 | `scripts/modules/sd-next/display/recommendations.js` | 273 | MIGRATE | `if (sd.claiming_session_id && sd.claiming_session_id !== currentSessionId) {` |
| B.1 | `scripts/modules/sd-next/display/recommendations.js` | 276 | MIGRATE | `const claimingSession = activeSessions.find(s => s.session_id === sd.claiming_session_id);` |
| B.1 | `scripts/modules/sd-next/display/recommendations.js` | 279 | MIGRATE | `claimingSessionId: sd.claiming_session_id,` |
| B.5 | `scripts/one-off/_audit-dual-detection-clusters.mjs` | 62 | EXCLUDE_OUT_OF_SCOPE | `{ id: 'B.5', description: 'CLAIM_HOLDING_STATUSES import or use', pattern: /\bCLAIM_HOLDING_STATUSES\b/ },` |
| B.1 | `scripts/one-off/_lead-enrich-sd-fdbk-infra-cascade-trigger-overreach-001.mjs` | 291 | EXCLUDE_OUT_OF_SCOPE | `console.log('claiming_session_id:', data.claiming_session_id);` |
| B.3 | `scripts/one-off/_lead-enrich-sd-fdbk-infra-cascade-trigger-overreach-001.mjs` | 292 | EXCLUDE_OUT_OF_SCOPE | `console.log('is_working_on:', data.is_working_on);` |
| B.1 | `scripts/one-off/_lead-enrich-sd-fdbk-infra-cascade-trigger-overreach-001.mjs` | 296 | EXCLUDE_OUT_OF_SCOPE | `if (data.claiming_session_id !== SESSION) {` |
| B.3 | `scripts/one-off/_lead-enrich-sd-fdbk-infra-cascade-trigger-overreach-001.mjs` | 300 | EXCLUDE_OUT_OF_SCOPE | `if (data.is_working_on !== true) {` |
| B.1 | `scripts/one-off/_lead-merge-subagent-findings-sd-fdbk-cascade-trigger-overreach-001.mjs` | 404 | EXCLUDE_OUT_OF_SCOPE | `console.log('claiming_session_id:', data.claiming_session_id);` |
| B.3 | `scripts/one-off/_lead-merge-subagent-findings-sd-fdbk-cascade-trigger-overreach-001.mjs` | 405 | EXCLUDE_OUT_OF_SCOPE | `console.log('is_working_on:', data.is_working_on);` |
| B.1 | `scripts/one-off/_lead-merge-subagent-findings-sd-fdbk-cascade-trigger-overreach-001.mjs` | 412 | EXCLUDE_OUT_OF_SCOPE | `if (data.claiming_session_id !== SESSION) {` |
| B.3 | `scripts/one-off/_lead-merge-subagent-findings-sd-fdbk-cascade-trigger-overreach-001.mjs` | 416 | EXCLUDE_OUT_OF_SCOPE | `if (data.is_working_on !== true) {` |
| B.1 | `scripts/one-off/_risk-probe-cascade-multifield.mjs` | 12 | EXCLUDE_OUT_OF_SCOPE | `claiming_session_id: before.data.claiming_session_id,` |
| B.3 | `scripts/one-off/_risk-probe-cascade-multifield.mjs` | 13 | EXCLUDE_OUT_OF_SCOPE | `is_working_on: before.data.is_working_on,` |
| B.2 | `scripts/one-off/_risk-probe-cascade-multifield.mjs` | 14 | EXCLUDE_OUT_OF_SCOPE | `active_session_id: before.data.active_session_id,` |
| B.1 | `scripts/one-off/_risk-probe-cascade-multifield.mjs` | 39 | EXCLUDE_OUT_OF_SCOPE | `before_claim_state: !!(before.data.claiming_session_id && before.data.is_working_on && before.data.active_sess` |
| B.2 | `scripts/one-off/_risk-probe-cascade-multifield.mjs` | 39 | EXCLUDE_OUT_OF_SCOPE | `before_claim_state: !!(before.data.claiming_session_id && before.data.is_working_on && before.data.active_sess` |
| B.3 | `scripts/one-off/_risk-probe-cascade-multifield.mjs` | 39 | EXCLUDE_OUT_OF_SCOPE | `before_claim_state: !!(before.data.claiming_session_id && before.data.is_working_on && before.data.active_sess` |
| B.1 | `scripts/one-off/_risk-probe-cascade-multifield.mjs` | 41 | EXCLUDE_OUT_OF_SCOPE | `cascade_overreach_reproduced: (before.data.claiming_session_id && !upd.data?.claiming_session_id) \|\|` |
| B.3 | `scripts/one-off/_risk-probe-cascade-multifield.mjs` | 42 | EXCLUDE_OUT_OF_SCOPE | `(before.data.is_working_on && !upd.data?.is_working_on) \|\|` |
| B.2 | `scripts/one-off/_risk-probe-cascade-multifield.mjs` | 43 | EXCLUDE_OUT_OF_SCOPE | `(before.data.active_session_id && !upd.data?.active_session_id)` |
| B.1 | `scripts/one-off/_risk-probe-cascade-reproduce.mjs` | 23 | EXCLUDE_OUT_OF_SCOPE | `const cleared_claiming = before.data.claiming_session_id && !upd.data?.claiming_session_id;` |
| B.3 | `scripts/one-off/_risk-probe-cascade-reproduce.mjs` | 24 | EXCLUDE_OUT_OF_SCOPE | `const cleared_working = before.data.is_working_on && !upd.data?.is_working_on;` |
| B.2 | `scripts/one-off/_risk-probe-cascade-reproduce.mjs` | 25 | EXCLUDE_OUT_OF_SCOPE | `const cleared_active = before.data.active_session_id && !upd.data?.active_session_id;` |
| B.3b | `scripts/run-leo.cjs` | 94 | MIGRATE_FOLLOW_UP | `const { data } = await supabase.from('strategic_directives_v2').select('id, title, current_phase, status').eq(` |
| B.3b | `scripts/sd-next/display.js` | 304 | MIGRATE_FOLLOW_UP | `.eq('is_working_on', true)` |
| B.6 | `scripts/session-check-concurrency.js` | 52 | MIGRATE_FOLLOW_UP | `const dirty = session.has_uncommitted_changes === true;` |
| B.5 | `scripts/stale-session-sweep.cjs` | 33 | MIGRATE | `const { CLAIM_HOLDING_STATUSES, computeClaimedSdKeys } = require('../lib/claim/holding-statuses.cjs');` |
| B.1b | `scripts/stale-session-sweep.cjs` | 415 | MIGRATE | `.eq('claiming_session_id', qf.claiming_session_id); // race guard: only if still held by the same dead session` |
| B.1b | `scripts/stale-session-sweep.cjs` | 1022 | MIGRATE | `.eq('claiming_session_id', s.session_id);` |
| B.5 | `scripts/stale-session-sweep.cjs` | 1153 | MIGRATE | `// SD-LEO-INFRA-EXPOSE-CLAIM-OWNER-001 (FR-3): use the same CLAIM_HOLDING_STATUSES` |
| B.5 | `scripts/stale-session-sweep.cjs` | 1157 | MIGRATE | `const activeSessions = classified.filter(s => CLAIM_HOLDING_STATUSES.has(s.status));` |
| B.1 | `scripts/stale-session-sweep.cjs` | 1235 | MIGRATE | `if (sd.claiming_session_id !== s.session_id) {` |
| B.3 | `scripts/stale-session-sweep.cjs` | 1242 | MIGRATE | `} else if (!sd.is_working_on) {` |
| B.5 | `scripts/stale-session-sweep.cjs` | 1384 | MIGRATE | `// QF-20260526-279: route through CLAIM_HOLDING_STATUSES so STALE/DEAD render` |
| B.5 | `scripts/stale-session-sweep.cjs` | 1388 | MIGRATE | `const stale = classified.filter(s => !CLAIM_HOLDING_STATUSES.has(s.status));` |
| B.3b | `server/websocket.js` | 132 | MIGRATE_FOLLOW_UP | `.eq('is_working_on', true);` |

### Rationale per classification

- **EXCLUDE_OUT_OF_SCOPE**: Canonical helper file — defines the pattern, not a consumer. / One-off diagnostic script; not part of production routing.
- **MIGRATE**: HIGH-IMPACT call site on the production handoff/claim/routing path. In scope for this SD.
- **MIGRATE_FOLLOW_UP**: Lower-impact consumer (enrichment script, utility CLI, server route). Files as follow-up SD/QF after this SD ships.

## Cluster C: Gate-skip detection

Multiple call sites decide whether a handoff gate should run by checking gate.condition callbacks, context.skipGate injection, metadata.skip_* flags, or SD-type-conditional skip. Migration target: `lib/handoff/gate-skip-detection.js` (FR-4).

| Rule | File | Line | Classification | Snippet |
|------|------|-----:|----------------|---------|
| C.4 | `scripts/create-refactor-brief.js` | 85 | MIGRATE_FOLLOW_UP | `if (sd.sd_type !== 'refactor') {` |
| C.4 | `scripts/hooks/stop-subagent-enforcement/post-completion-validator.js` | 104 | MIGRATE_FOLLOW_UP | `if (sd.sd_type !== 'orchestrator') {` |
| C.4 | `scripts/lib/governance-policy-checker.js` | 176 | MIGRATE_FOLLOW_UP | `if (sd.sd_type !== 'orchestrator' && !sd.relationship_type?.includes('orchestrator')) return null;` |
| C.4 | `scripts/modules/handoff/executors/lead-to-plan/gates/adrs-consulted.js` | 36 | MIGRATE | `if (sd.sd_type !== 'refactor') {` |
| C.1 | `scripts/modules/handoff/validation/ValidationOrchestrator.js` | 250 | MIGRATE | `if (gate.condition && !(await gate.condition(context))) {` |
| C.1 | `scripts/modules/handoff/validation/ValidationOrchestrator.js` | 1028 | MIGRATE | `if (gate.condition && !(await gate.condition(context))) {` |
| C.4 | `scripts/modules/intensity-detector.js` | 106 | MIGRATE_FOLLOW_UP | `if (sd.sd_type !== 'refactor') {` |
| C.2 | `scripts/modules/traceability-validation/sections/recommendation-adherence.js` | 88 | MIGRATE_FOLLOW_UP | `\|\| designAnalysis?.metadata?.skip_reason` |
| C.2 | `scripts/modules/traceability-validation/sections/recommendation-adherence.js` | 89 | MIGRATE_FOLLOW_UP | `\|\| designAnalysis?.results?.metadata?.skip_reason;` |
| C.1 | `scripts/one-off/_audit-dual-detection-clusters.mjs` | 11 | EXCLUDE_OUT_OF_SCOPE | `*   C - Gate-skip detection (gate.condition, context.skipGate, metadata.skip_*)` |
| C.3 | `scripts/one-off/_audit-dual-detection-clusters.mjs` | 11 | EXCLUDE_OUT_OF_SCOPE | `*   C - Gate-skip detection (gate.condition, context.skipGate, metadata.skip_*)` |
| C.1 | `scripts/one-off/_audit-dual-detection-clusters.mjs` | 66 | EXCLUDE_OUT_OF_SCOPE | `{ id: 'C.1', description: 'gate.condition or shouldSkip pattern', pattern: /\b(?:gate\.condition\|shouldSkipGa` |
| C.3 | `scripts/one-off/_audit-dual-detection-clusters.mjs` | 68 | EXCLUDE_OUT_OF_SCOPE | `{ id: 'C.3', description: 'context.skipGate explicit injection', pattern: /\bcontext\.skipGate\b/ },` |
| C.1 | `scripts/one-off/_audit-dual-detection-clusters.mjs` | 342 | EXCLUDE_OUT_OF_SCOPE | `description: 'Multiple call sites decide whether a handoff gate should run by checking gate.condition callback` |
| C.3 | `scripts/one-off/_audit-dual-detection-clusters.mjs` | 342 | EXCLUDE_OUT_OF_SCOPE | `description: 'Multiple call sites decide whether a handoff gate should run by checking gate.condition callback` |

### Rationale per classification

- **EXCLUDE_OUT_OF_SCOPE**: One-off diagnostic script; not part of production routing.
- **MIGRATE**: HIGH-IMPACT call site on the production handoff/claim/routing path. In scope for this SD.
- **MIGRATE_FOLLOW_UP**: Lower-impact consumer (enrichment script, utility CLI, server route). Files as follow-up SD/QF after this SD ships.

## Methodology

- File list sourced from `git ls-files` (tracked files only), filtered to *.js / *.mjs / *.cjs.
- Per-file scan via native JS RegExp; matches recorded with file:line + classification.
- Excluded prefixes: tests/, test/, scripts/archive/, .prd-payloads/, .rca/, .audit-out/, docs/audits/, node_modules/, .worktrees/, dist/, build/
- Excluded suffixes: *.test.{js,mjs,cjs}, *.spec.{js,mjs,cjs}
- Classification (per RISK C1 from LEAD sub-agent review):
  - **MIGRATE**: standard call site; migrated to canonical helper in Phase 2/3/4/5.
  - **KEEP_METADATA_ONLY**: hot-path files (handoff-preflight, phase-preflight, orchestrator-completion-guardian, decomposition-gate) where read-after-write consistency requires the sync helper variant.
  - **EXCLUDE_OUT_OF_SCOPE**: canonical helper files, one-off diagnostic scripts, database migrations.
- Output is deterministic-sorted (file alphabetical → line ascending → rule_id) for diffability across runs (TR-2).
- Read-only enforcement (TR-1): script refuses to run when SUPABASE_SERVICE_ROLE_KEY is set in env.

## Phase 2-5 scoping

The migration count in each Phase MUST match the per-cluster MIGRATE counts in this report. KEEP_METADATA_ONLY sites use the sync helper variant. EXCLUDE_OUT_OF_SCOPE sites are not touched by this SD.
