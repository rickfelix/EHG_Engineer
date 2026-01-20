/**
 * Classification module for /learn command
 *
 * Handles complexity classification and SD ID generation.
 * Extracted from executor.js for maintainability.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { generateSDKey as generateCentralizedSDKey } from '../sd-key-generator.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Classification rules from LEO Quick-Fix system
 */
export const CLASSIFICATION_RULES = {
  maxLoc: 50,
  allowedTypes: ['bug', 'polish', 'typo', 'documentation'],
  forbiddenKeywords: [
    'migration', 'schema change', 'database', 'auth',
    'authentication', 'authorization', 'security', 'RLS',
    'new table', 'alter table'
  ],
  riskKeywords: [
    'multiple files', 'refactor', 'new feature', 'complex', 'breaking change'
  ]
};

/**
 * Classify selected items as quick-fix or full-sd
 * @param {Array} selectedItems - Patterns and improvements selected by user
 * @returns {'quick-fix' | 'full-sd'}
 */
export function classifyComplexity(selectedItems) {
  if (selectedItems.length > 1) {
    return 'full-sd';
  }

  const item = selectedItems[0];
  const text = (item.issue_summary || item.description || '').toLowerCase();

  for (const keyword of CLASSIFICATION_RULES.forbiddenKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      console.log(`Full SD required: contains forbidden keyword "${keyword}"`);
      return 'full-sd';
    }
  }

  for (const keyword of CLASSIFICATION_RULES.riskKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      console.log(`Full SD required: contains risk keyword "${keyword}"`);
      return 'full-sd';
    }
  }

  if (item.severity === 'critical' || item.severity === 'high') {
    return 'full-sd';
  }

  const category = (item.category || '').toLowerCase();
  if (CLASSIFICATION_RULES.allowedTypes.includes(category)) {
    return 'quick-fix';
  }

  return 'full-sd';
}

/**
 * Generate the next available SD key or QF ID
 * @param {'quick-fix' | 'full-sd'} type
 * @param {string} title - Title for semantic content extraction
 * @returns {Promise<string>}
 */
export async function generateSDId(type, title = 'Learning Improvement') {
  if (type === 'quick-fix') {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    return `QF-${year}${month}${day}-${random}`;
  }

  return generateCentralizedSDKey({
    source: 'LEARN',
    type: 'bugfix',
    title
  });
}

/**
 * Check for existing SD assignments on selected items
 * @param {Array} items - Selected patterns and improvements
 * @returns {Promise<Array>} Items with existing assignments
 */
export async function checkExistingAssignments(items) {
  const conflicts = [];

  for (const item of items) {
    if (item.pattern_id && item.assigned_sd_id) {
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('id, status, title')
        .eq('id', item.assigned_sd_id)
        .single();

      if (sd && sd.status !== 'completed' && sd.status !== 'cancelled') {
        conflicts.push({
          item_id: item.pattern_id,
          item_type: 'pattern',
          assigned_sd_id: item.assigned_sd_id,
          sd_status: sd.status,
          sd_title: sd.title
        });
      }
    }
  }

  return conflicts;
}
