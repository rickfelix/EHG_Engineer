/**
 * SD-LEO-INFRA-S19-DUPLICATE-ORCHESTRATOR-TREE-001 (FR-5)
 *
 * RCA 0.97: _runS19Bridge read sprint_name from artifacts[0] = its own re-written output -> 'unknown'
 * -> a divergent SPRINT-UNKNOWN orchestrator that evaded dedup -> a DUPLICATE build tree. The fix makes
 * sprint_name deterministic (exclude own output + read the payload-source artifact; signature fallback)
 * and backs findExistingOrchestrator's dedup with a stable payload signature. These tests prove the
 * dedup + signature behavior on a fake supabase, and assert the worker no longer reads its own output.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sprintSignature, _internal } from '../../../lib/eva/lifecycle-sd-bridge.js';

const { findExistingOrchestrator } = _internal;

// ── FR-2: signature stability ────────────────────────────────────────────────
describe('sprintSignature', () => {
  const a = { title: 'Build the API', type: 'backend' };
  const b = { title: 'Wire the UI', type: 'frontend' };
  it('is stable + order-independent over the payload SET', () => {
    expect(sprintSignature([a, b])).toBe(sprintSignature([b, a]));
    expect(sprintSignature([a, b])).toMatch(/^[0-9a-f]{12}$/);
  });
  it('distinct payload sets => distinct signatures (genuinely-distinct sprints preserved)', () => {
    expect(sprintSignature([a, b])).not.toBe(sprintSignature([a]));
    expect(sprintSignature([a])).not.toBe(sprintSignature([b]));
  });
  it('empty / odd input => empty string (total)', () => {
    expect(sprintSignature([])).toBe('');
    expect(sprintSignature(undefined)).toBe('');
    expect(sprintSignature(null)).toBe('');
  });
});

// In-memory supabase double for the orchestrator dedup query + children query.
function makeSb(orchestrators = [], children = []) {
  return {
    from() {
      const filters = {};
      let parentId; // set only on the children query
      const builder = {
        select() { return builder; },
        eq(col, val) { if (col === 'parent_sd_id') parentId = val; else filters[col] = val; return builder; },
        order() { return builder; },
        is(col, val) { filters[`is:${col}`] = val; return builder; },
        async limit() {
          const rows = orchestrators.filter((o) =>
            (filters['sd_type'] === undefined || o.sd_type === filters['sd_type']) &&
            (filters['metadata->>venture_id'] === undefined || o.metadata?.venture_id === filters['metadata->>venture_id']) &&
            (filters['metadata->>sprint_signature'] === undefined || o.metadata?.sprint_signature === filters['metadata->>sprint_signature']) &&
            (filters['metadata->>sprint_name'] === undefined || o.metadata?.sprint_name === filters['metadata->>sprint_name']),
          );
          return { data: rows.slice(0, 1), error: null };
        },
        // children query is awaited directly (no .limit) → thenable
        then(res) { res({ data: children.filter((c) => c.parent_sd_id === parentId).map((c) => ({ sd_key: c.sd_key })), error: null }); },
      };
      return builder;
    },
  };
}

// ── FR-1/FR-2: idempotent dedup even when sprint_name drifted to 'unknown' ────
describe('findExistingOrchestrator — dedup', () => {
  const VID = 'venture-1';
  const PAYLOADS = [{ title: 'Build the API', type: 'backend' }, { title: 'Wire the UI', type: 'frontend' }];
  const SIG = sprintSignature(PAYLOADS);
  const existing = { id: 'orch-1', sd_key: 'SD-LEO-ORCH-SPRINT-DATADISTILL-001', sd_type: 'orchestrator', metadata: { venture_id: VID, sprint_signature: SIG, sprint_name: 'DataDistill 06-01' } };

  it('TS-1: a re-invocation whose sprint_name drifted to "unknown" STILL finds the tree via the signature (no duplicate)', async () => {
    const sb = makeSb([existing]);
    const r = await findExistingOrchestrator(sb, VID, 'unknown', SIG);
    expect(r).not.toBeNull();
    expect(r.orchestratorKey).toBe('SD-LEO-ORCH-SPRINT-DATADISTILL-001');
  });

  it('TS-2: a genuinely-distinct sprint (different payloads => different signature) is NOT collapsed', async () => {
    const sb = makeSb([existing]);
    const otherSig = sprintSignature([{ title: 'SaaS billing', type: 'backend' }]);
    expect(await findExistingOrchestrator(sb, VID, 'DataDistill 06-02-SaaS', otherSig)).toBeNull();
  });

  it('legacy orchestrator with no stored signature still dedups via the sprint_name fallback', async () => {
    const legacy = { id: 'orch-0', sd_key: 'SD-LEO-ORCH-SPRINT-LEGACY-001', sd_type: 'orchestrator', metadata: { venture_id: VID, sprint_name: 'Legacy Sprint' } };
    const sb = makeSb([legacy]);
    const r = await findExistingOrchestrator(sb, VID, 'Legacy Sprint', sprintSignature(PAYLOADS));
    expect(r?.orchestratorKey).toBe('SD-LEO-ORCH-SPRINT-LEGACY-001');
  });

  it('returns the children of the matched orchestrator', async () => {
    const sb = makeSb([existing], [{ parent_sd_id: 'orch-1', sd_key: 'SD-LEO-ORCH-SPRINT-DATADISTILL-001-01' }]);
    const r = await findExistingOrchestrator(sb, VID, 'DataDistill 06-01', SIG);
    expect(r.childKeys).toEqual(['SD-LEO-ORCH-SPRINT-DATADISTILL-001-01']);
  });

  it('no match => null; missing ventureId => null', async () => {
    expect(await findExistingOrchestrator(makeSb([]), VID, 'x', 'deadbeef')).toBeNull();
    expect(await findExistingOrchestrator(makeSb([existing]), null, 'x', SIG)).toBeNull();
  });
});

// ── FR-1/FR-3: the worker no longer reads its own output / no literal 'unknown' ──
describe('FR-1/FR-3 source guarantees (stage-execution-worker _runS19Bridge)', () => {
  const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../lib/eva/stage-execution-worker.js'), 'utf8');
  const block = src.slice(src.indexOf('Fetch sd_bridge_payloads from S19 artifacts'), src.indexOf('const ventureContext = { id: ventureId'));
  it("excludes the bridge's own output (artifact_type lifecycle_sd_bridge) from the read", () => {
    expect(block).toMatch(/\.neq\(\s*'artifact_type'\s*,\s*'lifecycle_sd_bridge'\s*\)/);
  });
  it('derives sprint_name from the payload-source artifact, not artifacts[0]/firstArt', () => {
    expect(block).toMatch(/sprint_name:\s*sprintSourceContent\?\.sprint_name/);
    expect(block).not.toMatch(/firstContent|firstArt/);
  });
  it("the fallback is a deterministic signature label, never the literal 'unknown'", () => {
    expect(block).toMatch(/`sprint-\$\{sprintSignature\(sdBridgePayloads\)\}`/);
    expect(block).not.toMatch(/\|\|\s*'unknown'/);
  });
});
