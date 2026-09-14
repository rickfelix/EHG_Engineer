/**
 * Dispatch registry: enumerates every known way a module under
 * lib/eva/stage-templates/analysis-steps/ is reached in production.
 *
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-C (P2.2). Feeds an ADVISORY-ONLY report
 * consumed by wire-check-gate.js -- the existing blanket lib/eva/stage-templates/**
 * regex exemption in that gate is NOT removed by this change; it is retired in a
 * later, separate PR once this registry has run advisory for a bake-in period and
 * is proven complete (RISK sub-agent mitigation, evidence row
 * c185874e-f8ed-4afc-9ae2-5480f032bb4d).
 *
 * Two dispatch mechanisms are modeled; both were independently re-verified against
 * the live tree on 2026-09-14 (not taken on a sub-agent's word alone):
 *
 * (a) STATIC_STAGE_DISPATCH -- each of the 27 stage-NN.js files (stage-01.js
 *     through stage-27.js; the 3 sibling files that also match the stage-*.js glob
 *     -- stage-01-constants.js, stage-15-screens.js, stage-key-registry.js -- are
 *     NOT dispatchers and are correctly excluded) does `TEMPLATE.analysisStep =
 *     <fn>` after a static `import ... from './analysis-steps/*.js'`. Verified via
 *     `grep -n "from '\\./analysis-steps/" lib/eva/stage-templates/stage-*.js`:
 *     32 import statements across the 27 files (stage-02/15/16 import more than
 *     one). Note the stage-number-skewed filenames this list preserves verbatim,
 *     e.g. stage-24.js:20 dispatches ./analysis-steps/stage-23-launch-readiness.js
 *     and stage-21.js:12 dispatches ./analysis-steps/stage-22-distribution-setup.js
 *     -- an existing naming quirk, not a typo in this registry.
 *
 * (b) CROSS_CUTTING_DISPATCH -- 4 production (non-test) files import an
 *     analysis-step module directly, outside any stage-NN.js chain. Verified via a
 *     repo-wide grep excluding lib/eva/__tests__/ (a test importing a module is
 *     not a production dispatch path).
 *
 * NOT modeled: lib/eva/stage-templates/analysis-steps/index.js's
 * getAnalysisStep()/getAcquirabilityStep() dynamic-loader maps. Verified via
 * `grep -rn "getAnalysisStep(\\|getAcquirabilityStep(" lib/ scripts/ server/` to have
 * ZERO callers anywhere outside their own declarations in index.js itself --
 * dead code, a deletion candidate for a follow-up SD, not a live dispatch path
 * this registry needs to represent as reachable. Of the 51 analysis-step files,
 * this leaves some files with zero registry entries (their only theoretical
 * "reachability" runs through that dead map) -- checkDispatchCoverage below
 * reports these advisory, by design, rather than hiding the gap.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ANALYSIS_STEPS_DIR = path.join(__dirname, 'analysis-steps');

export const STATIC_STAGE_DISPATCH = Object.freeze([
  { stageFile: 'stage-01.js', analysisStepFile: 'stage-01-hydration.js' },
  { stageFile: 'stage-02.js', analysisStepFile: 'stage-02-multi-persona.js' },
  { stageFile: 'stage-02.js', analysisStepFile: 'stage-02-demand-thesis.js' },
  { stageFile: 'stage-03.js', analysisStepFile: 'stage-03-hybrid-scoring.js' },
  { stageFile: 'stage-04.js', analysisStepFile: 'stage-04-competitive-landscape.js' },
  { stageFile: 'stage-05.js', analysisStepFile: 'stage-05-financial-model.js' },
  { stageFile: 'stage-06.js', analysisStepFile: 'stage-06-risk-matrix.js' },
  { stageFile: 'stage-07.js', analysisStepFile: 'stage-07-pricing-strategy.js' },
  { stageFile: 'stage-08.js', analysisStepFile: 'stage-08-bmc-generation.js' },
  { stageFile: 'stage-09.js', analysisStepFile: 'stage-09-exit-strategy.js' },
  { stageFile: 'stage-10.js', analysisStepFile: 'stage-10-customer-brand.js' },
  { stageFile: 'stage-11.js', analysisStepFile: 'stage-11-visual-identity.js' },
  { stageFile: 'stage-12.js', analysisStepFile: 'stage-12-gtm-sales.js' },
  { stageFile: 'stage-13.js', analysisStepFile: 'stage-13-product-roadmap.js' },
  { stageFile: 'stage-14.js', analysisStepFile: 'stage-14-technical-architecture.js' },
  { stageFile: 'stage-15.js', analysisStepFile: 'stage-15-wireframe-generator.js' },
  { stageFile: 'stage-15.js', analysisStepFile: 'stage-19-visual-convergence.js' },
  { stageFile: 'stage-15.js', analysisStepFile: 'stage-15-user-story-pack.js' },
  { stageFile: 'stage-15.js', analysisStepFile: 'stage-15-ia-generator.js' },
  { stageFile: 'stage-15.js', analysisStepFile: 'stage-15-user-journey.js' },
  { stageFile: 'stage-16.js', analysisStepFile: 'stage-16-financial-projections.js' },
  { stageFile: 'stage-16.js', analysisStepFile: 'stage-16-positioning-brief.js' },
  { stageFile: 'stage-17.js', analysisStepFile: 'stage-17-blueprint-review.js' },
  { stageFile: 'stage-18.js', analysisStepFile: 'stage-18-marketing-copy.js' },
  { stageFile: 'stage-19.js', analysisStepFile: 'stage-19-sprint-planning.js' },
  { stageFile: 'stage-20.js', analysisStepFile: 'stage-20-code-quality.js' },
  { stageFile: 'stage-21.js', analysisStepFile: 'stage-22-distribution-setup.js' },
  { stageFile: 'stage-22.js', analysisStepFile: 'stage-21-visual-assets.js' },
  { stageFile: 'stage-23.js', analysisStepFile: 'stage-23-dedicated-venture-uat.js' },
  { stageFile: 'stage-24.js', analysisStepFile: 'stage-23-launch-readiness.js' },
  { stageFile: 'stage-25.js', analysisStepFile: 'stage-24-go-live.js' },
  { stageFile: 'stage-26.js', analysisStepFile: 'stage-25-post-launch-review.js' },
  { stageFile: 'stage-27.js', analysisStepFile: 'stage-26-growth-playbook.js' },
]);

export const CROSS_CUTTING_DISPATCH = Object.freeze([
  { consumerFile: 'lib/eva/chairman-product-review.js', analysisStepFile: 'stage-23-launch-readiness.js' },
  { consumerFile: 'lib/eva/wireframe-surface-normalizer.js', analysisStepFile: 'stage-15-wireframe-generator.js' },
  { consumerFile: 'lib/eva/stage-17/archetype-generator.js', analysisStepFile: 'stage-15-wireframe-generator.js' },
  { consumerFile: 'lib/eva/stage-handlers/s17.js', analysisStepFile: 'stage-17-doc-generation.js' },
]);

/** All registry entries, static + cross-cutting, in one flat list. */
export function allDispatchEntries() {
  return [...STATIC_STAGE_DISPATCH, ...CROSS_CUTTING_DISPATCH];
}

/** All analysis-step source files on disk, excluding the dead index.js loader itself. */
export function listAnalysisStepFiles(dir = ANALYSIS_STEPS_DIR, readdirFn = fs.readdirSync) {
  return readdirFn(dir).filter((f) => f.endsWith('.js') && f !== 'index.js');
}

/**
 * BLOCKING limb: every registry entry's analysisStepFile must resolve to a real
 * file. Trivially true by construction against the real tree -- this only catches
 * a future registry edit that names a file that doesn't (or no longer) exists.
 */
export function checkRegistryEntriesResolve(entries, dir = ANALYSIS_STEPS_DIR, existsFn = fs.existsSync) {
  return entries
    .filter((e) => !existsFn(path.join(dir, e.analysisStepFile)))
    .map((e) => ({ ...e, reason: 'FILE_NOT_FOUND' }));
}

/**
 * ADVISORY limb: any analysis-step file with zero or more than one registry
 * entry. Zero entries means the file's only theoretical reachability today runs
 * through the dead getAnalysisStep/getAcquirabilityStep maps (see module docblock)
 * -- worth surfacing, never worth failing the build over.
 */
export function checkDispatchCoverage(analysisStepFiles, entries) {
  const counts = new Map();
  for (const e of entries) counts.set(e.analysisStepFile, (counts.get(e.analysisStepFile) || 0) + 1);
  return analysisStepFiles
    .filter((f) => (counts.get(f) || 0) !== 1)
    .map((f) => ({
      file: f,
      registryEntryCount: counts.get(f) || 0,
      reason: (counts.get(f) || 0) === 0 ? 'UNREGISTERED' : 'MULTIPLE_ENTRIES',
    }));
}
