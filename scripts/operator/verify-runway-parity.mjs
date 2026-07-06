#!/usr/bin/env node
/**
 * scripts/operator/verify-runway-parity.mjs
 *
 * TR-1 anti-drift oracle: proves computeRunway() (EHG_Engineer, lib/operator/cash-burn-substrate.js)
 * and distanceToBroke() (ehg, src/components/chairman-v3/survivability/survivability-logic.ts)
 * reach an IDENTICAL verdict (headline + months) for every row in the shared canonical fixture
 * (lib/operator/runway-parity-fixture.json), and that their per-input liveness-window constants
 * are pinned equal across repos.
 *
 * distanceToBroke() has ZERO runtime dependencies -- its only import is `import type { NorthStar }`,
 * which is erased entirely by TypeScript's type-stripping. This lets us load it directly via
 * esbuild's TS transform + a temp-file dynamic import, with no ehg build step and no `@/` alias
 * resolution needed.
 *
 * Exit code 0 = full parity. Non-zero = at least one mismatch (printed to stderr).
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import * as esbuild from 'esbuild';
import { computeRunway, LIVENESS_WINDOWS_MS } from '../../lib/operator/cash-burn-substrate.js';
import { resolveRepoPath } from '../../lib/repo-paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, '../../lib/operator/runway-parity-fixture.json');
const EHG_SURVIVABILITY_REL_PATH = 'src/components/chairman-v3/survivability/survivability-logic.ts';

/**
 * Transpile + dynamically import the ehg survivability-logic module (zero runtime deps).
 * Resolves the canonical ehg root via resolveRepoPath() by default (the correct target for a
 * production drift check); EHG_REPO_PATH_OVERRIDE lets a session working in an isolated ehg
 * worktree (e.g. mid-EXEC, before merge) point this at that worktree instead.
 */
async function loadEhgSurvivabilityModule() {
  const ehgRoot = process.env.EHG_REPO_PATH_OVERRIDE || resolveRepoPath('ehg');
  const srcPath = path.join(ehgRoot, EHG_SURVIVABILITY_REL_PATH);
  const source = readFileSync(srcPath, 'utf8');
  const { code } = await esbuild.transform(source, { loader: 'ts', format: 'esm' });
  const tmpFile = path.join(__dirname, `.tmp-survivability-logic-${process.pid}-${Date.now()}.mjs`);
  writeFileSync(tmpFile, code);
  try {
    return await import(`file://${tmpFile.replace(/\\/g, '/')}`);
  } finally {
    unlinkSync(tmpFile);
  }
}

async function main() {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  const nowMs = Date.parse(fixture.nowIso);
  const ehgMod = await loadEhgSurvivabilityModule();
  const { distanceToBroke, DTB_LIVENESS_WINDOWS_MS } = ehgMod;

  let failures = 0;

  // TR-1 cross-repo constant equality.
  for (const key of Object.keys(LIVENESS_WINDOWS_MS)) {
    if (LIVENESS_WINDOWS_MS[key] !== DTB_LIVENESS_WINDOWS_MS[key]) {
      failures++;
      console.error(
        `MISMATCH [constant:${key}]: LIVENESS_WINDOWS_MS.${key}=${LIVENESS_WINDOWS_MS[key]} !== DTB_LIVENESS_WINDOWS_MS.${key}=${DTB_LIVENESS_WINDOWS_MS[key]}`
      );
    }
  }

  for (const c of fixture.cases) {
    const eng = computeRunway(c.row, { nowMs });
    const ehg = distanceToBroke(c.row, nowMs);
    const engMonths = eng.months_of_runway;
    const ehgMonths = ehg.runwayMonths;

    const headlineMatchesEachOther = eng.headline === ehg.headline;
    const monthsMatchesEachOther = engMonths === ehgMonths;
    const headlineMatchesExpected = eng.headline === c.expected.headline && ehg.headline === c.expected.headline;
    const monthsMatchesExpected = engMonths === c.expected.months && ehgMonths === c.expected.months;

    if (!headlineMatchesEachOther || !monthsMatchesEachOther || !headlineMatchesExpected || !monthsMatchesExpected) {
      failures++;
      console.error(`MISMATCH [${c.name}]:`);
      console.error(`  expected:     headline=${JSON.stringify(c.expected.headline)} months=${c.expected.months}`);
      console.error(`  EHG_Engineer: headline=${JSON.stringify(eng.headline)} months=${engMonths}`);
      console.error(`  ehg:          headline=${JSON.stringify(ehg.headline)} months=${ehgMonths}`);
    }
  }

  if (failures > 0) {
    console.error(`\n❌ verify-runway-parity: ${failures} mismatch(es) across ${fixture.cases.length} cases`);
    process.exit(1);
  }
  console.log(`✅ verify-runway-parity: ${fixture.cases.length} cases + liveness-window constants all match across repos`);
}

main().catch((err) => {
  console.error('verify-runway-parity failed:', err);
  process.exit(1);
});
