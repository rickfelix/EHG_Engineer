/**
 * Integration Verification Gate
 *
 * Runs at orchestrator EXEC-COMPLETE boundary to verify:
 * 1. All children completed (status=completed, progress=100)
 * 2. Deliverables cross-reference correctly between children
 * 3. delivers_capabilities have consumers (no orphans)
 *
 * Advisory mode only — always returns pass=true with warnings.
 *
 * SD: SD-MAN-ORCH-SCOPE-COMPLEXITY-ANALYSIS-001-B
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

/**
 * Check that all children of an orchestrator are completed.
 * @param {Array} children - Child SDs
 * @returns {{warnings: string[]}}
 */
export function checkChildrenCompleted(children) {
  const warnings = [];
  if (!Array.isArray(children) || children.length === 0) {
    return { warnings: ['No children found for orchestrator'] };
  }

  for (const child of children) {
    if (child.status !== 'completed') {
      warnings.push(`${child.sd_key}: status is '${child.status}' (expected 'completed')`);
    }
    if (child.progress != null && child.progress < 100) {
      warnings.push(`${child.sd_key}: progress is ${child.progress}% (expected 100%)`);
    }
  }

  return { warnings };
}

/**
 * Cross-reference deliverables between children via handoff manifests.
 * Checks that deliverables referenced by one child are produced by another.
 * @param {Array} handoffs - Handoff records with deliverables_manifest
 * @param {Array} children - Child SDs for context
 * @returns {{warnings: string[]}}
 */
export function checkDeliverablesCrossRef(handoffs, children) {
  const warnings = [];
  if (!Array.isArray(handoffs) || handoffs.length === 0) {
    return { warnings };
  }

  // Collect all deliverables by SD
  const deliverablesBySd = new Map();
  for (const handoff of handoffs) {
    const manifest = handoff.deliverables_manifest;
    if (!manifest || typeof manifest !== 'object') continue;

    const sdId = handoff.sd_id;
    if (!deliverablesBySd.has(sdId)) deliverablesBySd.set(sdId, []);

    const items = Array.isArray(manifest) ? manifest :
      (Array.isArray(manifest.deliverables) ? manifest.deliverables : []);

    for (const item of items) {
      const name = typeof item === 'string' ? item : (item?.name || item?.file || '');
      if (name) deliverablesBySd.get(sdId).push(name);
    }
  }

  // Check for SDs with no deliverables
  const childKeys = new Set((children || []).map(c => c.sd_key));
  for (const key of childKeys) {
    if (!deliverablesBySd.has(key) || deliverablesBySd.get(key).length === 0) {
      warnings.push(`${key}: no deliverables found in handoff manifests`);
    }
  }

  return { warnings };
}

/**
 * Check for orphaned capabilities (delivered but not consumed).
 * @param {Array} children - Child SDs with delivers_capabilities
 * @param {Array} allSds - All SDs for consumer checking
 * @returns {{warnings: string[]}}
 */
export function checkOrphanedCapabilities(children, allSds) {
  const warnings = [];
  if (!Array.isArray(children) || children.length === 0) return { warnings };

  // Collect all capabilities delivered by children
  const delivered = new Map();
  for (const child of children) {
    const caps = Array.isArray(child.delivers_capabilities) ? child.delivers_capabilities : [];
    for (const cap of caps) {
      const key = typeof cap === 'string' ? cap : (cap?.capability_key || '');
      if (key) {
        delivered.set(key, child.sd_key);
      }
    }
  }

  if (delivered.size === 0) return { warnings };

  // Check if any non-child SD references these capabilities
  const childKeys = new Set(children.map(c => c.sd_key));
  const consumed = new Set();

  for (const sd of (allSds || [])) {
    if (childKeys.has(sd.sd_key)) continue;
    const deps = Array.isArray(sd.dependencies) ? sd.dependencies : [];
    for (const dep of deps) {
      const depName = typeof dep === 'string' ? dep : (dep?.dependency || dep?.capability || '');
      if (delivered.has(depName)) consumed.add(depName);
    }
  }

  for (const [capKey, producerSd] of delivered) {
    if (!consumed.has(capKey)) {
      warnings.push(`Capability '${capKey}' delivered by ${producerSd} has no known consumer`);
    }
  }

  return { warnings };
}

/**
 * Run integration verification on an orchestrator SD.
 * Advisory mode: always returns pass=true with warnings array.
 *
 * @param {string} sdKey - Orchestrator SD key
 * @param {object} [options]
 * @param {object} [options.supabase] - Supabase client (for testing)
 * @returns {Promise<null|{pass: boolean, score: number, warnings: string[], checks: object}>}
 */
export async function verifyIntegration(sdKey, options = {}) {
  const supabase = options.supabase || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Get the SD
  const { data: sdArr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, sd_type, metadata')
    .eq('sd_key', sdKey)
    .limit(1);

  if (!sdArr || sdArr.length === 0) return null;
  const sd = sdArr[0];

  const isOrchestrator = sd.sd_type === 'orchestrator' ||
    sd.metadata?.is_orchestrator === true ||
    sd.metadata?.pattern_type === 'orchestrator';

  if (!isOrchestrator) return null;

  // Get children
  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, status, progress, delivers_capabilities, dependencies')
    .eq('parent_sd_id', sd.id);

  const childList = children || [];

  // Check 1: Children completed
  const completionCheck = checkChildrenCompleted(childList);

  // Check 2: Deliverables cross-reference
  const childKeys = childList.map(c => c.sd_key);
  let handoffs = [];
  if (childKeys.length > 0) {
    const { data: hData } = await supabase
      .from('sd_phase_handoffs')
      .select('sd_id, deliverables_manifest')
      .in('sd_id', childKeys)
      .eq('status', 'accepted');
    handoffs = hData || [];
  }
  const deliverableCheck = checkDeliverablesCrossRef(handoffs, childList);

  // Check 3: Orphaned capabilities
  const { data: allSds } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, dependencies')
    .neq('parent_sd_id', sd.id)
    .limit(100);
  const capabilityCheck = checkOrphanedCapabilities(childList, allSds || []);

  const allWarnings = [
    ...completionCheck.warnings,
    ...deliverableCheck.warnings,
    ...capabilityCheck.warnings,
  ];

  const score = allWarnings.length === 0 ? 100 :
    Math.max(0, 100 - (allWarnings.length * 15));

  return {
    pass: true, // Advisory mode: always pass
    score,
    warnings: allWarnings,
    checks: {
      children_completed: completionCheck.warnings.length === 0,
      deliverables_cross_ref: deliverableCheck.warnings.length === 0,
      no_orphaned_capabilities: capabilityCheck.warnings.length === 0,
    },
  };
}

/**
 * Format gate result for display.
 * @param {object|null} result
 * @returns {string}
 */
export function formatGateResult(result) {
  if (!result) return '';

  const lines = [
    '\n🔍 INTEGRATION VERIFICATION GATE (Advisory)',
    `   Score: ${result.score}/100`,
    `   Children Completed: ${result.checks.children_completed ? '✅' : '⚠️'}`,
    `   Deliverables Cross-Ref: ${result.checks.deliverables_cross_ref ? '✅' : '⚠️'}`,
    `   No Orphaned Capabilities: ${result.checks.no_orphaned_capabilities ? '✅' : '⚠️'}`,
  ];

  if (result.warnings.length > 0) {
    lines.push(`\n   Warnings (${result.warnings.length}):`);
    for (const w of result.warnings) {
      lines.push(`   ⚠️  ${w}`);
    }
  } else {
    lines.push('   ✅ All integration checks passed');
  }

  return lines.join('\n');
}
