#!/usr/bin/env node

/**
 * SDKeyGenerator - Centralized SD Key Generation Module
 *
 * Provides unified SD key generation with:
 * - Source traceability (UAT, LEARN, FEEDBACK, PATTERN, MANUAL, LEO)
 * - Type classification (FIX, FEAT, REFACTOR, INFRA, DOC)
 * - Semantic content from title
 * - Hierarchy support (parent/child/grandchild)
 * - Collision detection across sd_key and id columns
 *
 * Part of SD-LEO-SDKEY-001: Centralize SD Creation Through /leo
 *
 * @module scripts/modules/sd-key-generator
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

/**
 * Valid SD sources
 */
export const SD_SOURCES = {
  UAT: 'UAT',           // From UAT process
  LEARN: 'LEARN',       // From /learn command
  FEEDBACK: 'FDBK',     // From /inbox or sd-from-feedback
  PATTERN: 'PAT',       // From pattern-alert-sd-creator
  MANUAL: 'MAN',        // From create-sd.js or manual creation
  LEO: 'LEO'            // From /leo create
};

/**
 * Valid SD types (abbreviated for key)
 */
export const SD_TYPES = {
  fix: 'FIX',
  bugfix: 'FIX',
  feature: 'FEAT',
  feat: 'FEAT',
  refactor: 'REFAC',
  infrastructure: 'INFRA',
  infra: 'INFRA',
  documentation: 'DOC',
  doc: 'DOC',
  enhancement: 'ENH',
  testing: 'TEST',
  orchestrator: 'ORCH'
};

/**
 * Hierarchy depth suffixes
 * Depth 0: Root SD (no suffix)
 * Depth 1: Child (A, B, C...)
 * Depth 2: Grandchild (A1, A2...)
 * Depth 3+: Great-grandchild (A1.1, A1.2...)
 */
const HIERARCHY_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ============================================================================
// Supabase Client
// ============================================================================

let supabase = null;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Extract semantic words from title for key generation
 *
 * @param {string} title - SD title
 * @param {number} maxWords - Maximum words to extract (default 3)
 * @returns {string} Semantic portion of key (e.g., "NAV-ROUTE-FIX")
 */
export function extractSemanticWords(title, maxWords = 3) {
  if (!title) return 'GEN';

  // Remove common stop words and special characters
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
    'this', 'that', 'these', 'those', 'it', 'its', 'through', 'via'
  ]);

  const words = title
    .replace(/[^a-zA-Z0-9\s]/g, ' ')  // Remove special chars
    .split(/\s+/)                      // Split on whitespace
    .filter(w => w.length > 2)         // Min 3 chars
    .filter(w => !stopWords.has(w.toLowerCase()))  // Remove stop words
    .slice(0, maxWords)                // Take first N words
    .map(w => w.toUpperCase());        // Uppercase

  return words.length > 0 ? words.join('-') : 'GEN';
}

/**
 * Get hierarchy suffix based on depth and index
 *
 * @param {number} depth - Hierarchy depth (0=root, 1=child, 2=grandchild, 3+=great-grandchild)
 * @param {number} index - Index within parent's children (0-based)
 * @returns {string} Suffix (e.g., "", "-A", "-A1", "-A1.1")
 */
export function getHierarchySuffix(depth, index) {
  if (depth === 0) {
    return '';  // Root SD, no suffix
  }

  if (depth === 1) {
    // Child: Use letter (A, B, C...)
    const letter = HIERARCHY_LETTERS[index % 26];
    return `-${letter}`;
  }

  if (depth === 2) {
    // Grandchild: Append number to parent's letter suffix
    // Parent suffix like "-A", we add "1", "2", etc.
    return `${index + 1}`;
  }

  // Depth 3+: Use dot notation
  return `.${index + 1}`;
}

/**
 * Check if a proposed SD key already exists
 *
 * @param {string} proposedKey - Key to check
 * @returns {Promise<boolean>} True if key exists
 */
export async function keyExists(proposedKey) {
  const db = getSupabase();

  const { data, error } = await db
    .from('strategic_directives_v2')
    .select('id, sd_key')
    .or(`sd_key.eq.${proposedKey},id.eq.${proposedKey}`)
    .limit(1);

  if (error) {
    console.error('[SDKeyGenerator] Error checking key existence:', error.message);
    return false;  // Assume available on error
  }

  return data && data.length > 0;
}

/**
 * Find next available sequential number for a key namespace
 *
 * @param {string} prefix - Key prefix (e.g., "SD-UAT-FIX-NAV")
 * @returns {Promise<number>} Next available number
 */
export async function getNextSequentialNumber(prefix) {
  const db = getSupabase();

  // Query all keys with this prefix
  const { data, error } = await db
    .from('strategic_directives_v2')
    .select('sd_key, id')
    .or(`sd_key.ilike.${prefix}-%,id.ilike.${prefix}-%`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[SDKeyGenerator] Error finding sequential number:', error.message);
    return 1;
  }

  // Extract used numbers
  const usedNumbers = new Set();
  const regex = new RegExp(`${prefix}-(\\d+)`, 'i');

  (data || []).forEach(record => {
    [record.sd_key, record.id].forEach(value => {
      if (value) {
        const match = value.match(regex);
        if (match) {
          usedNumbers.add(parseInt(match[1], 10));
        }
      }
    });
  });

  // Find first available number
  let nextNum = 1;
  while (usedNumbers.has(nextNum)) {
    nextNum++;
  }

  return nextNum;
}

/**
 * Generate an SD key
 *
 * @param {Object} options - Key generation options
 * @param {string} options.source - Source of SD (UAT, LEARN, FEEDBACK, PATTERN, MANUAL, LEO)
 * @param {string} options.type - SD type (fix, feature, refactor, infrastructure, etc.)
 * @param {string} options.title - SD title for semantic extraction
 * @param {string} [options.parentKey] - Parent SD key (for child SDs)
 * @param {number} [options.hierarchyDepth] - Depth in hierarchy (0=root, 1=child, etc.)
 * @param {number} [options.siblingIndex] - Index among siblings (for hierarchy suffix)
 * @returns {Promise<string>} Generated SD key
 */
export async function generateSDKey(options) {
  const {
    source,
    type,
    title,
    parentKey = null,
    hierarchyDepth = 0,
    siblingIndex = 0
  } = options;

  // Validate source
  const sourceAbbrev = SD_SOURCES[source?.toUpperCase()] || SD_SOURCES.MANUAL;

  // Validate type
  const typeAbbrev = SD_TYPES[type?.toLowerCase()] || 'GEN';

  // Handle hierarchy
  if (parentKey && hierarchyDepth > 0) {
    // Child/grandchild SD - inherit parent's base and add suffix
    const suffix = getHierarchySuffix(hierarchyDepth, siblingIndex);

    // For grandchildren and beyond, suffix is appended to parent key directly
    if (hierarchyDepth >= 2) {
      return `${parentKey}${suffix}`;
    }

    // For direct children, append suffix to parent
    return `${parentKey}${suffix}`;
  }

  // Root SD - generate full key
  const semantic = extractSemanticWords(title);
  const prefix = `SD-${sourceAbbrev}-${typeAbbrev}-${semantic}`;

  // Get next sequential number
  const seqNum = await getNextSequentialNumber(prefix);
  const paddedNum = String(seqNum).padStart(3, '0');

  const proposedKey = `${prefix}-${paddedNum}`;

  // Validate uniqueness (paranoia check)
  const exists = await keyExists(proposedKey);
  if (exists) {
    // Rare collision - increment and retry
    console.warn(`[SDKeyGenerator] Collision detected for ${proposedKey}, incrementing...`);
    const nextNum = seqNum + 1;
    return `${prefix}-${String(nextNum).padStart(3, '0')}`;
  }

  return proposedKey;
}

/**
 * Generate a child SD key
 *
 * @param {string} parentKey - Parent SD key
 * @param {number} childIndex - Index of this child (0-based)
 * @returns {string} Child SD key
 */
export function generateChildKey(parentKey, childIndex) {
  const suffix = getHierarchySuffix(1, childIndex);
  return `${parentKey}${suffix}`;
}

/**
 * Generate a grandchild SD key
 *
 * @param {string} parentKey - Parent (child) SD key (e.g., "SD-FIX-NAV-001-A")
 * @param {number} grandchildIndex - Index of this grandchild (0-based)
 * @returns {string} Grandchild SD key
 */
export function generateGrandchildKey(parentKey, grandchildIndex) {
  const suffix = getHierarchySuffix(2, grandchildIndex);
  return `${parentKey}${suffix}`;
}

/**
 * Parse an SD key to extract its components
 *
 * @param {string} sdKey - SD key to parse
 * @returns {Object|null} Parsed components or null if invalid
 */
export function parseSDKey(sdKey) {
  if (!sdKey || typeof sdKey !== 'string') {
    return null;
  }

  // Root key pattern: SD-{SOURCE}-{TYPE}-{SEMANTIC}-{NUM}
  const rootPattern = /^SD-([A-Z]+)-([A-Z]+)-([A-Z0-9-]+)-(\d{3})$/;
  const rootMatch = sdKey.match(rootPattern);

  if (rootMatch) {
    return {
      isRoot: true,
      source: rootMatch[1],
      type: rootMatch[2],
      semantic: rootMatch[3],
      number: parseInt(rootMatch[4], 10),
      hierarchyDepth: 0,
      parentKey: null
    };
  }

  // Child pattern: {ROOT}-{LETTER}
  const childPattern = /^(.+)-([A-Z])$/;
  const childMatch = sdKey.match(childPattern);

  if (childMatch) {
    return {
      isRoot: false,
      parentKey: childMatch[1],
      hierarchyDepth: 1,
      siblingIndex: HIERARCHY_LETTERS.indexOf(childMatch[2])
    };
  }

  // Grandchild pattern: {PARENT}{NUMBER}
  const grandchildPattern = /^(.+-[A-Z])(\d+)$/;
  const grandchildMatch = sdKey.match(grandchildPattern);

  if (grandchildMatch) {
    return {
      isRoot: false,
      parentKey: grandchildMatch[1],
      hierarchyDepth: 2,
      siblingIndex: parseInt(grandchildMatch[2], 10) - 1
    };
  }

  // Unknown format
  return {
    isRoot: true,
    raw: sdKey,
    hierarchyDepth: 0
  };
}

// ============================================================================
// CLI Support
// ============================================================================

if (process.argv[1]?.endsWith('sd-key-generator.js')) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
SDKeyGenerator - Centralized SD Key Generation

Usage:
  node scripts/modules/sd-key-generator.js <source> <type> "<title>"
  node scripts/modules/sd-key-generator.js --child <parentKey> <index>
  node scripts/modules/sd-key-generator.js --parse <sdKey>

Sources: ${Object.keys(SD_SOURCES).join(', ')}
Types: ${Object.keys(SD_TYPES).join(', ')}

Examples:
  node scripts/modules/sd-key-generator.js UAT fix "Navigation route not working"
  node scripts/modules/sd-key-generator.js LEO feature "Add dark mode toggle"
  node scripts/modules/sd-key-generator.js --child SD-UAT-FIX-NAV-001 0
  node scripts/modules/sd-key-generator.js --parse SD-UAT-FIX-NAV-001-A
`);
    process.exit(0);
  }

  (async () => {
    try {
      if (args[0] === '--child') {
        const parentKey = args[1];
        const index = parseInt(args[2] || '0', 10);
        const childKey = generateChildKey(parentKey, index);
        console.log('Generated child key:', childKey);
      } else if (args[0] === '--parse') {
        const sdKey = args[1];
        const parsed = parseSDKey(sdKey);
        console.log('Parsed SD key:', JSON.stringify(parsed, null, 2));
      } else {
        const [source, type, ...titleParts] = args;
        const title = titleParts.join(' ');
        const key = await generateSDKey({ source, type, title });
        console.log('Generated SD key:', key);
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  })();
}

// ============================================================================
// Module Exports
// ============================================================================

export default {
  generateSDKey,
  generateChildKey,
  generateGrandchildKey,
  parseSDKey,
  extractSemanticWords,
  getHierarchySuffix,
  keyExists,
  getNextSequentialNumber,
  SD_SOURCES,
  SD_TYPES
};
