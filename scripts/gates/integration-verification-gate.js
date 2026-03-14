/**
 * Integration Verification Gate
 * SD-MAN-ORCH-SCOPE-COMPLEXITY-ANALYSIS-001-B
 *
 * Runs at orchestrator EXEC-COMPLETE boundary. Verifies:
 * 1. All children are completed (status + progress)
 * 2. Deliverables cross-reference correctly between children
 * 3. Capabilities have consumers (no orphans)
 *
 * Advisory mode only — always returns pass=true with warnings.
 *
 * @module integration-verification-gate
 * @version 1.0.0
 */

/**
 * Resolve an SD identifier (UUID or sd_key) to { id, sd_key }.
 *
 * @param {string} idOrKey - UUID id or sd_key
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{id: string, sd_key: string, sd_type: string}|null>}
 */
async function resolveSD(idOrKey, supabase) {
  // Try sd_key first
  const { data: byKey } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, sd_type')
    .eq('sd_key', idOrKey)
    .limit(1);

  if (byKey && byKey.length > 0) return byKey[0];

  // Try UUID id
  const { data: byId } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, sd_type')
    .eq('id', idOrKey)
    .limit(1);

  if (byId && byId.length > 0) return byId[0];

  return null;
}

/**
 * Verify all children of an orchestrator SD are completed.
 *
 * @param {string} parentId - Parent UUID id
 * @param {string} parentSdKey - Parent sd_key (for messages)
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{complete: boolean, warnings: string[], children: Object[]}>}
 */
async function verifyChildrenCompleted(parentId, parentSdKey, supabase) {
  const warnings = [];

  const { data: children, error: childErr } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, status, progress, current_phase')
    .eq('parent_sd_id', parentId);

  if (childErr || !children || children.length === 0) {
    warnings.push(`No children found for orchestrator ${parentSdKey}`);
    return { complete: false, warnings, children: [] };
  }

  let allComplete = true;

  for (const child of children) {
    if (child.status !== 'completed') {
      warnings.push(`Child ${child.sd_key} status is '${child.status}' (expected 'completed')`);
      allComplete = false;
    }
    if (child.progress !== 100) {
      warnings.push(`Child ${child.sd_key} progress is ${child.progress}% (expected 100%)`);
      allComplete = false;
    }
  }

  return { complete: allComplete, warnings, children };
}

/**
 * Cross-reference deliverables_manifest between children.
 *
 * @param {string} parentId - Parent UUID id
 * @param {string} parentSdKey - Parent sd_key
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{warnings: string[], deliverableSummary: Object}>}
 */
async function crossReferenceDeliverables(parentId, parentSdKey, supabase) {
  const warnings = [];

  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, id')
    .eq('parent_sd_id', parentId);

  if (!children || children.length === 0) {
    warnings.push('No children to cross-reference deliverables');
    return { warnings, deliverableSummary: {} };
  }

  const deliverablesByChild = {};

  for (const child of children) {
    const { data: handoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('deliverables_manifest')
      .eq('sd_id', child.sd_key)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
      .limit(1);

    const manifest = handoffs?.[0]?.deliverables_manifest;
    if (manifest) {
      deliverablesByChild[child.sd_key] = parseDeliverables(manifest);
    } else {
      warnings.push(`Child ${child.sd_key} has no deliverables manifest in accepted handoffs`);
    }
  }

  // Check for file path overlaps between children
  const allFiles = {};
  for (const [sdKey, deliverables] of Object.entries(deliverablesByChild)) {
    for (const file of deliverables) {
      if (!allFiles[file]) {
        allFiles[file] = [];
      }
      allFiles[file].push(sdKey);
    }
  }

  const overlaps = Object.entries(allFiles).filter(([, owners]) => owners.length > 1);
  if (overlaps.length > 0) {
    for (const [file, owners] of overlaps) {
      warnings.push(`Deliverable overlap: '${file}' claimed by ${owners.join(', ')}`);
    }
  }

  return {
    warnings,
    deliverableSummary: {
      childCount: children.length,
      deliverableCount: Object.keys(allFiles).length,
      overlaps: overlaps.length
    }
  };
}

/**
 * Parse deliverables from a manifest (string or JSON).
 *
 * @param {string|Object} manifest - Deliverables manifest
 * @returns {string[]} File paths
 */
function parseDeliverables(manifest) {
  if (!manifest) return [];

  if (typeof manifest === 'object') {
    if (Array.isArray(manifest)) {
      return manifest.map(item => typeof item === 'string' ? item : item.path || item.file || '').filter(Boolean);
    }
    if (manifest.items) return parseDeliverables(manifest.items);
    if (manifest.files) return parseDeliverables(manifest.files);
    return [];
  }

  if (typeof manifest === 'string') {
    const paths = [];
    const pathRegex = /(?:^|\s)([\w./-]+\.\w{1,10})(?:\s|$|,|;)/gm;
    let match;
    while ((match = pathRegex.exec(manifest)) !== null) {
      paths.push(match[1]);
    }
    return paths;
  }

  return [];
}

/**
 * Check delivers_capabilities for orphaned capabilities (no consumers).
 *
 * @param {string} parentId - Parent UUID id
 * @param {string} parentSdKey - Parent sd_key
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{warnings: string[], capabilitySummary: Object}>}
 */
async function detectOrphanedCapabilities(parentId, parentSdKey, supabase) {
  const warnings = [];

  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, delivers_capabilities, dependencies')
    .eq('parent_sd_id', parentId);

  if (!children || children.length === 0) {
    warnings.push('No children to check capabilities');
    return { warnings, capabilitySummary: {} };
  }

  const deliveredCapabilities = [];
  for (const child of children) {
    const caps = child.delivers_capabilities;
    if (Array.isArray(caps)) {
      for (const cap of caps) {
        const key = typeof cap === 'string' ? cap : cap.capability_key || cap.name || '';
        if (key) {
          deliveredCapabilities.push({ key, source: child.sd_key });
        }
      }
    }
  }

  const consumedKeys = new Set();
  for (const child of children) {
    const deps = child.dependencies;
    if (Array.isArray(deps)) {
      for (const dep of deps) {
        const key = typeof dep === 'string' ? dep : dep.capability_key || dep.key || '';
        if (key) consumedKeys.add(key);
      }
    }
  }

  const orphans = deliveredCapabilities.filter(cap => !consumedKeys.has(cap.key));

  if (orphans.length > 0) {
    for (const orphan of orphans) {
      warnings.push(`Orphaned capability: '${orphan.key}' from ${orphan.source} has no consumer among siblings`);
    }
  }

  return {
    warnings,
    capabilitySummary: {
      delivered: deliveredCapabilities.length,
      consumed: consumedKeys.size,
      orphaned: orphans.length
    }
  };
}

/**
 * Format a gate result for console output.
 *
 * @param {Object} result - Gate result from verifyIntegration
 * @returns {string} Formatted output
 */
export function formatGateResult(result) {
  const lines = [];
  lines.push(`   Score: ${result.score}/${result.max_score}`);
  lines.push(`   Advisory: ${result.advisory ? 'yes (never blocks)' : 'no'}`);

  if (result.checks) {
    lines.push('   Checks:');
    lines.push(`     Children complete: ${result.checks.childrenComplete ? '✅' : '⚠️'}`);
    lines.push(`     Deliverables clean: ${result.checks.deliverablesClean ? '✅' : '⚠️'}`);
    lines.push(`     Capabilities consumed: ${result.checks.capabilitiesConsumed ? '✅' : '⚠️'}`);
  }

  if (result.warnings.length > 0) {
    lines.push(`   Warnings (${result.warnings.length}):`);
    for (const w of result.warnings) {
      lines.push(`     • ${w}`);
    }
  } else {
    lines.push('   ✅ No warnings — integration looks clean');
  }

  return lines.join('\n');
}

/**
 * Run the full Integration Verification Gate.
 * Advisory mode: always returns pass=true.
 *
 * Called by orchestrator-completion-hook as:
 *   verifyIntegration(orchestratorId, { supabase })
 *
 * @param {string} idOrKey - Orchestrator SD UUID id or sd_key
 * @param {Object} ctx - Context object containing { supabase }
 * @returns {Promise<Object|null>} Gate result, or null if not an orchestrator
 */
export async function verifyIntegration(idOrKey, ctx = {}) {
  const supabase = ctx.supabase || ctx;

  // Resolve the SD (handles both UUID and sd_key)
  const sd = await resolveSD(idOrKey, supabase);

  if (!sd) {
    return null;
  }

  // Check for children to determine if orchestrator
  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('parent_sd_id', sd.id)
    .limit(1);

  if (!children || children.length === 0) {
    return null;
  }

  const result = {
    pass: true, // Advisory mode: always true
    score: 100,
    max_score: 100,
    issues: [],
    warnings: [],
    details: {},
    checks: {
      childrenComplete: true,
      deliverablesClean: true,
      capabilitiesConsumed: true
    },
    advisory: true,
    sdKey: sd.sd_key
  };

  // Check 1: Children completion
  const completionResult = await verifyChildrenCompleted(sd.id, sd.sd_key, supabase);
  result.details.children = completionResult;
  result.warnings.push(...completionResult.warnings);

  if (!completionResult.complete) {
    result.score -= 30;
    result.checks.childrenComplete = false;
  }

  // Check 2: Deliverables cross-reference
  const deliverableResult = await crossReferenceDeliverables(sd.id, sd.sd_key, supabase);
  result.details.deliverables = deliverableResult;
  result.warnings.push(...deliverableResult.warnings);

  if (deliverableResult.deliverableSummary.overlaps > 0) {
    result.score -= 20;
    result.checks.deliverablesClean = false;
  }

  // Check 3: Orphaned capabilities
  const capabilityResult = await detectOrphanedCapabilities(sd.id, sd.sd_key, supabase);
  result.details.capabilities = capabilityResult;
  result.warnings.push(...capabilityResult.warnings);

  if (capabilityResult.capabilitySummary.orphaned > 0) {
    result.score -= 10;
    result.checks.capabilitiesConsumed = false;
  }

  result.score = Math.max(0, result.score);

  return result;
}

// Also export helpers for direct use and testing
export {
  verifyChildrenCompleted,
  crossReferenceDeliverables,
  detectOrphanedCapabilities,
  parseDeliverables,
  resolveSD
};
