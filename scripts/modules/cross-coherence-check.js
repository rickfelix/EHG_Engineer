/**
 * Cross-Coherence Check for Orchestrator SD Hierarchies
 * SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001-F (C6)
 *
 * Verifies no gaps exist across sibling SDs:
 * - Vision dimension coverage (all dimensions addressed by at least one child)
 * - Architecture dimension coverage (all decisions implemented)
 * - File conflict detection (no two siblings modify same file)
 * - Orchestrator acceptance criteria coverage
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

/**
 * Run cross-coherence check across an orchestrator's children.
 *
 * @param {string} orchestratorKey - Parent orchestrator SD key
 * @param {Object} [options] - Options
 * @param {Object} [options.supabase] - Supabase client override
 * @param {Object} [options.logger] - Logger
 * @returns {Promise<Object>} { pass, gaps, conflicts, coverage }
 */
export async function checkCrossCoherence(orchestratorKey, options = {}) {
  const supabase = options.supabase || createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const logger = options.logger || console;

  // Load orchestrator
  const { data: orchestrator } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, success_criteria, metadata')
    .eq('sd_key', orchestratorKey)
    .single();

  if (!orchestrator) {
    return { pass: false, error: `Orchestrator ${orchestratorKey} not found` };
  }

  // Load children
  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, status, current_phase, scope, key_changes, metadata, success_criteria')
    .eq('parent_sd_id', orchestrator.id)
    .order('sd_key');

  if (!children || children.length === 0) {
    return { pass: false, error: 'No children found' };
  }

  logger.log(`[CrossCoherence] Checking ${orchestratorKey} with ${children.length} children`);

  const gaps = [];
  const conflicts = [];
  let completedCount = 0;

  // 1. Check child completion status
  for (const child of children) {
    if (child.status === 'completed') completedCount++;
    else gaps.push({ type: 'incomplete_child', sd: child.sd_key, status: child.status, phase: child.current_phase });
  }

  // 2. Vision dimension coverage
  const visionKey = orchestrator.metadata?.vision_key;
  if (visionKey) {
    const { data: visionDoc } = await supabase
      .from('eva_vision_documents')
      .select('extracted_dimensions')
      .eq('vision_key', visionKey)
      .single();

    if (visionDoc?.extracted_dimensions) {
      const dims = visionDoc.extracted_dimensions;
      const childScopes = children.map(c => JSON.stringify(c.scope || '') + JSON.stringify(c.key_changes || [])).join(' ').toLowerCase();

      for (const dim of dims) {
        const dimName = (dim.name || '').toLowerCase();
        if (dimName && !childScopes.includes(dimName.split(/\s+/)[0])) {
          gaps.push({ type: 'vision_gap', dimension: dim.name, weight: dim.weight });
        }
      }
    }
  }

  // 3. Architecture dimension coverage
  const archKey = orchestrator.metadata?.plan_key;
  if (archKey) {
    const { data: archPlan } = await supabase
      .from('eva_architecture_plans')
      .select('extracted_dimensions')
      .eq('plan_key', archKey)
      .single();

    if (archPlan?.extracted_dimensions) {
      const dims = archPlan.extracted_dimensions;
      const childScopes = children.map(c => JSON.stringify(c.scope || '') + JSON.stringify(c.key_changes || [])).join(' ').toLowerCase();

      for (const dim of dims) {
        const dimName = (dim.name || '').toLowerCase();
        if (dimName && !childScopes.includes(dimName.split(/\s+/)[0])) {
          gaps.push({ type: 'arch_gap', dimension: dim.name, weight: dim.weight });
        }
      }
    }
  }

  // 4. File conflict detection (check key_changes for overlapping files)
  const fileMap = new Map(); // file → [sd_key]
  for (const child of children) {
    const changes = child.key_changes || [];
    for (const change of changes) {
      const file = change.file || change.change || '';
      if (file && file.includes('/')) {
        const existing = fileMap.get(file) || [];
        existing.push(child.sd_key);
        fileMap.set(file, existing);
      }
    }
  }
  for (const [file, sds] of fileMap) {
    if (sds.length > 1) {
      conflicts.push({ type: 'file_conflict', file, sds });
    }
  }

  // 5. Orchestrator AC coverage
  const orchACs = orchestrator.success_criteria || [];
  const acCoverage = { total: orchACs.length, covered: 0, uncovered: [] };
  const allChildContent = children.map(c =>
    JSON.stringify(c.success_criteria || []) + JSON.stringify(c.scope || '') + JSON.stringify(c.key_changes || [])
  ).join(' ').toLowerCase();

  for (const ac of orchACs) {
    const criterion = (typeof ac === 'string' ? ac : ac.criterion || '').toLowerCase();
    const words = criterion.split(/\s+/).filter(w => w.length > 4);
    const covered = words.some(w => allChildContent.includes(w));
    if (covered) acCoverage.covered++;
    else acCoverage.uncovered.push(typeof ac === 'string' ? ac : ac.criterion);
  }

  const visionGaps = gaps.filter(g => g.type === 'vision_gap');
  const archGaps = gaps.filter(g => g.type === 'arch_gap');
  const incompleteChildren = gaps.filter(g => g.type === 'incomplete_child');

  const pass = visionGaps.length === 0 && archGaps.length === 0 && conflicts.length === 0 && incompleteChildren.length === 0;

  const result = {
    pass,
    orchestrator: orchestratorKey,
    children: children.length,
    completed: completedCount,
    gaps,
    conflicts,
    coverage: acCoverage,
    summary: {
      vision_gaps: visionGaps.length,
      arch_gaps: archGaps.length,
      file_conflicts: conflicts.length,
      incomplete_children: incompleteChildren.length,
      ac_coverage: acCoverage.total > 0 ? Math.round(acCoverage.covered / acCoverage.total * 100) : 100
    }
  };

  logger.log(`[CrossCoherence] Result: ${pass ? 'PASS' : 'FAIL'} | Vision gaps: ${visionGaps.length} | Arch gaps: ${archGaps.length} | File conflicts: ${conflicts.length} | Children: ${completedCount}/${children.length} | AC coverage: ${result.summary.ac_coverage}%`);

  return result;
}

// CLI entry point
const isMain = process.argv[1]?.endsWith('cross-coherence-check.js');
if (isMain) {
  const key = process.argv[2];
  if (!key) {
    console.error('Usage: node scripts/modules/cross-coherence-check.js <ORCHESTRATOR-SD-KEY>');
    process.exit(1);
  }
  checkCrossCoherence(key).then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.pass ? 0 : 1);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
