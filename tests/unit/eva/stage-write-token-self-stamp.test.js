/**
 * SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 (FR-2) — every JS/mjs writer of
 * ventures.current_lifecycle_stage must self-stamp stage_write_token in the SAME .update() call,
 * matching its ventures_canonical_writer_policy() registry identity exactly.
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
  it('stage-execution-worker.js: all 3 current_lifecycle_stage write sites carry the identity stamp', () => {
    const src = read('../../../lib/eva/stage-execution-worker.js');
    const matches = src.match(/\.update\(\{[^}]*current_lifecycle_stage:[^}]*\}\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
    for (const m of matches) {
      expect(m).toMatch(/stage_write_token:\s*'stage-execution-worker\.js'/);
    }
  });

  it('venture-ceo/handlers.js: _updateVentureProgress carries the identity stamp', () => {
    const src = read('../../../lib/agents/venture-ceo/handlers.js');
    const fnBody = src.slice(src.indexOf('async function _updateVentureProgress'), src.indexOf('async function _updateVentureProgress') + 700);
    expect(fnBody).toMatch(/current_lifecycle_stage:\s*completedStage \+ 1/);
    expect(fnBody).toMatch(/stage_write_token:\s*'venture-ceo-handlers\.js'/);
  });

  it('scripts/eva-run.js: --stage override write carries the identity stamp', () => {
    const src = read('../../../scripts/eva-run.js');
    const m = src.match(/\.update\(\{[^}]*current_lifecycle_stage:[^}]*\}\)/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/stage_write_token:\s*'eva-run\.js'/);
  });

  it('scripts/canary/run-canary-probe.mjs: deterministic-reset write carries the identity stamp', () => {
    const src = read('../../../scripts/canary/run-canary-probe.mjs');
    const m = src.match(/\.update\(\{[^}]*current_lifecycle_stage:[^}]*\}\)/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/stage_write_token:\s*'run-canary-probe\.mjs'/);
  });

  it('scripts/reconciliation-packet-apply.mjs calls the advance_venture_stage RPC, never a raw write', () => {
    const src = read('../../../scripts/reconciliation-packet-apply.mjs');
    expect(src).toMatch(/supabase\.rpc\('advance_venture_stage'/);
    expect(src).not.toMatch(/\.from\('ventures'\)\s*\.update\(\{[^}]*current_lifecycle_stage/);
  });
});
