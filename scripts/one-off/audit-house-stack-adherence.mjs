// One-off: audit existing Stage 14 venture artifacts for house-stack adherence.
// SD-LEO-ENH-CONSTRAIN-STAGE-EHG-001
//
// Read-only by design. The --apply flag is accepted but is a no-op — historical
// retrofit of deviating ventures is OUT-OF-SCOPE for this SD; the audit's CSV
// output may motivate a follow-up SD if any ventures deviate.
//
// Output: logs/house-stack-adherence-audit-<ISO_DATE>.csv
// Usage:  node scripts/one-off/audit-house-stack-adherence.mjs [--apply]
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import {
  EHG_HOUSE_TECH_STACK,
  EHG_HOUSE_AUTH_STRATEGY,
  HOUSE_STACK_LAYER_NAMES,
} from '../../lib/eva/config/house-tech-stack.js';

const APPLY = process.argv.includes('--apply');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

if (APPLY) {
  console.log('[audit-house-stack] --apply is a no-op — audit is read-only by design.');
  console.log('[audit-house-stack] Historical retrofit is OUT-OF-SCOPE per SD-LEO-ENH-CONSTRAIN-STAGE-EHG-001.');
}

console.log('[audit-house-stack] Querying venture_artifacts for blueprint_technical_architecture rows…');

const { data: rows, error } = await sb
  .from('venture_artifacts')
  .select('venture_id, artifact_data, lifecycle_stage, version, is_current')
  .eq('artifact_type', 'blueprint_technical_architecture')
  .eq('is_current', true)
  .order('venture_id', { ascending: true });

if (error) {
  console.error('[audit-house-stack] Query failed:', error.message);
  process.exit(1);
}

if (!rows || rows.length === 0) {
  console.log('[audit-house-stack] No blueprint_technical_architecture rows found. Nothing to audit.');
  process.exit(0);
}

console.log(`[audit-house-stack] Scanning ${rows.length} venture artifact(s)…`);

// Optional venture-name lookup (best-effort; if ventures table is absent, names stay blank)
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

const deviations = [];
for (const row of rows) {
  const arch = row.artifact_data || {};
  const layers = arch.layers || {};
  const overrideReason = String(arch.override_reason || '').trim();
  const hasOverride = overrideReason.length > 0;

  for (const layerName of HOUSE_STACK_LAYER_NAMES) {
    const expected = EHG_HOUSE_TECH_STACK[layerName].technology;
    const actual = layers[layerName]?.technology ?? '';
    if (actual !== expected) {
      deviations.push({
        venture_id: row.venture_id || '',
        venture_name: nameByVenture[row.venture_id] || '',
        deviating_layer: layerName,
        expected_technology: expected,
        actual_technology: actual,
        has_override_reason: hasOverride,
        override_reason_text: overrideReason,
      });
    }
  }

  // Sixth free-choice scaffolding string: security.authStrategy
  const expectedAuth = EHG_HOUSE_AUTH_STRATEGY.technology;
  const actualAuth = arch.security?.authStrategy ?? '';
  if (actualAuth !== expectedAuth) {
    deviations.push({
      venture_id: row.venture_id || '',
      venture_name: nameByVenture[row.venture_id] || '',
      deviating_layer: 'security.authStrategy',
      expected_technology: expectedAuth,
      actual_technology: actualAuth,
      has_override_reason: hasOverride,
      override_reason_text: overrideReason,
    });
  }
}

// Stable, deterministic ordering for byte-identical re-runs
deviations.sort((a, b) => {
  const cmp1 = a.venture_id.localeCompare(b.venture_id);
  if (cmp1 !== 0) return cmp1;
  return a.deviating_layer.localeCompare(b.deviating_layer);
});

const isoDate = new Date().toISOString().split('T')[0];
const logsDir = path.resolve('logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
const outPath = path.join(logsDir, `house-stack-adherence-audit-${isoDate}.csv`);

const header = ['venture_id', 'venture_name', 'deviating_layer', 'expected_technology', 'actual_technology', 'has_override_reason', 'override_reason_text'];
const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const lines = [header.join(',')].concat(
  deviations.map(d => header.map(k => escape(d[k])).join(','))
);

fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');

console.log(`[audit-house-stack] Wrote ${deviations.length} deviation row(s) to ${outPath}`);
console.log(`[audit-house-stack] Audited ${rows.length} venture(s); ${deviations.length === 0 ? 'all match' : 'see CSV for details'}`);
process.exit(0);
