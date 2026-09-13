#!/usr/bin/env node
// non-binding-mode-registry-lint.mjs — CI-asserted check: every known non-binding
// venture-quality mechanism must have a matching leo_feature_flags registry row.
// SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-E (FR-2).
//
// DELIBERATELY curated, not heuristic: a prospective TESTING review (sub_agent_
// execution_results 9d4f650f, finding F8) found that a naming-shape regex scan (a bare
// severity-cap array, a _MODE env comparison, a bracket-notation flag read) matches 20
// locations across 18 files on main today -- only 2 of which are this SD's own
// mechanisms. Scanning the diff for those shapes would go red on the first unrelated
// future PR touching any of the other 16 files. This lint instead checks ONLY the
// explicit list below against the registry; growing coverage is a deliberate, reviewed
// addition to NON_BINDING_MODES, never an automatic scan.
//
// FAIL-CLOSED (TESTING finding F11): a DB-connectivity failure exits non-zero with a
// clear message -- never a silent exit 0 that looks like a pass.
//
// Usage: node scripts/lint/non-binding-mode-registry-lint.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

export const NON_BINDING_MODES = Object.freeze([
  { flagKey: 'DESIGN_FIDELITY_GATE_MODE', file: 'lib/eva/bridge/customer-facing-design-detector.js', lineAnchor: 87 },
  { flagKey: 'LEO_THESIS_KILL_GATE', file: 'lib/eva/lifecycle/thesis-kill-gate.js', lineAnchor: 37 },
  { flagKey: 'WARN_CAPPED_CATEGORIES', file: 'lib/eva/quality-findings/finding-shape.js', lineAnchor: 78 },
  { flagKey: 'VISION_ABSENCE_SEVERITY', file: 'lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js', lineAnchor: 246 },
]);

/**
 * Pure check: given the curated list and the set of flag_keys actually present in
 * leo_feature_flags, return the entries that have no matching registry row.
 * @param {Array<{flagKey:string,file:string,lineAnchor:number}>} modes
 * @param {Set<string>} registeredFlagKeys
 * @returns {Array<{flagKey:string,file:string,lineAnchor:number}>}
 */
export function findUnregistered(modes, registeredFlagKeys) {
  return modes.filter((m) => !registeredFlagKeys.has(m.flagKey));
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<{flagKey:string,file:string,lineAnchor:number}>} [modes]
 * @returns {Promise<{ok:boolean, unregistered:Array, dbUnreachable:boolean, error?:string}>}
 */
export async function runLint(supabase, modes = NON_BINDING_MODES) {
  const flagKeys = modes.map((m) => m.flagKey);
  const { data, error } = await supabase.from('leo_feature_flags').select('flag_key').in('flag_key', flagKeys);
  if (error) {
    return { ok: false, unregistered: [], dbUnreachable: true, error: error.message };
  }
  const registered = new Set((data || []).map((r) => r.flag_key));
  const unregistered = findUnregistered(modes, registered);
  return { ok: unregistered.length === 0, unregistered, dbUnreachable: false };
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[non-binding-mode-registry-lint] FAIL-CLOSED: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — cannot verify the registry, treating as failure.');
    process.exitCode = 1;
    return;
  }
  const supabase = createClient(url, key);
  const result = await runLint(supabase);
  if (result.dbUnreachable) {
    console.error(`[non-binding-mode-registry-lint] FAIL-CLOSED: cannot reach leo_feature_flags (${result.error}) — treating as failure, not a pass.`);
    process.exitCode = 1;
    return;
  }
  if (!result.ok) {
    console.error(`[non-binding-mode-registry-lint] FAILED: ${result.unregistered.length} known non-binding mode(s) have no leo_feature_flags registry row:`);
    for (const m of result.unregistered) {
      console.error(`  - ${m.flagKey} (${m.file}:${m.lineAnchor})`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`[non-binding-mode-registry-lint] OK: all ${NON_BINDING_MODES.length} known non-binding mode(s) are registered.`);
  process.exitCode = 0;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('[non-binding-mode-registry-lint] FATAL:', e.message); process.exit(1); });
}
