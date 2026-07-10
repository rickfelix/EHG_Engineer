#!/usr/bin/env node

/**
 * LEO Create SD - Helper script for /leo create command
 *
 * Handles flag-based SD creation from various sources:
 * - --from-uat <test-id>: Create from UAT finding
 * - --from-learn <pattern-id>: Create from /learn pattern
 * - --from-feedback <id>: Create from /inbox feedback item
 * - --from-roadmap-item <id>: Promote a roadmap_wave_items row to an SD (register-first two-way stamp)
 * - --from-qf <QF-ID>: Escalate open quick-fix to SD (Tier 3 routing)
 * - --child <parent-key> <index>: Create child SD
 * - --vision-key <key>: Link to EVA vision document
 * - --arch-key <key>: Link to EVA architecture plan
 *
 * Part of SD-LEO-SDKEY-001: Centralize SD Creation Through /leo
 *
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: this file is now CLI-only — argv parsing, registry
 * dispatch, output, and exit-code mapping. The lane implementations moved VERBATIM to:
 *   - lib/sd-creation/pipeline.js                     (createSD core + enrich/validate helpers)
 *   - lib/sd-creation/source-adapters/<source>.js     (uat, learn, feedback, roadmap-item, qf, child, plan)
 *   - scripts/modules/leo-create-sd/proposal-lanes.js (proposal ingest routes — exit-pinned by tests)
 *   - scripts/modules/leo-create-sd/target-repos.js   (--target-repos validator — exit-pinned by tests)
 *   - scripts/modules/leo-create-sd/direct-lane.js    (direct <source> <type> "<title>" lane)
 * Every previously-exported name is re-exported below (backward-compatible shim), so
 * programmatic importers (EVA writers, drain-intake, corrective-triage, …) are unchanged.
 */

import {
  SD_SOURCES,
  SD_TYPES,
} from './modules/sd-key-generator.js';
import { isMainModule } from '../lib/utils/is-main-module.js';
import {
  createFromUAT,
  createFromLearn,
  createFromFeedback,
  createFromRoadmapItem,
  createFromQF,
  createChild,
  createFromPlan,
} from '../lib/sd-creation/source-adapters/index.js';
import {
  createFromProposal,
  createFromProposalB64,
  createFromProposalStdin,
} from './modules/leo-create-sd/proposal-lanes.js';
import { parseTargetReposArg } from './modules/leo-create-sd/target-repos.js';
import { runDirectCreation } from './modules/leo-create-sd/direct-lane.js';

// ============================================================================
// Re-export shim (SD-ARCH-HOTSPOT-LEO-CREATE-001)
// Every name scripts/leo-create-sd.js exported before the refactor is preserved here.
// ============================================================================
export { ALLOWED_REPOS, parseTargetReposArg, buildOrchestratorCmd } from './modules/leo-create-sd/target-repos.js';
export {
  enrichFromVisionArch,
  resolveVenturePrefix,
  VISION_PRESCREEN_TIMEOUT_MS,
  scoreSDAtConception,
  formatDependencyForDisplay,
  buildDefaultSmokeTestSteps,
  inferDefaultSdTypeFromKey,
  resolveSdType,
  // createSDOrThrow preserves the pre-refactor programmatic contract of this module's
  // `createSD` export: resolves to the inserted SD row, throws on failure.
  createSDOrThrow as createSD,
} from '../lib/sd-creation/pipeline.js';
export { buildPromotionRepoOverrides, computePlanContentHash, findRecentSDByPlanHash } from '../lib/sd-creation/source-adapters/index.js';
export {
  validateProposalShape,
  mapProposalToCreateArgs,
  normalizeDependsOn,
  ingestProposalObject,
  createFromProposal,
  createFromProposalB64,
  createFromProposalStdin,
} from './modules/leo-create-sd/proposal-lanes.js';

// ============================================================================
// CLI Handler
// ============================================================================

/**
 * Map a lane-adapter result to the historical CLI exit behavior
 * (SD-ARCH-HOTSPOT-LEO-CREATE-001 exit→return conversion, CLI side):
 *   - {ok:true, done:true}  → the lane's former early-exit(0) path: exit 0 (message
 *     already printed at the site, exactly as before).
 *   - {ok:false}            → the lane's former exit(1) path: exit with the site's code.
 *     INSERT_FAILED re-throws instead so main()'s catch prints the historical
 *     "Error: ..." line before exiting 1 (matching the pre-refactor throw).
 *   - anything else (the created SD row / a skip descriptor) → fall through to the
 *     shared `process.exit(0)` at the end of main(), as before.
 */
function exitFromResult(res) {
  if (res && res.ok === true && res.done === true) process.exit(res.exitCode ?? 0);
  if (res && res.ok === false) {
    if (res.code === 'INSERT_FAILED') throw new Error(res.error);
    process.exit(res.exitCode ?? 1);
  }
  return res;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
LEO Create SD - Centralized SD Creation

Usage:
  node scripts/leo-create-sd.js --from-uat <test-id>
  node scripts/leo-create-sd.js --from-learn <pattern-id>
  node scripts/leo-create-sd.js --from-feedback <feedback-id>
  node scripts/leo-create-sd.js --from-roadmap-item <roadmap-item-id>
  node scripts/leo-create-sd.js --from-qf <QF-ID>
  node scripts/leo-create-sd.js --from-proposal <path|glob> [--dry-run]
  node scripts/leo-create-sd.js --proposal-b64 <base64> [--dry-run]      # file-free DB-direct sourcing
  cat PROPOSAL.json | node scripts/leo-create-sd.js --proposal-stdin [--dry-run]
  node scripts/leo-create-sd.js --from-plan [path] [--type <type>] [--title "<title>"]
  node scripts/leo-create-sd.js --child <parent-key> [index] [--type <type>] [--title "<title>"]
  node scripts/leo-create-sd.js <source> <type> "<title>"

Sources: ${Object.keys(SD_SOURCES).join(', ')}
Types: ${Object.keys(SD_TYPES).join(', ')}

Flags:
  --yes, -y          Skip confirmation for auto-detected plans
  --type <type>      Override SD type (for --from-plan, --from-feedback, or --child; children never inherit 'orchestrator')
  --title "<title>"  Override title (for --from-plan, --from-feedback, or --child)
  --priority <p>     Override priority for --from-plan (critical|high|medium|low). Default from plan header
                     ## Priority, falling back to "medium" if absent.
  --venture <name>   Generate venture-scoped SD key (SD-{VENTURE}-{SOURCE}-{TYPE}-{SEMANTIC}-{NUM})
  --vision-key <key> Link SD to EVA vision document (stored in metadata, used for vision scoring)
                     Supported in both direct creation AND --from-plan mode.
  --arch-key <key>   Link SD to EVA architecture plan (stored in metadata, used for vision scoring)
                     Supported in both direct creation AND --from-plan mode.
  --migration-reviewed  Set metadata.migration_reviewed=true to satisfy GR-MIGRATION-REVIEW
                        guardrail (required when scope contains migration/schema keywords).
                        Honored on direct, --from-feedback, --child AND the proposal-ingest
                        routes (--from-proposal / --proposal-b64 / --proposal-stdin); on the
                        proposal routes proposal.metadata.migration_reviewed===true also attests.
  --security-reviewed   Set metadata.security_reviewed=true to satisfy GR-SECURITY-BASELINE
                        guardrail (required when scope contains auth/credential/RLS keywords).
                        Honored on the same routes as --migration-reviewed (incl. proposal
                        metadata.security_reviewed===true).
  --scope-slice <JSON>  (--child only) Declare the slice of parent orchestrator scope this
                        child claims. JSON shape: {stages?: number[], deliverable_globs?: string[]}.
                        Example: --scope-slice='{"stages":[18]}'
  --target-repos <list> Set metadata.target_repos[] for cross-repo SDs (comma-separated).
                        Valid values: EHG, EHG_Engineer (case-insensitive; normalized).
                        When set, PR_MERGE_VERIFICATION at LEAD-FINAL scopes its scan
                        to ONLY these repos. Required for SDs spanning both platform repos.
  --min-tier-rank <N>   Explicitly set metadata.min_tier_rank (requires --min-tier-rank-reason;
                        throws without one). Absent this flag, a signal-less SD (the common
                        --from-plan shape) stamps the fleet-claimable baseline instead of the
                        fail-safe-up ladder top, so it is never stranded unclaimable-by-construction.
  --min-tier-rank-reason "<text>"  Required companion to --min-tier-rank; recorded verbatim.
                        Example: --target-repos EHG,EHG_Engineer
                        Pairs with computeReposForSD() at lead-final-approval/gates.js
                        (SD-LEO-INFRA-CROSS-REPO-MERGE-001). Supported in: direct LEO,
                        --from-plan, --child, AND --from-roadmap-item (the latter also sets
                        the promoted SD's target_application to the PRIMARY repo so product
                        roadmap items route to rickfelix/ehg — SD-LEO-INFRA-PRODUCT-PROMOTION-TARGET-REPO-001).
  --dry-run          (--from-proposal / --proposal-b64 / --proposal-stdin) Validate + report
                     would-create SDs; ZERO database writes.
  --proposal-b64 <b64>  File-free DB-direct sourcing: base64-encoded proposal JSON ingested via
                        the same validate -> keyExists -> create core as --from-proposal. PREFERRED
                        for operator-attached (Adam/coordinator) sessions on main — needs NO payload
                        file and NO worktree (base64-on-the-wire is immune to Bash quote mangling).
  --proposal-stdin      File-free DB-direct sourcing via a pipe: read the proposal JSON from stdin.
  --help             Show this help message

Dependency Field Guide:
  The "dependencies" column (JSONB array) is the CORRECT place for SD prerequisites.
  Format: [{"sd_id": "SD-XXX-001"}, {"sd_id": "SD-YYY-002"}]

  This column controls:
    - Whether an SD shows as BLOCKED or READY in sd:next
    - Whether AUTO-PROCEED will skip or process the SD
    - Unresolved dependency warnings in the queue display

  DO NOT put dependency info in the "metadata" field — it will NOT be
  enforced by the queue system. Common mistakes:
    metadata.depends_on, metadata.dependencies, metadata.blocked_by,
    metadata.prerequisite_sds — all ignored by the dependency resolver.

  The only metadata dependency key that IS checked is:
    metadata.blocked_by_sd_key — soft/conditional blocker (single SD key)

Venture Context:
  Venture prefix is resolved in order: --venture flag > VENTURE env var > active session venture.
  When a venture context is active, SD keys are automatically prefixed with the venture name.

Examples:
  node scripts/leo-create-sd.js --from-uat abc123
  node scripts/leo-create-sd.js --from-feedback def456
  node scripts/leo-create-sd.js --from-qf QF-20260424-808           # Escalate Tier-3 quick-fix to SD
  node scripts/leo-create-sd.js --from-plan                              # Auto-detect most recent plan
  node scripts/leo-create-sd.js --from-plan --yes                        # Auto-detect without confirmation
  node scripts/leo-create-sd.js --from-plan ~/.claude/plans/my-plan.md   # Use specific plan
  node scripts/leo-create-sd.js --from-plan --type feature --yes         # Override inferred type
  node scripts/leo-create-sd.js --from-plan --type feature --title "My SD" --yes  # Override both
  node scripts/leo-create-sd.js --child SD-LEO-FEAT-001 0
  node scripts/leo-create-sd.js LEO fix "Login button not working"
  node scripts/leo-create-sd.js LEO infrastructure "Tooling upgrade"

Note: SD keys starting with QF- will be redirected to create-quick-fix.js.
      Guardrails are enforced at both CLI and database level — no bypass available.
`);
    process.exit(0);
  }

  try {
    if (args[0] === '--from-uat') {
      const uatRes = await createFromUAT(args[1]);
      exitFromResult(uatRes);
    } else if (args[0] === '--from-learn') {
      const learnRes = await createFromLearn(args[1]);
      exitFromResult(learnRes);
    } else if (args[0] === '--from-feedback') {
      // Parse --type and --title overrides (mirrors --from-plan / --child).
      // The feedback ID is the first non-flag positional after --from-feedback.
      const fbTypeIdx = args.indexOf('--type');
      const fbTitleIdx = args.indexOf('--title');
      const fbForceLivenessIdx = args.indexOf('--force-liveness');
      const fbFlagValuePositions = new Set(
        [fbTypeIdx !== -1 ? fbTypeIdx + 1 : -1,
         fbTitleIdx !== -1 ? fbTitleIdx + 1 : -1,
         fbForceLivenessIdx !== -1 ? fbForceLivenessIdx + 1 : -1].filter(i => i > 0)
      );
      // QF-20260509-LEO-CREATE-FLAGS: include review flags so they're not
      // mistaken for the feedback ID positional. Closes 8a640d32 sibling parity.
      const fbKnownFlags = new Set(['--from-feedback', '--type', '--title', '--migration-reviewed', '--security-reviewed', '--force-liveness']);
      const feedbackId = args.find((arg, i) =>
        i > 0 && !arg.startsWith('-') && !fbFlagValuePositions.has(i) && !fbKnownFlags.has(arg)
      ) || args[1];
      const fbRes = await createFromFeedback(feedbackId, {
        typeOverride: fbTypeIdx !== -1 ? args[fbTypeIdx + 1] : null,
        titleOverride: fbTitleIdx !== -1 ? args[fbTitleIdx + 1] : null,
        migrationReviewed: args.includes('--migration-reviewed'),
        securityReviewed: args.includes('--security-reviewed'),
        forceLiveness: fbForceLivenessIdx !== -1 ? args[fbForceLivenessIdx + 1] : null,
      });
      exitFromResult(fbRes);
    } else if (args[0] === '--from-roadmap-item') {
      // SD-LEO-INFRA-SOURCING-ENGINE-REGISTER-FIRST-001 (FR-1): promote a roadmap_wave_items row to an
      // SD with the two-way stamp. Mirrors --from-feedback flag parsing (--type/--title/review flags).
      const riTypeIdx = args.indexOf('--type');
      const riTitleIdx = args.indexOf('--title');
      // SD-LEO-INFRA-PRODUCT-PROMOTION-TARGET-REPO-001: --target-repos routes a promoted roadmap
      // item to a product repo (e.g. EHG → rickfelix/ehg), unblocking the 268 product roadmap items
      // that --from-roadmap-item could not target (it forced venturePrefix=null / EHG_Engineer).
      const riTargetReposIdx = args.indexOf('--target-repos');
      const riFlagValuePositions = new Set(
        [riTypeIdx !== -1 ? riTypeIdx + 1 : -1,
         riTitleIdx !== -1 ? riTitleIdx + 1 : -1,
         riTargetReposIdx !== -1 ? riTargetReposIdx + 1 : -1].filter(i => i > 0)
      );
      const riKnownFlags = new Set(['--from-roadmap-item', '--type', '--title', '--migration-reviewed', '--security-reviewed', '--target-repos']);
      const roadmapItemId = args.find((arg, i) =>
        i > 0 && !arg.startsWith('-') && !riFlagValuePositions.has(i) && !riKnownFlags.has(arg)
      ) || args[1];
      const riRes = await createFromRoadmapItem(roadmapItemId, {
        typeOverride: riTypeIdx !== -1 ? args[riTypeIdx + 1] : null,
        titleOverride: riTitleIdx !== -1 ? args[riTitleIdx + 1] : null,
        migrationReviewed: args.includes('--migration-reviewed'),
        securityReviewed: args.includes('--security-reviewed'),
        targetRepos: riTargetReposIdx !== -1 ? parseTargetReposArg(args[riTargetReposIdx + 1]) : null,
      });
      exitFromResult(riRes);
    } else if (args[0] === '--from-qf') {
      // QF-20260701-833 follow-up: honor --security-reviewed on this route too (was
      // previously silently ignored here, unlike --from-feedback/--from-roadmap-item/
      // --child/--from-proposal), so a QF whose DESCRIPTION merely mentions security-
      // adjacent keywords (e.g. "CI DB secrets") isn't unescapably blocked by
      // GR-SECURITY-BASELINE when the actual code change touches no security-sensitive scope.
      // QF-20260705-395: --migration-reviewed had the identical gap -- a Tier-3 QF whose
      // description names a real schema migration was unescapably blocked by
      // GR-MIGRATION-REVIEW, since the flag was silently dropped before reaching createFromQF.
      const qfRes = await createFromQF(args[1], {
        securityReviewed: args.includes('--security-reviewed'),
        migrationReviewed: args.includes('--migration-reviewed'),
      });
      exitFromResult(qfRes);
    } else if (args[0] === '--from-proposal') {
      // SD-LEO-INFRA-FROM-PROPOSAL-INGEST-001: materialize PROPOSAL-*.json into DRAFT SDs.
      // path/glob = first non-flag positional after --from-proposal; --dry-run = no writes.
      const dryRun = args.includes('--dry-run');
      // FR-2: --migration-reviewed/--security-reviewed are known flags (not the path positional).
      const fpKnownFlags = new Set(['--from-proposal', '--dry-run', '--migration-reviewed', '--security-reviewed']);
      const proposalArg = args.find((a, i) => i > 0 && !a.startsWith('-') && !fpKnownFlags.has(a)) || args[1];
      await createFromProposal(proposalArg, {
        dryRun,
        migrationReviewed: args.includes('--migration-reviewed'),
        securityReviewed: args.includes('--security-reviewed'),
      });
    } else if (args[0] === '--proposal-b64') {
      // SD-LEO-INFRA-OPERATOR-SOURCING-DBDIRECT-001: file-free DB-direct sourcing.
      // The base64 string is the first non-flag positional (base64 never starts with '-').
      const dryRun = args.includes('--dry-run');
      // FR-2: --migration-reviewed/--security-reviewed are known flags (not the base64 positional).
      const b64KnownFlags = new Set(['--proposal-b64', '--dry-run', '--migration-reviewed', '--security-reviewed']);
      // No `|| args[1]` fallback: if no non-flag positional is present (e.g.
      // `--proposal-b64 --dry-run`), b64Arg stays undefined so createFromProposalB64's
      // guard reports the clear "requires a base64-encoded proposal JSON string" error
      // instead of base64-decoding the literal '--dry-run' flag into junk.
      const b64Arg = args.find((a, i) => i > 0 && !a.startsWith('-') && !b64KnownFlags.has(a));
      await createFromProposalB64(b64Arg, {
        dryRun,
        migrationReviewed: args.includes('--migration-reviewed'),
        securityReviewed: args.includes('--security-reviewed'),
      });
    } else if (args[0] === '--proposal-stdin') {
      // SD-LEO-INFRA-OPERATOR-SOURCING-DBDIRECT-001: file-free DB-direct sourcing via a pipe.
      const dryRun = args.includes('--dry-run');
      await createFromProposalStdin({
        dryRun,
        migrationReviewed: args.includes('--migration-reviewed'),
        securityReviewed: args.includes('--security-reviewed'),
      });
    } else if (args[0] === '--from-plan') {
      // Check for --yes flag (skip confirmation for auto-detect)
      const hasYesFlag = args.includes('--yes') || args.includes('-y');
      // Parse --type override (e.g., --from-plan --type feature)
      const typeIdx = args.indexOf('--type');
      const typeOverride = typeIdx !== -1 ? args[typeIdx + 1] : null;
      // Parse --title override (e.g., --from-plan --title "My Title")
      const titleIdx = args.indexOf('--title');
      const titleOverride = titleIdx !== -1 ? args[titleIdx + 1] : null;
      // Parse --priority override (e.g., --from-plan --priority high). Validated against enum below.
      const priorityIdx = args.indexOf('--priority');
      const priorityOverrideRaw = priorityIdx !== -1 ? args[priorityIdx + 1] : null;
      let priorityOverride = null;
      if (priorityOverrideRaw) {
        const normalized = priorityOverrideRaw.toLowerCase();
        if (!['critical', 'high', 'medium', 'low'].includes(normalized)) {
          console.error(`\n❌ Invalid --priority value: "${priorityOverrideRaw}". Valid: critical, high, medium, low`);
          process.exit(1);
        }
        priorityOverride = normalized;
      }
      // Parse --vision-key / --arch-key (link plan-created SD to registered vision/arch)
      const visionKeyIdx = args.indexOf('--vision-key');
      const visionKey = visionKeyIdx !== -1 ? args[visionKeyIdx + 1] : null;
      const archKeyIdx = args.indexOf('--arch-key');
      const archKey = archKeyIdx !== -1 ? args[archKeyIdx + 1] : null;
      // Parse boolean review flags (satisfy GR-MIGRATION-REVIEW / GR-SECURITY-BASELINE)
      const migrationReviewed = args.includes('--migration-reviewed');
      const securityReviewed = args.includes('--security-reviewed');
      // QF-20260509-LEO-CREATE-PLAN-DUP-GUARD: override the same-plan-within-24h refusal
      const forceCreate = args.includes('--force-create');
      // SD-LEO-INFRA-LEO-CREATE-CROSS-001: --target-repos for cross-repo SDs
      const targetReposIdxPlan = args.indexOf('--target-repos');
      const targetReposPlan = targetReposIdxPlan !== -1 ? parseTargetReposArg(args[targetReposIdxPlan + 1]) : null;
      // Path is any arg that isn't a flag or a flag's value
      const flagValuePositions = new Set(
        [
          typeIdx !== -1 ? typeIdx + 1 : -1,
          titleIdx !== -1 ? titleIdx + 1 : -1,
          priorityIdx !== -1 ? priorityIdx + 1 : -1,
          visionKeyIdx !== -1 ? visionKeyIdx + 1 : -1,
          archKeyIdx !== -1 ? archKeyIdx + 1 : -1,
          targetReposIdxPlan !== -1 ? targetReposIdxPlan + 1 : -1,
        ].filter(i => i > 0)
      );
      const knownPlanFlags = new Set([
        '--yes', '-y', '--type', '--title', '--priority', '--from-plan',
        '--vision-key', '--arch-key', '--migration-reviewed', '--security-reviewed',
        '--target-repos', '--force-create'
      ]);
      const planPath = args.find((arg, i) =>
        i > 0 && !arg.startsWith('-') && !flagValuePositions.has(i) && !knownPlanFlags.has(arg)
      ) || null;
      const planRes = await createFromPlan(planPath, hasYesFlag, {
        typeOverride,
        titleOverride,
        priorityOverride,
        visionKey,
        archKey,
        migrationReviewed,
        securityReviewed,
        targetRepos: targetReposPlan,
        forceCreate,
      });
      exitFromResult(planRes);
    } else if (args[0] === '--child') {
      // Parse --type and --title overrides for child creation
      const childOverrides = {};
      const childTypeIdx = args.indexOf('--type');
      if (childTypeIdx !== -1 && args[childTypeIdx + 1]) {
        childOverrides.type = args[childTypeIdx + 1];
      }
      const childTitleIdx = args.indexOf('--title');
      if (childTitleIdx !== -1 && args[childTitleIdx + 1]) {
        childOverrides.title = args[childTitleIdx + 1];
      }
      // Parse review flags for child creation (GR-MIGRATION-REVIEW / GR-SECURITY-BASELINE)
      if (args.includes('--migration-reviewed')) childOverrides.migrationReviewed = true;
      if (args.includes('--security-reviewed')) childOverrides.securityReviewed = true;
      // SD-LEO-INFRA-LEO-CREATE-CROSS-001: --target-repos for cross-repo child SDs
      const childTargetReposIdx = args.indexOf('--target-repos');
      if (childTargetReposIdx !== -1 && args[childTargetReposIdx + 1]) {
        childOverrides.targetRepos = parseTargetReposArg(args[childTargetReposIdx + 1]);
      }
      // Parse --vision-key / --arch-key for child creation
      const childVisionKeyIdx = args.indexOf('--vision-key');
      if (childVisionKeyIdx !== -1 && args[childVisionKeyIdx + 1]) {
        childOverrides.visionKey = args[childVisionKeyIdx + 1];
      }
      const childArchKeyIdx = args.indexOf('--arch-key');
      if (childArchKeyIdx !== -1 && args[childArchKeyIdx + 1]) {
        childOverrides.archKey = args[childArchKeyIdx + 1];
      }
      // Parse --scope-slice for child creation (SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-A, US-001)
      // Accepts both `--scope-slice=<json>` and `--scope-slice <json>` forms.
      let childScopeSliceIdx = -1;
      let childScopeSliceRaw = null;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--scope-slice') {
          childScopeSliceIdx = i;
          childScopeSliceRaw = args[i + 1];
          break;
        }
        if (args[i].startsWith('--scope-slice=')) {
          childScopeSliceIdx = i;
          childScopeSliceRaw = args[i].slice('--scope-slice='.length);
          break;
        }
      }
      if (childScopeSliceRaw != null) {
        try {
          const parsed = JSON.parse(childScopeSliceRaw);
          if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
            throw new Error('scope_slice must be a JSON object');
          }
          if (parsed.stages !== undefined && !Array.isArray(parsed.stages)) {
            throw new Error('scope_slice.stages must be an array of numbers');
          }
          if (parsed.deliverable_globs !== undefined && !Array.isArray(parsed.deliverable_globs)) {
            throw new Error('scope_slice.deliverable_globs must be an array of glob strings');
          }
          childOverrides.scopeSlice = parsed;
        } catch (err) {
          console.error(`\n❌ Invalid --scope-slice JSON: ${err.message}`);
          console.error(`   Received: ${childScopeSliceRaw}`);
          console.error('   Expected shape: {"stages": [18], "deliverable_globs": ["src/stage18/**"]}');
          process.exit(1);
        }
      }
      // args[1] = parent key, args[2] = index (skip flag positions)
      const childParentKey = args[1];
      const flagValuePositionsChild = new Set(
        [childTypeIdx, childTitleIdx, childVisionKeyIdx, childArchKeyIdx, childTargetReposIdx]
          .filter(i => i !== -1).map(i => i + 1)
      );
      // --scope-slice value (next arg) is also a flag value to skip when finding the index arg
      if (childScopeSliceIdx !== -1 && args[childScopeSliceIdx] === '--scope-slice') {
        flagValuePositionsChild.add(childScopeSliceIdx + 1);
      }
      const childIndexArg = args.find((a, i) =>
        i >= 2 && !a.startsWith('-') && !flagValuePositionsChild.has(i) && i !== childTypeIdx + 1 && i !== childTitleIdx + 1
      );
      // QF-20260610-473: pass null when no explicit index (so an EXPLICIT 0 is honored
      // and the absent case derives from max existing suffix instead of count).
      const childRes = await createChild(childParentKey, childIndexArg != null ? parseInt(childIndexArg, 10) : null, childOverrides);
      exitFromResult(childRes);
    } else {
      // Direct creation lane: <source> <type> "<title>" — moved verbatim to
      // scripts/modules/leo-create-sd/direct-lane.js (SD-ARCH-HOTSPOT-LEO-CREATE-001).
      await runDirectCreation(args);
    }
    // Exit cleanly so fire-and-forget vision scoring doesn't block the process.
    // Without this, Node waits for the detached scoreSDAtConception() HTTP request,
    // causing the CLI to hang and users to retry — creating duplicate SDs.
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
