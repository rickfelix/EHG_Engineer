/**
 * Unit tests for the stage-worker supervisor watch-set composition.
 * SD-FDBK-FIX-STAGE-TEMPLATE-FIXES-001.
 *
 * Pure / process-free: verifies the watch root covers the worker's runtime graph
 * (the reported stage-templates gap plus the audit-identified dependency dirs and the
 * previously-watched paths) and stays bounded to lib/eva.
 */
import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { buildWatchPaths, isPathWatched } from './stage-worker-watch.js';

const ROOT = resolve('/repo-root');
const wp = buildWatchPaths(ROOT);
const p = (rel) => resolve(ROOT, rel);

describe('buildWatchPaths', () => {
  it('watches the lib/eva runtime root', () => {
    expect(wp).toEqual([resolve(ROOT, 'lib', 'eva')]);
  });
});

describe('isPathWatched — covers the reported bug + the full runtime graph', () => {
  it('covers stage templates (the SD symptom) including new + nested', () => {
    expect(isPathWatched(wp, p('lib/eva/stage-templates/stage-21-visual-assets.js'))).toBe(true);
    expect(isPathWatched(wp, p('lib/eva/stage-templates/stage-27.js'))).toBe(true); // future template
    expect(isPathWatched(wp, p('lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js'))).toBe(true);
    expect(isPathWatched(wp, p('lib/eva/stage-templates/index.js'))).toBe(true);
  });

  it('still covers the three previously-watched paths (no regression)', () => {
    expect(isPathWatched(wp, p('lib/eva/stage-execution-worker.js'))).toBe(true);
    expect(isPathWatched(wp, p('lib/eva/bridge/lifecycle-sd-bridge.js'))).toBe(true);
    expect(isPathWatched(wp, p('lib/eva/artifact-persistence-service.js'))).toBe(true);
  });

  it('covers the audit-identified dependency dirs + orchestrator', () => {
    expect(isPathWatched(wp, p('lib/eva/utils/parse-json.js'))).toBe(true);
    expect(isPathWatched(wp, p('lib/eva/contracts/financial-contract.js'))).toBe(true);
    expect(isPathWatched(wp, p('lib/eva/quality-findings/finding-shape.js'))).toBe(true);
    expect(isPathWatched(wp, p('lib/eva/config/house-tech-stack.js'))).toBe(true);
    expect(isPathWatched(wp, p('lib/eva/eva-orchestrator.js'))).toBe(true);
    expect(isPathWatched(wp, p('lib/eva/stage-03.js'))).toBe(true); // stage-NN constants imported by analysis-steps
  });
});

describe('isPathWatched — bounded to lib/eva (no over-broad respawn)', () => {
  it('does NOT watch paths outside lib/eva', () => {
    expect(isPathWatched(wp, p('scripts/start-stage-worker.js'))).toBe(false);
    expect(isPathWatched(wp, p('lib/coordinator/resolve.cjs'))).toBe(false);
    expect(isPathWatched(wp, p('node_modules/chokidar/index.js'))).toBe(false);
  });

  it('does NOT match a sibling dir that shares the lib/eva name prefix', () => {
    expect(isPathWatched(wp, p('lib/eva-extra/x.js'))).toBe(false);
    expect(isPathWatched(wp, p('lib/evaluation/y.js'))).toBe(false);
  });

  it('handles empty / missing inputs without throwing', () => {
    expect(isPathWatched(wp, '')).toBe(false);
    expect(isPathWatched([], p('lib/eva/stage-templates/stage-21.js'))).toBe(false);
    expect(isPathWatched(undefined, p('lib/eva/x.js'))).toBe(false);
  });
});
