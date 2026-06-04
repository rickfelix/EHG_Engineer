/**
 * Unit tests for the --enrich-leaf CLI contract.
 * SD-LEO-INFRA-WIRE-PRE-BUILD-002 — FR-1 (TS-5a introspection, TS-5b guarded live mode).
 *
 * main() is invoked with injected deps (supabase/logger/resolver), so no real DB and
 * no LLM. The LIVE drive itself is session-hosted and covered by the FR-7 smoke.
 */
import { describe, it, expect } from 'vitest';
import { parseArgs, main } from '../../../../lib/eva/bridge/venture-build-consumer.js';

function capture() {
  const lines = [];
  return { lines, log: (m) => lines.push(String(m)), error: (m) => lines.push('ERR ' + m), warn: () => {} };
}

describe('FR-1 --enrich-leaf CLI', () => {
  it('parseArgs parses --enrich-leaf <leafKey> alongside --venture-id/--dry-run', () => {
    const a = parseArgs(['node', 'x', '--enrich-leaf', 'SD-X-D1', '--venture-id', 'v1', '--dry-run']);
    expect(a.enrichLeaf).toBe('SD-X-D1');
    expect(a.ventureId).toBe('v1');
    expect(a.dryRun).toBe(true);
  });

  it('TS-5b: live --enrich-leaf (no --dry-run) refuses headlessly — exit 2, session-hosted, no silent no-op', async () => {
    const logger = capture();
    const r = await main(['node', 'x', '--enrich-leaf', 'SD-X-D1', '--venture-id', 'v1'], { supabase: {}, pgClient: null, logger });
    expect(r.exitCode).toBe(2);
    expect(r.sessionHosted).toBe(true);
    expect(r.enrichLeaf).toBe('SD-X-D1');
    expect(logger.lines.join(' ')).toMatch(/session-hosted/i);
  });

  it('TS-5a: --enrich-leaf --dry-run introspects the manifest + required codes with NO driver/DB writes', async () => {
    const logger = capture();
    const resolveLeafArtifactTypes = async () => ({ artifactTypes: ['blueprint_data_model'], criteriaOpts: { dataSensitive: true } });
    const r = await main(
      ['node', 'x', '--enrich-leaf', 'SD-X-D1', '--venture-id', 'v1', '--dry-run'],
      { supabase: {}, pgClient: null, logger, resolveLeafArtifactTypes },
    );
    expect(r.exitCode).toBe(0);
    expect(r.introspection.requiredCodes).toContain('VENTURE_STACK');
    expect(r.introspection.wouldRunAgents.length).toBeGreaterThan(0);
    expect(logger.lines.join('\n')).toMatch(/no driver dispatch, no DB writes/);
  });

  it('introspection tolerates an unresolved leaf (empty artifact types) without crashing', async () => {
    const logger = capture();
    const r = await main(
      ['node', 'x', '--enrich-leaf', 'SD-X-D1', '--venture-id', 'v1', '--dry-run'],
      { supabase: {}, pgClient: null, logger }, // no resolver => default returns {}
    );
    expect(r.exitCode).toBe(0);
    expect(r.introspection).toBeTruthy();
  });
});
