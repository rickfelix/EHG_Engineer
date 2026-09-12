// AC-13 / TS-9 live smoke: quick_fixes.metadata is UNAPPLIED; prove fail-soft against real schema.
import { mergeQfMetadataKeys } from '../../lib/fleet/qf-metadata-merge.mjs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { stampClaim } = require('../../lib/fleet/claim-stamp.cjs');

const out = { checks: [] };
// 1. Direct merge against live schema
try {
  const r = await mergeQfMetadataKeys('QF-SMOKE-NONEXISTENT', 'sess-smoke', { session_id: 'sess-smoke', claimed_at: new Date().toISOString() });
  out.checks.push({ check: 'mergeQfMetadataKeys_live', threw: false, result: r });
} catch (e) {
  out.checks.push({ check: 'mergeQfMetadataKeys_live', threw: true, error: e.message });
}
// 2. stampClaim with a QF-shaped ref, default (non-injected) merge fn, against live schema
try {
  const r = await stampClaim({}, 'QF-SMOKE-NONEXISTENT', 'sess-smoke', 'env');
  out.checks.push({ check: 'stampClaim_qf_live_default', threw: false, returned: r });
} catch (e) {
  out.checks.push({ check: 'stampClaim_qf_live_default', threw: true, error: e.message });
}
console.log(JSON.stringify(out, null, 2));
