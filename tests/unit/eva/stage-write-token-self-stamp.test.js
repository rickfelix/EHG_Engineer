/**
 * SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 (FR-2) — every JS/mjs writer of
 * ventures.current_lifecycle_stage must self-stamp stage_write_token in the SAME .update() call,
 * matching its ventures_canonical_writer_policy() registry identity exactly.
 *
 * REGRESSION FIX (adversarial REGRESSION review R1): an UNCONDITIONAL `stage_write_token: '<id>'`
 * key would make PostgREST reject the WHOLE update (PGRST204/42703) on every stage write from the
 * moment this code merges/deploys until the chairman ceremony applies the column -- a live-breaking
 * ordering bug, the exact inversion of "writers stamp first" this SD exists to enforce. Every call
 * site now spreads `await stageWriteTokenField(supabase, '<id>')`, which degrades to `{}` until the
 * column is confirmed present (see stage-write-token-probe.js, mirroring the established
 * lib/ship/repo-column-probe.mjs pattern for the same class of problem). These source-grep checks
 * assert the CALL to stageWriteTokenField with the right identity appears at each write site, not a
 * literal key -- the literal key would now be the wrong (regressed) shape.
 *
 * Source-grep tier (matches this codebase's established convention for cross-cutting stamp checks,
 * e.g. the R5 choke DDL test's static assertions on migration SQL text): behavioral coverage for the
 * simpler call sites lives in tests/unit/eva/saga-coordinator.test.js
 * ('should self-stamp stage_write_token...'); stage-execution-worker.js's 3 sites are covered here
 * via source-grep rather than full behavioral driving, since exercising them behaviorally requires
 * the same large dependency-mocking surface as tests/unit/eva/stage-execution-worker-*-gate.test.js
 * (acquireProcessingLock, chairman-decision-watcher, stage-governance, etc.) for no additional
 * assurance beyond confirming the payload shape at the call site itself.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (relPath) => fs.readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), 'utf8');

describe('stage_write_token self-stamp — source coverage', () => {
  it('stage-execution-worker.js: all 3 current_lifecycle_stage write sites probe before stamping', () => {
    const src = read('../../../lib/eva/stage-execution-worker.js');
    const matches = src.match(/\.update\(\{[^}]*current_lifecycle_stage:[^}]*\}\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
    for (const m of matches) {
      expect(m).toMatch(/stageWriteTokenField\([^)]*'stage-execution-worker\.js'\)/);
    }
    // No call site may carry an unconditional literal -- that's the exact regression being guarded.
    expect(src).not.toMatch(/\.update\(\{[^}]*stage_write_token:\s*'stage-execution-worker\.js'/);
  });

  it('venture-ceo/handlers.js: _updateVentureProgress probes before stamping', () => {
    const src = read('../../../lib/agents/venture-ceo/handlers.js');
    const fnBody = src.slice(src.indexOf('async function _updateVentureProgress'), src.indexOf('async function _updateVentureProgress') + 900);
    expect(fnBody).toMatch(/current_lifecycle_stage:\s*completedStage \+ 1/);
    expect(fnBody).toMatch(/stageWriteTokenField\([^)]*'venture-ceo-handlers\.js'\)/);
  });

  it('scripts/eva-run.js: --stage override write probes before stamping', () => {
    const src = read('../../../scripts/eva-run.js');
    const m = src.match(/\.update\(\{[^}]*current_lifecycle_stage:[^}]*\}\)/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/stageWriteTokenField\([^)]*'eva-run\.js'\)/);
  });

  it('scripts/canary/run-canary-probe.mjs: deterministic-reset write probes before stamping', () => {
    const src = read('../../../scripts/canary/run-canary-probe.mjs');
    const m = src.match(/\.update\(\{[^}]*current_lifecycle_stage:[^}]*\}\)/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/stageWriteTokenField\([^)]*'run-canary-probe\.mjs'\)/);
  });

  it('scripts/reconciliation-packet-apply.mjs calls the advance_venture_stage RPC, never a raw write', () => {
    const src = read('../../../scripts/reconciliation-packet-apply.mjs');
    expect(src).toMatch(/supabase\.rpc\('advance_venture_stage'/);
    expect(src).not.toMatch(/\.from\('ventures'\)\s*\.update\(\{[^}]*current_lifecycle_stage/);
  });

  it('every probing call site imports stageWriteTokenField from the shared probe module', () => {
    for (const relPath of [
      '../../../lib/eva/stage-execution-worker.js',
      '../../../lib/agents/venture-ceo/handlers.js',
      '../../../lib/eva/saga-coordinator.js',
      '../../../scripts/eva-run.js',
      '../../../scripts/canary/run-canary-probe.mjs',
    ]) {
      const src = read(relPath);
      expect(src).toMatch(/import\s*\{\s*stageWriteTokenField\s*\}\s*from\s*'[^']*stage-write-token-probe\.js'/);
    }
  });
});
