import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runDetector,
  persistResults,
  parseEndpoints,
  parseArtifactTypes,
  parseRpcNames,
} from '../../../scripts/wiring-validators/spec-code-drift-detector.js';

const __filename = fileURLToPath(import.meta.url);
const WORKTREE_ROOT = resolve(__filename, '..', '..', '..', '..');

test('parseEndpoints extracts HTTP method + path pairs', () => {
  const md = `
- POST /api/widgets/create
- DELETE /api/widgets/:id
- Inline: call GET /stage17/status for readiness
`;
  const eps = parseEndpoints(md);
  assert.equal(eps.length, 3);
  assert.deepEqual(eps.map((e) => e.method), ['POST', 'DELETE', 'GET']);
  assert.deepEqual(eps.map((e) => e.path), ['/api/widgets/create', '/api/widgets/:id', '/stage17/status']);
});

test('parseArtifactTypes extracts artifact_type literals', () => {
  const md = `
- Fixture: artifact_type="stitch_curation"
- Another: artifact_type: 'logo_image'
- Set artifact_type='identity_logo_image' for S11 outputs
`;
  const ats = parseArtifactTypes(md);
  assert.equal(ats.length, 3);
  assert.deepEqual(ats.map((a) => a.type).sort(), ['identity_logo_image', 'logo_image', 'stitch_curation']);
});

test('parseRpcNames extracts supabase.rpc() calls', () => {
  const md = `
The runner invokes supabase.rpc('run_wiring_validation', { sd_key })
and also .rpc("update_sd_wiring_validated").
`;
  const rpcs = parseRpcNames(md);
  assert.deepEqual(rpcs.map((r) => r.name).sort(), ['run_wiring_validation', 'update_sd_wiring_validated']);
});

test('runDetector via --fixture-content flags missing endpoint as CRITICAL', async () => {
  const md = 'POST /api/widgets/nonexistent-endpoint-xyz';
  const results = await runDetector({ sdKey: 'SD-TEST', root: WORKTREE_ROOT, fixtureContent: md });
  assert.equal(results.length, 1);
  const sigs = results[0].signals_detected.filter((s) => s.type === 'endpoint');
  assert.equal(sigs.length, 1);
  assert.equal(sigs[0].severity, 'CRITICAL');
  assert.equal(results[0].status, 'fail');
});

test('runDetector passes when fixture has no declarations', async () => {
  const results = await runDetector({ sdKey: 'SD-TEST', root: WORKTREE_ROOT, fixtureContent: '# Plain text, no declarations' });
  assert.equal(results[0].status, 'pass');
  assert.equal(results[0].signals_detected.length, 0);
});

test('persistResults no-ops when supabase is null', async () => {
  const r = await persistResults(null, { sd_key: 'X', check_type: 'spec_code_drift', status: 'pass' });
  assert.equal(r.skipped, true);
});
