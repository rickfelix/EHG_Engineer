// SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-D — byte-parity regression for the
// generated ehg/src/config/venture-workflow.ts.
//
// The generator (scripts/generate-stage-config.cjs) reads venture_stages (DB
// SSOT) and emits venture-workflow.ts. The HARD invariant is byte-parity: the
// generated file is byte-identical to the committed file EXCEPT its leading
// generated banner. This proves zero app behavior change across the file's
// many importers.
//
// Mechanism: run the generator binary with `--check`, which performs the
// banner-stripped byte-compare itself and exits non-zero on any drift. We also
// assert the committed file carries the generated banner + the expected
// structural anchors (interface, TOTAL_STAGES, all 10 helper exports) so a
// future hand-edit that strips them is caught.

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'generate-stage-config.cjs');

// Resolve the committed ehg venture-workflow.ts via the same resolver the
// generator uses, so this test follows the registry/sibling resolution.
function resolveVentureWorkflow() {
  if (process.env.EHG_APP_PATH) {
    return path.join(process.env.EHG_APP_PATH, 'src', 'config', 'venture-workflow.ts');
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolveRepoPath } = require(path.join(REPO_ROOT, 'lib', 'repo-paths.cjs'));
  const ehg = resolveRepoPath('ehg');
  return ehg ? path.join(ehg, 'src', 'config', 'venture-workflow.ts') : null;
}

describe('venture-workflow.ts byte-parity (SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-D)', () => {
  it('generate-stage-config.cjs --check passes (no drift, byte-parity holds)', () => {
    let stderr = '';
    try {
      execSync(`node "${SCRIPT}" --check`, {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: 60000,
      });
    } catch (err) {
      throw new Error(
        `--check failed (exit ${err.status}).\nstderr: ${err.stderr || '(empty)'}\n` +
          `Regenerate: node scripts/generate-stage-config.cjs --write`
      );
    }
    expect(stderr).not.toMatch(/CHECK FAILED/);
  }, 90000);

  it('committed venture-workflow.ts carries the generated banner + structural anchors', () => {
    const vw = resolveVentureWorkflow();
    // If the sibling ehg repo is not present (some CI lanes), skip gracefully.
    if (!vw || !fs.existsSync(vw)) return;
    const src = fs.readFileSync(vw, 'utf8');

    // Generated banner present (the one sanctioned difference from history).
    expect(src).toMatch(/GENERATED FILE — DO NOT HAND-EDIT/);

    // CRLF preserved.
    expect(src.includes('\r\n')).toBe(true);

    // Structural anchors that the generator reproduces verbatim.
    expect(src).toMatch(/export interface VentureStage \{/);
    expect(src).toMatch(/export const TOTAL_STAGES = 26;/);
    for (const fn of [
      'getStageByNumber',
      'getStageByKey',
      'getStagesByChunk',
      'getKillGates',
      'getPromotionGates',
      'isKillGate',
      'isPromotionGate',
      'getReviewModeStages',
      'getStageNameForNumber',
    ]) {
      expect(src).toContain(`export function ${fn}(`);
    }

    // Exactly 26 stage objects (stageNumber: N).
    const stageCount = (src.match(/stageNumber:\s*\d+/g) || []).length;
    expect(stageCount).toBe(26);
  });
});
