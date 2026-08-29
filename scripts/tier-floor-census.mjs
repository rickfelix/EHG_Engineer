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
    line: 806,
    symbol: 'assertWorkerTierAllowed',
    posture: 'enforcing',
    note: 'Calls tierRankVerdict(workerRank, minRank) unconditionally in the WORK_ASSIGNMENT dispatch path; throws DISPATCH_ABOVE_WORKER_TIER on refusal.',
  },
  {
    file: 'lib/fleet/claim-eligibility.cjs',
    line: 351,
    symbol: 'tierAxes',
    posture: 'enforcing',
    note: 'Calls tierRankVerdict via ctx.worker_tier_rank/ctx.tiering_active; one of the INELIGIBILITY_AXES consumed by classifyDispatchIneligibility. ctx-gated: no-ops if ctx.tiering_active !== true.',
  },
  {
    file: 'lib/fleet/tier-claimable.cjs',
    line: 100,
    symbol: 'claimableForTier',
    posture: 'enforcing',
    note: 'Filters via tierBlocks(), which force-passes tiering_active:true so an explicit per-SD floor is honored even with tiering globally off.',
  },
  {
    file: 'scripts/sd-start.js',
    line: null,
    symbol: '(claim primitive)',
    posture: 'non-enforcing',
    note: 'Zero tier code (grep -c tier = 0 as of SD authoring). The atomic claim primitive a worker calls by SD key -- bypasses every other gate. Wired to enforce by this SD (FR-2).',
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
    posture: 'enforcing',
    note: 'Reads ctx.tierCtx.worker_tier_rank/.tiering_active, passes into classifyDispatchIneligibility/tierBlocks. Already threaded via SD-LEO-INFRA-SELF-CLAIM-TIER-ENFORCEMENT-001.',
  },
  {
    file: 'scripts/worker-checkin.cjs',
    line: 1080,
    symbol: 'recoverStrandedFinal',
    posture: 'enforcing',
    note: 'Independent tierBlocks(sd, tierCtx.worker_tier_rank, tierCtx.tiering_active) call, distinct from the earlier classifyDispatchIneligibility call in the same function (which runs with NO tierCtx and is inert) and distinct from QF-20260829-186s phase-filter widening.',
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
