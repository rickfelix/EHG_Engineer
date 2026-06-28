// SD-LEO-INFRA-CHAIRMAN-DECISION-RESOLVE-CANONICAL-001
// Locks the canonical chairman-decision resolve path:
//   FR-1 (migration): fn_chairman_decide writes the full (status, decision, blocking) triple —
//         approved->proceed, rejected->kill, blocking=false — never decision='pending'.
//   FR-3 (refactor): the 3 autonomous resolve sites call fn_chairman_decide via RPC instead of
//         hand-writing the triple onto chairman_decisions.
//   FR-4 (guard): the autonomous (fresh same-pass) resolves pass p_force_stale=true.
//
// These are source-level invariant tests (per FR-3's acceptance criterion: "a grep/AST check finds
// no remaining direct .update({status/decision/blocking}) on chairman_decisions in the in-scope
// paths"). They are robust to the worker's heavy runtime deps (which make behavioral mocking
// brittle) and lock the exact refactor + migration contract this SD delivers.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const read = (rel) => readFileSync(resolve(repoRoot, rel), 'utf8');

const WORKER = 'lib/eva/stage-execution-worker.js';
const ORCH = 'lib/eva/eva-orchestrator.js';
const MIGRATION = 'database/migrations/20260628_chairman_decision_canonical_resolve.sql';

describe('FR-3: autonomous resolve sites call the canonical fn_chairman_decide RPC', () => {
  const worker = read(WORKER);
  const orch = read(ORCH);

  it('the worker no longer hand-writes a status=approved resolve onto chairman_decisions', () => {
    // The old hand-write pattern: .update({ status: 'approved', decision: 'proceed', ... })
    // Match a .update({...}) object literal that sets status to a terminal value (the resolve).
    const handWriteResolve = /\.update\(\{[^}]*status:\s*['"](approved|rejected)['"][^}]*\}\)/g;
    expect(worker.match(handWriteResolve)).toBeNull();
    expect(orch.match(handWriteResolve)).toBeNull();
  });

  it('the worker calls fn_chairman_decide via RPC for both resolve sites (auto-approve + S19 vision)', () => {
    const rpcCalls = worker.match(/rpc\(\s*['"]fn_chairman_decide['"]/g) || [];
    expect(rpcCalls.length).toBeGreaterThanOrEqual(2); // :840 auto-approve + :3941 S19 vision
  });

  it('the orchestrator auto-approve calls fn_chairman_decide via RPC', () => {
    expect(orch).toMatch(/rpc\(\s*['"]fn_chairman_decide['"]/);
  });

  it('FR-4: every canonical resolve from an autonomous path passes p_force_stale: true', () => {
    // Each fn_chairman_decide RPC call in these autonomous files is a fresh same-pass resolve and
    // must opt out of the stale-context guard.
    for (const [name, src] of [['worker', worker], ['orchestrator', orch]]) {
      const calls = src.split(/rpc\(\s*['"]fn_chairman_decide['"]/).slice(1);
      for (const tail of calls) {
        const argBlock = tail.slice(0, 400); // the args object follows the rpc name
        expect(argBlock, `${name} fn_chairman_decide call must pass p_force_stale: true`).toMatch(/p_force_stale:\s*true/);
        expect(argBlock, `${name} fn_chairman_decide call must pass p_action: 'approved'`).toMatch(/p_action:\s*['"]approved['"]/);
      }
    }
  });
});

describe('FR-1: the migration makes fn_chairman_decide write the full consistent triple', () => {
  const sql = read(MIGRATION);

  it('maps approved->proceed and rejected->kill (decision values, not pending)', () => {
    expect(sql).toMatch(/WHEN\s+'approved'\s+THEN\s+'proceed'/i);
    expect(sql).toMatch(/WHEN\s+'rejected'\s+THEN\s+'kill'/i);
  });

  it('the UPDATE sets decision AND blocking (not status-only)', () => {
    const updateBlock = sql.slice(sql.indexOf('UPDATE chairman_decisions'));
    expect(updateBlock).toMatch(/decision\s*=\s*v_decision_value/);
    expect(updateBlock).toMatch(/blocking\s*=\s*false/);
    expect(updateBlock).toMatch(/status\s*=\s*p_action/);
  });

  it('FR-2 was split out: the migration does NOT alter the unblock trigger', () => {
    // FR-2 (broaden trg_chairman_decision_unblock to rejected) was proven unsafe and deferred.
    expect(sql).not.toMatch(/CREATE\s+TRIGGER\s+trg_chairman_decision_unblock/i);
    expect(sql).not.toMatch(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+trg_chairman_decision_unblock/i);
  });

  it('is a single declared object: only fn_chairman_decide (CREATE OR REPLACE FUNCTION)', () => {
    const createFns = sql.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION/gi) || [];
    expect(createFns.length).toBe(1);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_chairman_decide/i);
  });
});
