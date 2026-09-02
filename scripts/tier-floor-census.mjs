#!/usr/bin/env node
/**
 * SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001 — FR-1
 *
 * Repo-wide sweep for readers of min_tier_rank / tier_rank / tierRank, printed alongside the
 * known-posture rows so the census can be re-verified on demand rather than trusted as a static
 * list. Read-only -- issues no writes.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PATTERN = 'min_tier_rank|tier_rank|tierRank';

export const KNOWN_SURFACES = [
  {
    file: 'lib/coordinator/dispatch.cjs',
    line: 868,
    symbol: 'assertWorkerTierAllowed',
    posture: 'advisory',
    note: 'RETIRED to advisory-only by QF-20260831-419: both throw branches (above_worker_tier/tier_stamp_missing at :921, reserved_no_lower_backlog at :943) now only log.info and fall through -- no throw remains. Slated for deletion by SD-FDBK-INFRA-RETIRE-SEAT-TIER-001 (chairman ratification 20dc072b).',
  },
  {
    file: 'lib/fleet/claim-eligibility.cjs',
    line: 366,
    symbol: 'tierAxes',
    posture: 'advisory (partially -- see note)',
    note: 'The above_worker_tier/tier_stamp_missing/reserved_no_lower_backlog branches (QF-20260831-419) are advisory-only. The SAME function also holds two genuinely-still-enforcing branches -- fable_window_downward_claim_blocked (:394-404, ruling QF-20260709-881) and unverified_seat_capability (:390-392, ruling FLEET-MODEL-REGISTRY-001 FR-6) -- which SD-FDBK-INFRA-RETIRE-SEAT-TIER-001 fences and must NOT delete.',
  },
  {
    file: 'lib/fleet/tier-claimable.cjs',
    line: 108,
    symbol: 'claimableForTier',
    posture: 'advisory (dead by construction)',
    note: 'Filters via tierBlocks(), which compares against verdict strings tierAxes no longer emits post-QF-20260831-419 -- tierBlocks() always returns false. Slated for deletion by SD-FDBK-INFRA-RETIRE-SEAT-TIER-001.',
  },
  {
    file: 'scripts/sd-start.js',
    line: 274,
    symbol: 'enforceTierGate',
    posture: 'advisory (dead by construction)',
    note: 'Its sole gating call is to the now-inert tierBlocks(). Slated for deletion by SD-FDBK-INFRA-RETIRE-SEAT-TIER-001.',
  },
  {
    file: 'scripts/lib/claimable-leaves.mjs',
    line: 57,
    symbol: 'claimableDbFreeReason',
    posture: 'deferred',
    note: "Calls classifyDispatchIneligibility(d) with NO ctx -- tier axis provably inert. In-code comment cites FORECASTER-CLAIMABLE-PREDICATE-001 FR-5 as a deliberate LEAD-approved deferral. This SD is the deferred decision landing (FR-2).",
  },
  {
    file: 'lib/checkin/steps/merged-pool-self-claim.cjs',
    line: 100,
    symbol: '(merged-pool self-claim lane)',
    posture: 'advisory (dead for the tier-rank axis; still feeds live fenced axes)',
    note: 'Reads ctx.tierCtx.worker_tier_rank/.tiering_active into the now-inert tierBlocks(), so the tier-rank axis is dead. Lines :118 (reservations) and :140-144 (fable_window_active) still produce ctx consumed by the live fenced mechanisms -- fenced from deletion by SD-FDBK-INFRA-RETIRE-SEAT-TIER-001.',
  },
  {
    file: 'scripts/worker-checkin.cjs',
    line: 1116,
    symbol: 'recoverStrandedFinal',
    posture: 'advisory (dead by construction)',
    note: 'tierBlocks(sd, tierCtx.worker_tier_rank, tierCtx.tiering_active) call is inert (see tier-claimable.cjs entry). A second call site exists in adoptOrphanInProgress at :1444. Slated for deletion by SD-FDBK-INFRA-RETIRE-SEAT-TIER-001.',
  },
  {
    file: 'lib/fleet/dispatch-suggestions.cjs',
    line: 46,
    symbol: 'candidateFitScore',
    posture: 'non-enforcing (advisory-by-design)',
    note: 'Header comment states ADVISORY ONLY, never assigns. Reads min_tier_rank purely to rank suggestion fit. Recorded so it is not mistaken for a gap.',
  },
  {
    file: 'scripts/assign-fleet-identities.cjs',
    line: 545,
    symbol: '(cron writer)',
    posture: 'writer (not an enforcement surface)',
    note: 'The authoritative cron writer of claude_sessions.metadata.tier_rank -- the write-path FR-4s stamp re-baseline targets. Recorded to distinguish writer from enforcer.',
  },
  {
    file: 'lib/sd-creation/pipeline.js',
    line: 1096,
    symbol: '(mint-time stamp call site)',
    posture: 'writer (not an enforcement surface)',
    note: 'Calls stampPayloadForCreation() (lib/fleet/sd-tier-rank.mjs) at SD creation time to set metadata.min_tier_rank. The write-path FR-5s mint-time advisory-by-default policy targets.',
  },
];

export function sweep(cwd = process.cwd()) {
  let out;
  try {
    out = execFileSync(
      'git',
      ['grep', '-n', '-E', PATTERN, '--', '*.js', '*.cjs', '*.mjs'],
      { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 * 32 }
    );
  } catch (err) {
    // git grep exits 1 when there are zero matches -- not an error for our purposes.
    if (err.status === 1) return [];
    throw err;
  }
  return out
    .split('\n')
    .filter(Boolean)
    .filter((line) => !line.startsWith('.worktrees/') && !line.includes('node_modules/'))
    .map((line) => {
      const idx = line.indexOf(':');
      const idx2 = line.indexOf(':', idx + 1);
      return { file: line.slice(0, idx), line: Number(line.slice(idx + 1, idx2)), raw: line };
    });
}

function main() {
  const hits = sweep();
  const knownFiles = new Set(KNOWN_SURFACES.map((s) => s.file));
  const unknownFiles = [...new Set(hits.map((h) => h.file))].filter((f) => !knownFiles.has(f));

  console.log(`Sweep found ${hits.length} raw hits across ${new Set(hits.map((h) => h.file)).size} files.`);
  console.log(`\nKnown surfaces (${KNOWN_SURFACES.length}):`);
  for (const s of KNOWN_SURFACES) {
    console.log(`  [${s.posture}] ${s.file}${s.line ? ':' + s.line : ''} (${s.symbol})`);
  }
  console.log(`\nUnrecognized files with a hit (${unknownFiles.length}) -- review before closing the census:`);
  for (const f of unknownFiles) console.log(`  ${f}`);

  const outPath = new URL('../scripts/temp/tier-floor-census-report.json', import.meta.url);
  const report = { total_hits: hits.length, known_surfaces: KNOWN_SURFACES, unrecognized_files: unknownFiles };
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${outPath.pathname}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
