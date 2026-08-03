/**
 * QF-20260802-245 — run-stage.js must EXIT after a successful run, and must be able to say what
 * it is doing.
 *
 * THE FAILURE THIS PINS: a real-mode stage-5 run for venture 50763b6a completed in 28.3s with
 * validation PASS and wrote its artifact + venture_stage_work in place — then sat until a shell
 * timeout killed it. The operator saw ">10 minutes, zero rows written" and reasonably concluded
 * the stage was hanging pre-persist. It had already finished. Two independent causes:
 *
 *   1. NO process.exit(0) on the success path. Real mode opens Supabase connections dry-run skips
 *      (resolveEvaKeys / persistArtifact / syncStageWork / processLifecycleTerminal are all
 *      !dryRun-guarded); their undici keep-alive handles hold the event loop open forever.
 *      Measured: EXIT=124 (killed at 150s) before, EXIT=0 (clean at ~29s) after.
 *
 *   2. The engine's logger was hard-silenced (log: () => {}), so the one line that contained the
 *      whole answer — "[stage-work-sync] venture_stage_work synced for stage 5 (status: blocked,
 *      advisory_data: 28 keys)" — was discarded. A check that CAN distinguish the hypotheses is
 *      worthless if its output is thrown away for tidiness.
 *
 * Asserted on CODE with comments stripped: this file's own comments quote the removed
 * `log: () => {}` verbatim, so a raw-text match would pass on its own explanation. That mistake
 * was made twice earlier in this session.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = readFileSync(resolve(REPO_ROOT, 'scripts/eva/run-stage.js'), 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the process must exit after a successful run', () => {
  it('calls process.exit(0) on the success path', () => {
    expect(CODE).toMatch(/process\.exit\(0\)/);
  });

  it('the success exit is INSIDE the async IIFE, not after it', () => {
    // If it sat outside, it would fire before the awaited work finished and truncate the run.
    const iifeStart = CODE.indexOf('(async () => {');
    const catchStart = CODE.indexOf('})().catch');
    const exitZero = CODE.indexOf('process.exit(0)', iifeStart);
    expect(iifeStart).toBeGreaterThan(-1);
    expect(catchStart).toBeGreaterThan(iifeStart);
    expect(exitZero).toBeGreaterThan(iifeStart);
    expect(exitZero).toBeLessThan(catchStart);
  });

  it('still exits non-zero on failure — the error path is unchanged', () => {
    expect(CODE).toMatch(/Stage execution failed[\s\S]{0,120}process\.exit\(1\)/);
  });

  it('CONTROL: the stripper did not empty the file', () => {
    // Without this, every assertion above could pass vacuously on an empty string.
    expect(CODE).toMatch(/executeStage\(/);
    expect(CODE.length).toBeGreaterThan(500);
  });
});

describe('a block must never again be unlabeled', () => {
  it('--verbose surfaces the engine progress lines that were being discarded', () => {
    expect(CODE).toMatch(/--verbose/);
    expect(CODE).toMatch(/verbose[\s\S]{0,120}log:\s*console\.log/);
  });

  it('default output is unchanged — verbose is OPT-IN', () => {
    // Existing callers must see byte-identical output; diagnosability is not worth a surprise
    // regression in anything parsing this script's stdout.
    expect(CODE).toMatch(/log:\s*\(\)\s*=>\s*\{\}/);
  });

  it('--verbose is documented in the usage line', () => {
    expect(CODE).toMatch(/Usage:[\s\S]{0,200}--verbose/);
  });
});

describe('SCOPE: the chairman-gate question is NOT decided here', () => {
  it('this change does not add an onBeforeAnalysis to stage-05', () => {
    // The venture stays stage_status=blocked because stage-05 defines no onBeforeAnalysis, so no
    // chairman_decisions row is ever created and the gate branch at stage-execution-engine.js:576
    // is skipped entirely. Whether stage 5 SHOULD be a gate stage is a governance decision, not a
    // bug fix — deliberately left to the coordinator. This test exists so a later reader does not
    // mistake this QF for having resolved it.
    const stage05 = readFileSync(
      resolve(REPO_ROOT, 'lib/eva/stage-templates/analysis-steps/stage-05-financial-model.js'), 'utf8');
    expect(stage05).not.toMatch(/onBeforeAnalysis/);
  });

  it('the engine gate branch is untouched by this QF', () => {
    const engine = readFileSync(resolve(REPO_ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Still guarded on a decision id, still bounded — neither was the cause and neither changed.
    expect(engine).toMatch(/if \(beforeAnalysisContext\.chairmanDecisionId && output\)/);
    expect(engine).toMatch(/timeoutMs:\s*5000/);
  });
});
