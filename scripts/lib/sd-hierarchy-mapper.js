/**
 * SD Hierarchy Mapper
 *
 * Provides functions for traversing SD hierarchies (parent → children → grandchildren)
 * and determining execution order for continuous LEO Protocol execution.
 *
 * Usage:
 *   import { mapHierarchy, getDepthFirstOrder, getNextIncomplete } from './sd-hierarchy-mapper.js';
 *
 *   const hierarchy = await mapHierarchy('SD-PARENT-001');
 *   const order = getDepthFirstOrder(hierarchy);
 *   const next = getNextIncomplete(hierarchy);
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '../..');

// Load environment
const envPath = path.join(EHG_ENGINEER_ROOT, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Map an SD's complete hierarchy (children, grandchildren, etc.)
 *
 * @param {string} sdId - The legacy_id or UUID of the parent SD
 * @returns {Promise<Object>} Hierarchy tree with children nested
 */
export async function mapHierarchy(sdId) {
  // First, get the parent SD
  const { data: parent, error: parentError } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, title, status, current_phase, parent_sd_id, sequence_rank')
    .or(`legacy_id.eq.${sdId},id.eq.${sdId}`)
    .eq('is_active', true)
    .single();

  if (parentError || !parent) {
    throw new Error(`SD not found: ${sdId}`);
  }

  // Use database function if available, otherwise recursive query
  const { data: children, error: childError } = await supabase
    .rpc('get_sd_children_depth_first', { p_sd_id: parent.id });

  if (childError) {
    // Fallback to manual recursive query
    return await buildHierarchyManual(parent);
  }

  // Build tree structure from flat list
  return buildTree(parent, children || []);
}

/**
 * Build hierarchy tree manually (fallback if DB function not available)
 */
async function buildHierarchyManual(parent) {
  const tree = {
    ...parent,
    isComplete: isComplete(parent.status),
    children: []
  };

  // Get immediate children
  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, title, status, current_phase, parent_sd_id, sequence_rank')
    .eq('parent_sd_id', parent.id)
    .eq('is_active', true)
    .order('sequence_rank', { nullsFirst: false })
    .order('created_at');

  if (children && children.length > 0) {
    for (const child of children) {
      // Recursively get grandchildren
      const childTree = await buildHierarchyManual(child);
      tree.children.push(childTree);
    }
  }

  return tree;
}

/**
 * Build tree from flat list (result of get_sd_children_depth_first)
 */
function buildTree(parent, flatList) {
  const tree = {
    ...parent,
    isComplete: isComplete(parent.status),
    children: []
  };

  // Group children by depth and parent
  const byParent = {};
  for (const item of flatList) {
    const parentId = item.parent_sd_id || parent.id;
    if (!byParent[parentId]) {
      byParent[parentId] = [];
    }
    byParent[parentId].push({
      ...item,
      isComplete: isComplete(item.status),
      children: []
    });
  }

  // Build tree recursively
  function attachChildren(node) {
    const nodeChildren = byParent[node.id] || [];
    node.children = nodeChildren.map(child => {
      attachChildren(child);
      return child;
    });
    return node;
  }

  return attachChildren(tree);
}

/**
 * Get all SDs in depth-first execution order
 *
 * @param {Object} hierarchy - Hierarchy tree from mapHierarchy
 * @returns {Array} Flat array of SDs in execution order (children first, then parent)
 */
export function getDepthFirstOrder(hierarchy) {
  const order = [];

  function traverse(node) {
    // First, process all children depth-first
    for (const child of node.children || []) {
      traverse(child);
    }
    // Then add this node (children complete before parent)
    order.push({
      id: node.id,
      legacy_id: node.legacy_id,
      title: node.title,
      status: node.status,
      current_phase: node.current_phase,
      isComplete: node.isComplete,
      hasChildren: (node.children || []).length > 0
    });
  }

  traverse(hierarchy);
  return order;
}

/**
 * Get the next incomplete SD in the hierarchy
 *
 * @param {Object} hierarchy - Hierarchy tree from mapHierarchy
 * @returns {Object|null} Next SD to work on, or null if all complete
 */
export function getNextIncomplete(hierarchy) {
  const order = getDepthFirstOrder(hierarchy);

  for (const sd of order) {
    if (!sd.isComplete) {
      return sd;
    }
  }

  return null; // All complete
}

/**
 * Check if entire hierarchy is complete
 *
 * @param {Object} hierarchy - Hierarchy tree from mapHierarchy
 * @returns {boolean} True if all SDs in hierarchy are complete
 */
export function isHierarchyComplete(hierarchy) {
  const order = getDepthFirstOrder(hierarchy);
  return order.every(sd => sd.isComplete);
}

/**
 * Get hierarchy statistics
 *
 * @param {Object} hierarchy - Hierarchy tree from mapHierarchy
 * @returns {Object} Stats about the hierarchy
 */
export function getHierarchyStats(hierarchy) {
  const order = getDepthFirstOrder(hierarchy);
  const total = order.length;
  const complete = order.filter(sd => sd.isComplete).length;
  const remaining = total - complete;

  return {
    total,
    complete,
    remaining,
    percentComplete: total > 0 ? Math.round((complete / total) * 100) : 100,
    phases: {
      lead: order.filter(sd => sd.current_phase === 'LEAD').length,
      plan: order.filter(sd => sd.current_phase === 'PLAN').length,
      exec: order.filter(sd => sd.current_phase === 'EXEC').length,
      complete: order.filter(sd => sd.current_phase === 'COMPLETE').length
    }
  };
}

/**
 * Check if an SD status indicates completion
 */
function isComplete(status) {
  return ['completed', 'cancelled'].includes(status);
}

/**
 * Print hierarchy tree for debugging
 */
export function printHierarchy(hierarchy, indent = 0) {
  const prefix = '  '.repeat(indent);
  const status = hierarchy.isComplete ? '[x]' : '[ ]';
  console.log(`${prefix}${status} ${hierarchy.legacy_id}: ${hierarchy.title}`);

  for (const child of hierarchy.children || []) {
    printHierarchy(child, indent + 1);
  }
}

// CLI support
if (process.argv[1].endsWith('sd-hierarchy-mapper.js')) {
  const sdId = process.argv[2];

  if (!sdId) {
    console.log('Usage: node sd-hierarchy-mapper.js <SD_ID>');
    console.log('');
    console.log('Example: node sd-hierarchy-mapper.js SD-CONTENT-FORGE-IMPL-001');
    process.exit(1);
  }

  (async () => {
    try {
      console.log(`\nMapping hierarchy for: ${sdId}\n`);

      const hierarchy = await mapHierarchy(sdId);
      const order = getDepthFirstOrder(hierarchy);
      const stats = getHierarchyStats(hierarchy);
      const next = getNextIncomplete(hierarchy);

      console.log('HIERARCHY TREE:');
      console.log('─'.repeat(50));
      printHierarchy(hierarchy);

      console.log('\nEXECUTION ORDER (depth-first):');
      console.log('─'.repeat(50));
      order.forEach((sd, i) => {
        const status = sd.isComplete ? '[x]' : '[ ]';
        console.log(`  ${i + 1}. ${status} ${sd.legacy_id}`);
      });

      console.log('\nSTATISTICS:');
      console.log('─'.repeat(50));
      console.log(`  Total SDs: ${stats.total}`);
      console.log(`  Complete: ${stats.complete}`);
      console.log(`  Remaining: ${stats.remaining}`);
      console.log(`  Progress: ${stats.percentComplete}%`);

      console.log('\nNEXT SD TO WORK ON:');
      console.log('─'.repeat(50));
      if (next) {
        console.log(`  ${next.legacy_id}: ${next.title}`);
        console.log(`  Status: ${next.status} | Phase: ${next.current_phase}`);
      } else {
        console.log('  All SDs in hierarchy are complete!');
      }

      console.log('');
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  })();
}

export default {
  mapHierarchy,
  getDepthFirstOrder,
  getNextIncomplete,
  isHierarchyComplete,
  getHierarchyStats,
  printHierarchy
};
