// One-off: audit existing Stage 19 venture artifacts for default-capabilities
// adherence (feedback widget + error capture middleware).
// SD-LEO-ENH-CONSTRAIN-STAGE-EMIT-001
//
// Read-only by design. The --apply flag is accepted but is a no-op — historical
// retrofit of deviating ventures is OUT-OF-SCOPE for this SD; the audit's CSV
// output may motivate a follow-up SD if any ventures deviate.
//
// Output: logs/venture-default-capabilities-audit-<ISO_DATE>.csv
// Usage:  node scripts/one-off/audit-venture-default-capabilities.mjs [--apply]
//
// Sibling: scripts/one-off/audit-house-stack-adherence.mjs (SD-LEO-ENH-CONSTRAIN-STAGE-EHG-001).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { EHG_VENTURE_DEFAULT_CAPABILITIES } from '../../lib/eva/config/venture-default-capabilities.js';

const APPLY = process.argv.includes('--apply');
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

if (APPLY) {
  console.log('[audit-default-capabilities] --apply is a no-op — audit is read-only by design.');
  console.log('[audit-default-capabilities] Historical retrofit is OUT-OF-SCOPE per SD-LEO-ENH-CONSTRAIN-STAGE-EMIT-001.');
}

console.log('[audit-default-capabilities] Querying venture_artifacts for blueprint_sprint_plan rows…');

const { data: rows, error } = await sb
  .from('venture_artifacts')
  .select('id, venture_id, artifact_data, lifecycle_stage, version, is_current')
  .eq('artifact_type', 'blueprint_sprint_plan')
  .eq('is_current', true)
  .order('venture_id', { ascending: true });

if (error) {
  console.error('[audit-default-capabilities] Query failed:', error.message);
  process.exit(1);
}

if (!rows || rows.length === 0) {
  console.log('[audit-default-capabilities] No blueprint_sprint_plan rows found. Nothing to audit.');
  process.exit(0);
}

console.log(`[audit-default-capabilities] Scanning ${rows.length} sprint plan(s)…`);

// Optional venture-name lookup (best-effort)
let nameByVenture = {};
try {
  const ventureIds = [...new Set(rows.map(r => r.venture_id).filter(Boolean))];
  if (ventureIds.length > 0) {
    const { data: ventures } = await sb
      .from('ventures')
      .select('id, name')
      .in('id', ventureIds);
    if (ventures) nameByVenture = Object.fromEntries(ventures.map(v => [v.id, v.name || '']));
  }
} catch {
  // Suppressed: ventures table or columns may differ across deployments
}

// Permissive matching mirrors validateVentureDefaultCapabilities — title-prefix
// or capability_id substring, case-insensitive.
function isCapabilityPresent(capability, items) {
  if (!Array.isArray(items)) return false;
  const nameLower = String(capability.name || '').toLowerCase();
  const idLower = String(capability.capability_id || '').toLowerCase();
  for (const item of items) {
    const title = String(item?.title || item?.name || '').toLowerCase();
    if (title && (title.startsWith(nameLower) || title.includes(idLower) || nameLower.split(' ').slice(-2).every(w => title.includes(w)))) {
      return true;
    }
  }
  return false;
}

const deviations = [];
for (const row of rows) {
  const sprintPlan = row.artifact_data || {};
  const items = Array.isArray(sprintPlan.sprintItems)
    ? sprintPlan.sprintItems
    : (Array.isArray(sprintPlan.items) ? sprintPlan.items : []);

  const overrideMap = sprintPlan.default_capabilities_override || {};

  for (const capability of EHG_VENTURE_DEFAULT_CAPABILITIES) {
    if (isCapabilityPresent(capability, items)) continue;

    const override = overrideMap[capability.capability_id];
    const overrideReasonRaw = override?.override_reason;
    const overrideReason = typeof overrideReasonRaw === 'string' ? overrideReasonRaw.trim() : '';
    const hasOverride = overrideReason.length > 0;

    deviations.push({
      venture_id: row.venture_id || '',
      venture_name: nameByVenture[row.venture_id] || '',
      missing_capability_id: capability.capability_id,
      has_override_reason: hasOverride,
      override_reason_text: overrideReason,
      sprint_artifact_id: row.id || '',
    });
  }
}

// Stable, deterministic ordering for byte-identical re-runs.
deviations.sort((a, b) => {
  const cmp1 = a.venture_id.localeCompare(b.venture_id);
  if (cmp1 !== 0) return cmp1;
  return a.missing_capability_id.localeCompare(b.missing_capability_id);
});

const isoDate = new Date().toISOString().split('T')[0];
const logsDir = path.resolve('logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
const outPath = path.join(logsDir, `venture-default-capabilities-audit-${isoDate}.csv`);

const header = ['venture_id', 'venture_name', 'missing_capability_id', 'has_override_reason', 'override_reason_text', 'sprint_artifact_id'];
const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const lines = [header.join(',')].concat(
  deviations.map(d => header.map(k => escape(d[k])).join(','))
);

fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');

console.log(`[audit-default-capabilities] Wrote ${deviations.length} deviation row(s) to ${outPath}`);
console.log(`[audit-default-capabilities] Audited ${rows.length} sprint plan(s); ${deviations.length === 0 ? 'all match' : 'see CSV for details'}`);
process.exit(0);
