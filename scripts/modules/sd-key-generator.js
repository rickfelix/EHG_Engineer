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
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Protocol File Read Enforcement (SD-LEO-SDKEY-ENFORCE-LEAD-READ-001)
// ============================================================================

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer';
const SESSION_STATE_FILE = path.join(PROJECT_DIR, '.claude', 'unified-session-state.json');

/**
 * Read the unified session state to check protocol file read status
 * @returns {Object} Session state or default structure
 */
function readSessionState() {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      const content = fs.readFileSync(SESSION_STATE_FILE, 'utf8');
      const cleanContent = content.replace(/^\uFEFF/, ''); // Handle BOM
      return JSON.parse(cleanContent);
    }
  } catch (_error) {
    // Silent fail - will return default
  }
  return { protocolFilesRead: [] };
}

/**
 * Check if CLAUDE_LEAD.md has been read in the current session
 * @returns {boolean} True if file has been read
 */
function isLeadFileRead() {
  const state = readSessionState();
  return state.protocolFilesRead?.includes('CLAUDE_LEAD.md') || state.protocolFilesRead?.includes('CLAUDE_LEAD_DIGEST.md') || false;
}

/**
 * Check if CLAUDE_CORE.md has been read in the current session
 * @returns {boolean} True if file has been read
 */
function isCoreFileRead() {
  const state = readSessionState();
  return state.protocolFilesRead?.includes('CLAUDE_CORE.md') || state.protocolFilesRead?.includes('CLAUDE_CORE_DIGEST.md') || false;
}

/**
 * Check if CLAUDE_LEAD.md was only partially read (with limit/offset parameters)
 * @returns {Object|null} Partial read details or null if not partial
 */
function getLeadFilePartialReadDetails() {
  const state = readSessionState();

  // Check new schema first (SD-LEO-INFRA-DETECT-PARTIAL-PROTOCOL-001)
  const fileStatus = state.protocolFileReadStatus?.['CLAUDE_LEAD.md'];
  if (fileStatus?.lastReadWasPartial && fileStatus.lastPartialRead) {
    return {
      limit: fileStatus.lastPartialRead.limit,
      offset: fileStatus.lastPartialRead.offset,
      timestamp: fileStatus.lastPartialRead.readAt,
      wasPartial: true
    };
  }

  // Fall back to legacy schema
  return state.protocolFilesPartiallyRead?.['CLAUDE_LEAD.md'] || null;
}

/**
 * Check if CLAUDE_CORE.md was only partially read (with limit/offset parameters)
 * @returns {Object|null} Partial read details or null if not partial
 */
function getCoreFilePartialReadDetails() {
  const state = readSessionState();

  // Check new schema first (SD-LEO-INFRA-DETECT-PARTIAL-PROTOCOL-001)
  const fileStatus = state.protocolFileReadStatus?.['CLAUDE_CORE.md'];
  if (fileStatus?.lastReadWasPartial && fileStatus.lastPartialRead) {
    return {
      limit: fileStatus.lastPartialRead.limit,
      offset: fileStatus.lastPartialRead.offset,
      timestamp: fileStatus.lastPartialRead.readAt,
      wasPartial: true
    };
  }

  // Fall back to legacy schema
  return state.protocolFilesPartiallyRead?.['CLAUDE_CORE.md'] || null;
}

/**
 * Validate that CLAUDE_CORE.md has been fully read before SD key generation
 *
 * This ensures Claude is familiar with:
 * - Sub-agent invocation requirements and triggers
 * - SD type definitions and requirements
 * - Protocol phase structure
 * - Validation patterns
 *
 * @returns {Object} Validation result {valid, error, remediation}
 */
export function validateCoreFileRead() {
  const isRead = isCoreFileRead();
  const partialDetails = getCoreFilePartialReadDetails();

  // Case 1: Not read at all
  if (!isRead) {
    return {
      valid: false,
      error: 'CLAUDE_CORE.md has not been read in this session',
      remediation: `
┌─────────────────────────────────────────────────────────────────────────────┐
│ ⚠️  SD KEY GENERATION BLOCKED - Protocol Core File Not Read                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ CLAUDE_CORE.md must be read COMPLETELY before creating Strategic           │
│ Directives. This file contains critical information about:                 │
│                                                                             │
│   • Sub-agent invocation requirements and triggers                         │
│   • SD type definitions and validation requirements                        │
│   • Protocol phase structure (LEAD → PLAN → EXEC)                          │
│   • Required validation patterns                                           │
│                                                                             │
│ ACTION REQUIRED:                                                           │
│   1. Read CLAUDE_CORE_DIGEST.md completely (no limit parameter)            │
│   2. Then retry SD key generation                                          │
│                                                                             │
│ HINT: Use Read tool with file_path="CLAUDE_CORE_DIGEST.md" (no limit)      │
└─────────────────────────────────────────────────────────────────────────────┘
`
    };
  }

  // Case 2: Read but only partially (with limit/offset)
  if (partialDetails?.wasPartial) {
    return {
      valid: false,
      error: `CLAUDE_CORE.md was only partially read (limit=${partialDetails.limit}, offset=${partialDetails.offset})`,
      remediation: `
┌─────────────────────────────────────────────────────────────────────────────┐
│ ⚠️  SD KEY GENERATION BLOCKED - Partial Read Detected                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ CLAUDE_CORE.md was read with limit/offset parameters:                      │
│   • Limit: ${String(partialDetails.limit).padEnd(10)} Offset: ${String(partialDetails.offset || 0).padEnd(10)}                          │
│   • Read at: ${partialDetails.timestamp || 'unknown'}                          │
│                                                                             │
│ Critical requirements may be MISSING from later sections:                  │
│   • Sub-agent trigger keywords and invocation patterns                     │
│   • SD type-specific requirements                                          │
│   • Protocol phase validation rules                                        │
│                                                                             │
│ ACTION REQUIRED:                                                           │
│   1. Re-read CLAUDE_CORE_DIGEST.md completely (WITHOUT limit parameter)    │
│   2. Then retry SD key generation                                          │
│                                                                             │
│ HINT: Use Read tool with file_path="CLAUDE_CORE_DIGEST.md" (no limit)      │
└─────────────────────────────────────────────────────────────────────────────┘
`
    };
  }

  // Case 3: Fully read - proceed
  return {
    valid: true,
    error: null,
    remediation: null
  };
}

/**
 * Validate that CLAUDE_LEAD.md has been fully read before SD key generation
 *
 * This ensures Claude is familiar with:
 * - Required SD fields (sd_key, title, description, rationale, etc.)
 * - Success criteria/metrics requirements
 * - SD type-specific requirements
 * - Handoff validation gates
 *
 * @returns {Object} Validation result {valid, error, remediation}
 */
export function validateLeadFileRead() {
  const isRead = isLeadFileRead();
  const partialDetails = getLeadFilePartialReadDetails();

  // Case 1: Not read at all
  if (!isRead) {
    return {
      valid: false,
      error: 'CLAUDE_LEAD.md has not been read in this session',
      remediation: `
┌─────────────────────────────────────────────────────────────────────────────┐
│ ⚠️  SD KEY GENERATION BLOCKED - Protocol File Not Read                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ CLAUDE_LEAD.md must be read COMPLETELY before creating Strategic           │
│ Directives. This file contains critical information about:                 │
│                                                                             │
│   • Required SD fields (sd_key, title, description, rationale, etc.)       │
│   • Success criteria/metrics requirements                                  │
│   • SD type-specific validation requirements                               │
│   • Strategic validation questions (9-question gate)                       │
│   • Handoff chain requirements                                             │
│                                                                             │
│ ACTION REQUIRED:                                                           │
│   1. Read CLAUDE_LEAD_DIGEST.md completely (no limit parameter)            │
│   2. Then retry SD key generation                                          │
│                                                                             │
│ HINT: Use Read tool with file_path="CLAUDE_LEAD_DIGEST.md" (no limit)      │
└─────────────────────────────────────────────────────────────────────────────┘
`
    };
  }

  // Case 2: Read but only partially (with limit/offset)
  if (partialDetails?.wasPartial) {
    return {
      valid: false,
      error: `CLAUDE_LEAD.md was only partially read (limit=${partialDetails.limit}, offset=${partialDetails.offset})`,
      remediation: `
┌─────────────────────────────────────────────────────────────────────────────┐
│ ⚠️  SD KEY GENERATION BLOCKED - Partial Read Detected                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ CLAUDE_LEAD.md was read with limit/offset parameters:                      │
│   • Limit: ${String(partialDetails.limit).padEnd(10)} Offset: ${String(partialDetails.offset || 0).padEnd(10)}                          │
│   • Read at: ${partialDetails.timestamp || 'unknown'}                          │
│                                                                             │
│ Critical requirements may be MISSING from later sections:                  │
│   • Lines 370-476: Strategic Directive Creation Process                    │
│   • Lines 552-674: Common SD Creation Errors and Solutions                 │
│   • Lines 677-823: SDKeyGenerator Errors section                           │
│   • Lines 825-1030: PRD Enrichment and Evaluation Checklist                │
│                                                                             │
│ ACTION REQUIRED:                                                           │
│   1. Re-read CLAUDE_LEAD_DIGEST.md completely (WITHOUT limit parameter)    │
│   2. Then retry SD key generation                                          │
│                                                                             │
│ HINT: Use Read tool with file_path="CLAUDE_LEAD_DIGEST.md" (no limit)      │
└─────────────────────────────────────────────────────────────────────────────┘
`
    };
  }

  // Case 3: Fully read - proceed
  return {
    valid: true,
    error: null,
    remediation: null
  };
}

/**
 * Validate that both CLAUDE_CORE.md and CLAUDE_LEAD.md have been fully read
 *
 * @returns {Object} Validation result {valid, error, remediation}
 */
export function validateProtocolFilesRead() {
  // Check CLAUDE_CORE.md first
  const coreValidation = validateCoreFileRead();
  if (!coreValidation.valid) {
    return coreValidation;
  }

  // Then check CLAUDE_LEAD.md
  const leadValidation = validateLeadFileRead();
  if (!leadValidation.valid) {
    return leadValidation;
  }

  return {
    valid: true,
    error: null,
    remediation: null
  };
}

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
 * Normalize a venture name into a valid SD key prefix segment.
 * - Uppercase
 * - Spaces/underscores to hyphens
 * - Only [A-Z0-9-] allowed
 * - Trim leading/trailing hyphens
 *
 * @param {string} ventureName - Raw venture name (e.g., "Acme Labs")
 * @returns {string} Normalized prefix (e.g., "ACME-LABS")
 */
export function normalizeVenturePrefix(ventureName) {
  if (!ventureName || typeof ventureName !== 'string') return '';

  return ventureName
    .toUpperCase()
    .replace(/[\s_]+/g, '-')       // Spaces/underscores to hyphens
    .replace(/[^A-Z0-9-]/g, '')    // Remove invalid chars
    .replace(/-{2,}/g, '-')        // Collapse multiple hyphens
    .replace(/^-|-$/g, '');        // Trim leading/trailing hyphens
}

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
 * @param {boolean} [options.skipLeadValidation] - Skip CLAUDE_LEAD.md read validation (for internal use only)
 * @param {string} [options.venturePrefix] - Venture name for scoped keys (e.g., "ACME"). When provided, key format is SD-{VENTURE}-{SOURCE}-{TYPE}-{SEMANTIC}-{NUM}
 * @returns {Promise<string>} Generated SD key
 * @throws {Error} If CLAUDE_LEAD.md has not been fully read
 */
export async function generateSDKey(options) {
  const {
    source,
    type,
    title,
    parentKey = null,
    hierarchyDepth = 0,
    siblingIndex = 0,
    skipLeadValidation = false,
    venturePrefix = null
  } = options;

  // SD-LEO-SDKEY-ENFORCE-LEAD-READ-001: Validate CLAUDE_CORE.md and CLAUDE_LEAD.md have been fully read
  if (!skipLeadValidation) {
    const protocolValidation = validateProtocolFilesRead();
    if (!protocolValidation.valid) {
      console.error(protocolValidation.remediation);
      throw new Error(`[SDKeyGenerator] ${protocolValidation.error}`);
    }
  }

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
  const normalizedVenture = venturePrefix ? normalizeVenturePrefix(venturePrefix) : '';
  const prefix = normalizedVenture
    ? `SD-${normalizedVenture}-${sourceAbbrev}-${typeAbbrev}-${semantic}`
    : `SD-${sourceAbbrev}-${typeAbbrev}-${semantic}`;

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

  // Venture-scoped root key pattern: SD-{VENTURE}-{SOURCE}-{TYPE}-{SEMANTIC}-{NUM}
  // Must check before non-venture pattern since venture keys have an extra segment
  const ventureRootPattern = /^SD-([A-Z][A-Z0-9-]*)-([A-Z]+)-([A-Z]+)-([A-Z0-9-]+)-(\d{3})$/;
  const ventureRootMatch = sdKey.match(ventureRootPattern);

  // Distinguish venture keys from non-venture by checking if segment 1 is a known source
  const knownSources = new Set(Object.values(SD_SOURCES));

  if (ventureRootMatch && !knownSources.has(ventureRootMatch[1])) {
    return {
      isRoot: true,
      venturePrefix: ventureRootMatch[1],
      source: ventureRootMatch[2],
      type: ventureRootMatch[3],
      semantic: ventureRootMatch[4],
      number: parseInt(ventureRootMatch[5], 10),
      hierarchyDepth: 0,
      parentKey: null
    };
  }

  // Root key pattern: SD-{SOURCE}-{TYPE}-{SEMANTIC}-{NUM}
  const rootPattern = /^SD-([A-Z]+)-([A-Z]+)-([A-Z0-9-]+)-(\d{3})$/;
  const rootMatch = sdKey.match(rootPattern);

  if (rootMatch) {
    return {
      isRoot: true,
      venturePrefix: null,
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
  node scripts/modules/sd-key-generator.js --check-protocol
  node scripts/modules/sd-key-generator.js --check-core
  node scripts/modules/sd-key-generator.js --check-lead
  node scripts/modules/sd-key-generator.js --skip-validation <source> <type> "<title>"
  node scripts/modules/sd-key-generator.js --venture <name> <source> <type> "<title>"

Sources: ${Object.keys(SD_SOURCES).join(', ')}
Types: ${Object.keys(SD_TYPES).join(', ')}

Protocol Enforcement (SD-LEO-SDKEY-ENFORCE-LEAD-READ-001):
  Before generating an SD key, CLAUDE_CORE.md and CLAUDE_LEAD.md must be read completely.
  This ensures familiarity with required fields and validation requirements.

  --check-protocol   Check if both CLAUDE_CORE.md and CLAUDE_LEAD.md have been fully read
  --check-core       Check if CLAUDE_CORE.md has been fully read
  --check-lead       Check if CLAUDE_LEAD.md has been fully read
  --skip-validation  Skip protocol file validation (emergency use only)
  --venture <name>   Generate venture-scoped key (SD-{VENTURE}-{SOURCE}-{TYPE}-{SEMANTIC}-{NUM})

Examples:
  node scripts/modules/sd-key-generator.js UAT fix "Navigation route not working"
  node scripts/modules/sd-key-generator.js LEO feature "Add dark mode toggle"
  node scripts/modules/sd-key-generator.js --child SD-UAT-FIX-NAV-001 0
  node scripts/modules/sd-key-generator.js --parse SD-UAT-FIX-NAV-001-A
  node scripts/modules/sd-key-generator.js --check-protocol
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
      } else if (args[0] === '--check-protocol') {
        // Check if both CLAUDE_CORE.md and CLAUDE_LEAD.md have been fully read
        const validation = validateProtocolFilesRead();
        if (validation.valid) {
          console.log('✅ CLAUDE_CORE.md and CLAUDE_LEAD.md have been fully read - ready for SD creation');
        } else {
          console.log(validation.remediation);
          process.exit(1);
        }
      } else if (args[0] === '--check-core') {
        // Check if CLAUDE_CORE.md has been fully read
        const validation = validateCoreFileRead();
        if (validation.valid) {
          console.log('✅ CLAUDE_CORE.md has been fully read');
        } else {
          console.log(validation.remediation);
          process.exit(1);
        }
      } else if (args[0] === '--check-lead') {
        // Check if CLAUDE_LEAD.md has been fully read
        const validation = validateLeadFileRead();
        if (validation.valid) {
          console.log('✅ CLAUDE_LEAD.md has been fully read - ready for SD creation');
        } else {
          console.log(validation.remediation);
          process.exit(1);
        }
      } else if (args[0] === '--skip-validation') {
        // Skip validation (for testing/emergencies only)
        const [, source, type, ...titleParts] = args;
        const title = titleParts.join(' ');
        console.log('⚠️  Skipping protocol file validation (emergency mode)');
        const key = await generateSDKey({ source, type, title, skipLeadValidation: true });
        console.log('Generated SD key:', key);
      } else if (args[0] === '--venture') {
        // Venture-scoped key generation
        const [, ventureName, source, type, ...titleParts] = args;
        const title = titleParts.join(' ');
        if (!ventureName || !source || !type || !title) {
          console.error('Usage: --venture <name> <source> <type> "<title>"');
          process.exit(1);
        }
        const key = await generateSDKey({ source, type, title, venturePrefix: ventureName });
        console.log('Generated venture-scoped SD key:', key);
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
  normalizeVenturePrefix,
  validateCoreFileRead,
  validateLeadFileRead,
  validateProtocolFilesRead,
  SD_SOURCES,
  SD_TYPES
};
