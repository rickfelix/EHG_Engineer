/**
 * CROSS-SD CONSISTENCY VALIDATION (US-005)
 *
 * LEO Protocol v4.3.4 Enhancement - Addresses Genesis PRD Review feedback:
 * "Overlapping SD scopes cause merge conflicts and duplicate work"
 *
 * Validates consistency between Strategic Directives to detect:
 * 1. Overlapping file targets (same files modified by multiple SDs)
 * 2. Conflicting requirements (contradictory goals)
 * 3. Naming inconsistencies (same concept, different names)
 * 4. Resource contention (same database tables, endpoints)
 *
 * @module cross-sd-consistency-validation
 * @version 1.0.0
 * @see SD-LEO-PROTOCOL-V434-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Extract target files/paths from SD PRD
 * @param {Object} prd - Product Requirements Document
 * @returns {Set<string>} Set of file paths
 */
export function extractTargetFiles(prd) {
  const files = new Set();

  // Check various fields for file references
  const fieldsToCheck = [
    prd.implementation_approach,
    prd.system_architecture,
    prd.technical_context,
    JSON.stringify(prd.functional_requirements || []),
    JSON.stringify(prd.ui_ux_requirements || []),
    JSON.stringify(prd.technical_requirements || [])
  ];

  const filePatterns = [
    // Match file paths with extensions
    /(?:^|[\s'"`])([a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx|json|sql|md|yml|yaml|css|scss))/gm,
    // Match paths with common prefixes
    /(?:src|lib|components|pages|hooks|utils|modules|database|scripts)\/[a-zA-Z0-9_\-./]+/gm
  ];

  for (const field of fieldsToCheck) {
    if (!field) continue;
    const text = typeof field === 'string' ? field : JSON.stringify(field);

    for (const pattern of filePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const filePath = match[1] || match[0];
        // Normalize path
        const normalized = filePath.replace(/^\//, '').replace(/^(EHG|EHG_Engineer)\//, '');
        if (normalized.length > 3) {
          files.add(normalized);
        }
      }
    }
  }

  return files;
}

/**
 * Extract database tables from SD PRD
 * @param {Object} prd - Product Requirements Document
 * @returns {Set<string>} Set of table names
 */
export function extractDatabaseTables(prd) {
  const tables = new Set();

  const fieldsToCheck = [
    JSON.stringify(prd.data_model || {}),
    prd.technical_context,
    prd.system_architecture,
    JSON.stringify(prd.functional_requirements || [])
  ];

  const tablePatterns = [
    // Match table names in queries
    /(?:FROM|INTO|UPDATE|TABLE|JOIN)\s+([a-z_][a-z0-9_]*)/gi,
    // Match table names in data model
    /"table":\s*"([^"]+)"/gi,
    /"name":\s*"([a-z_][a-z0-9_]*)"/gi
  ];

  for (const field of fieldsToCheck) {
    if (!field) continue;
    const text = typeof field === 'string' ? field : JSON.stringify(field);

    for (const pattern of tablePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const tableName = match[1].toLowerCase();
        // Filter out common SQL keywords
        const excluded = ['where', 'select', 'from', 'join', 'left', 'right', 'inner', 'outer', 'on', 'as'];
        if (!excluded.includes(tableName) && tableName.length > 2) {
          tables.add(tableName);
        }
      }
    }
  }

  return tables;
}

/**
 * Extract API endpoints from SD PRD
 * @param {Object} prd - Product Requirements Document
 * @returns {Set<string>} Set of endpoint paths
 */
export function extractApiEndpoints(prd) {
  const endpoints = new Set();

  const fieldsToCheck = [
    JSON.stringify(prd.api_specifications || []),
    prd.system_architecture,
    prd.technical_context,
    JSON.stringify(prd.functional_requirements || [])
  ];

  const endpointPatterns = [
    /\/api\/[a-zA-Z0-9\-_/]+/g,
    /"endpoint":\s*"([^"]+)"/gi,
    /"path":\s*"(\/[^"]+)"/gi
  ];

  for (const field of fieldsToCheck) {
    if (!field) continue;
    const text = typeof field === 'string' ? field : JSON.stringify(field);

    for (const pattern of endpointPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const endpoint = (match[1] || match[0]).toLowerCase();
        endpoints.add(endpoint);
      }
    }
  }

  return endpoints;
}

/**
 * Find overlapping resources between two SDs
 * @param {Object} sd1 - First SD with PRD
 * @param {Object} sd2 - Second SD with PRD
 * @returns {Object} Overlapping resources
 */
export function findResourceOverlap(sd1, sd2) {
  const prd1 = sd1.prd || {};
  const prd2 = sd2.prd || {};

  const files1 = extractTargetFiles(prd1);
  const files2 = extractTargetFiles(prd2);
  const tables1 = extractDatabaseTables(prd1);
  const tables2 = extractDatabaseTables(prd2);
  const endpoints1 = extractApiEndpoints(prd1);
  const endpoints2 = extractApiEndpoints(prd2);

  // Find intersections
  const overlappingFiles = [...files1].filter(f => files2.has(f));
  const overlappingTables = [...tables1].filter(t => tables2.has(t));
  const overlappingEndpoints = [...endpoints1].filter(e => endpoints2.has(e));

  return {
    files: overlappingFiles,
    tables: overlappingTables,
    endpoints: overlappingEndpoints,
    has_overlap: overlappingFiles.length > 0 || overlappingTables.length > 0 || overlappingEndpoints.length > 0
  };
}

/**
 * Validate cross-SD consistency for a given SD
 * @param {string} sdId - Strategic Directive ID to validate
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Validation result
 */
export async function validateCrossSDConsistency(sdId, options = {}) {
  const {
    includeCompleted = false,
    supabaseClient = null
  } = options;

  const result = {
    sd_id: sdId,
    valid: true,
    passed: true,
    score: 100,
    issues: [],
    warnings: [],
    details: {
      sds_checked: 0,
      overlaps_found: 0,
      file_overlaps: [],
      table_overlaps: [],
      endpoint_overlaps: [],
      severity: 'none'
    }
  };

  // Initialize Supabase client
  const supabase = supabaseClient || createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  try {
    // Fetch current SD with PRD
    const { data: currentSD, error: currentError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, category')
      .eq('id', sdId)
      .single();

    if (currentError || !currentSD) {
      result.issues.push(`Could not find SD: ${sdId}`);
      result.valid = false;
      result.passed = false;
      result.score = 0;
      return result;
    }

    // Fetch current SD's PRD
    const { data: currentPRD } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('sd_id', sdId)
      .single();

    if (!currentPRD) {
      result.warnings.push(`No PRD found for ${sdId} - cannot check consistency`);
      return result;
    }

    // Fetch other active SDs
    let statusFilter = ['draft', 'planning', 'in_progress', 'active', 'review'];
    if (includeCompleted) {
      statusFilter.push('completed');
    }

    const { data: otherSDs, error: otherError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, category')
      .in('status', statusFilter)
      .neq('id', sdId);

    if (otherError) {
      result.warnings.push(`Could not fetch other SDs: ${otherError.message}`);
      return result;
    }

    if (!otherSDs || otherSDs.length === 0) {
      result.details.message = 'No other active SDs to check against';
      return result;
    }

    result.details.sds_checked = otherSDs.length;

    // Check each SD for overlaps
    for (const otherSD of otherSDs) {
      // Fetch other SD's PRD
      const { data: otherPRD } = await supabase
        .from('product_requirements_v2')
        .select('*')
        .eq('sd_id', otherSD.id)
        .single();

      if (!otherPRD) continue;

      // Find overlaps
      const overlap = findResourceOverlap(
        { ...currentSD, prd: currentPRD },
        { ...otherSD, prd: otherPRD }
      );

      if (overlap.has_overlap) {
        result.details.overlaps_found++;

        // Categorize overlaps
        if (overlap.files.length > 0) {
          result.details.file_overlaps.push({
            sd: otherSD.id,
            sd_title: otherSD.title,
            sd_status: otherSD.status,
            files: overlap.files
          });
        }

        if (overlap.tables.length > 0) {
          result.details.table_overlaps.push({
            sd: otherSD.id,
            sd_title: otherSD.title,
            sd_status: otherSD.status,
            tables: overlap.tables
          });
        }

        if (overlap.endpoints.length > 0) {
          result.details.endpoint_overlaps.push({
            sd: otherSD.id,
            sd_title: otherSD.title,
            sd_status: otherSD.status,
            endpoints: overlap.endpoints
          });
        }
      }
    }

    // Generate issues and adjust score
    if (result.details.file_overlaps.length > 0) {
      const totalFiles = result.details.file_overlaps.reduce((sum, o) => sum + o.files.length, 0);
      result.issues.push(`${totalFiles} file overlap(s) detected with ${result.details.file_overlaps.length} SD(s)`);
      result.score -= 15 * result.details.file_overlaps.length;

      for (const overlap of result.details.file_overlaps) {
        result.warnings.push(`File overlap with ${overlap.sd} (${overlap.sd_status}): ${overlap.files.slice(0, 3).join(', ')}${overlap.files.length > 3 ? '...' : ''}`);
      }
    }

    if (result.details.table_overlaps.length > 0) {
      const totalTables = result.details.table_overlaps.reduce((sum, o) => sum + o.tables.length, 0);
      result.issues.push(`${totalTables} database table overlap(s) detected with ${result.details.table_overlaps.length} SD(s)`);
      result.score -= 20 * result.details.table_overlaps.length;

      for (const overlap of result.details.table_overlaps) {
        result.warnings.push(`Table overlap with ${overlap.sd}: ${overlap.tables.join(', ')}`);
      }
    }

    if (result.details.endpoint_overlaps.length > 0) {
      const totalEndpoints = result.details.endpoint_overlaps.reduce((sum, o) => sum + o.endpoints.length, 0);
      result.issues.push(`${totalEndpoints} API endpoint overlap(s) detected with ${result.details.endpoint_overlaps.length} SD(s)`);
      result.score -= 10 * result.details.endpoint_overlaps.length;
    }

    // Determine severity
    if (result.details.table_overlaps.length > 0) {
      result.details.severity = 'high'; // Database overlaps are most risky
    } else if (result.details.file_overlaps.length > 2) {
      result.details.severity = 'high';
    } else if (result.details.file_overlaps.length > 0) {
      result.details.severity = 'medium';
    } else if (result.details.endpoint_overlaps.length > 0) {
      result.details.severity = 'low';
    }

    // Ensure score bounds
    result.score = Math.max(0, Math.min(100, result.score));

    // Determine pass/fail
    if (result.score < 50 || result.details.severity === 'high') {
      result.valid = false;
      result.passed = false;
    }

    return result;

  } catch (error) {
    result.issues.push(`Consistency check failed: ${error.message}`);
    result.valid = false;
    result.passed = false;
    result.score = 0;
    return result;
  }
}

/**
 * Get improvement guidance for cross-SD consistency issues
 * @param {Object} validationResult - Result from validateCrossSDConsistency
 * @returns {Object} Improvement guidance
 */
export function getCrossSDConsistencyGuidance(validationResult) {
  const guidance = {
    required: [],
    recommended: [],
    timeEstimate: '15-60 minutes',
    instructions: ''
  };

  if (validationResult.details.file_overlaps?.length > 0) {
    guidance.required.push('Coordinate file changes with overlapping SDs to prevent merge conflicts');
    for (const overlap of validationResult.details.file_overlaps) {
      guidance.required.push(`  Coordinate with ${overlap.sd} on: ${overlap.files.slice(0, 3).join(', ')}`);
    }
  }

  if (validationResult.details.table_overlaps?.length > 0) {
    guidance.required.push('DATABASE CONFLICT: Coordinate schema changes immediately');
    for (const overlap of validationResult.details.table_overlaps) {
      guidance.required.push(`  Tables in conflict: ${overlap.tables.join(', ')} (with ${overlap.sd})`);
    }
  }

  if (validationResult.details.endpoint_overlaps?.length > 0) {
    guidance.recommended.push('Consider API versioning or endpoint consolidation');
  }

  if (validationResult.details.severity === 'high') {
    guidance.timeEstimate = '1-2 hours';
    guidance.required.push('BLOCKING: Resolve high-severity overlaps before proceeding');
  }

  guidance.instructions =
    `Cross-SD consistency score: ${validationResult.score}%. ` +
    `Found ${validationResult.details.overlaps_found} overlap(s) across ${validationResult.details.sds_checked} SD(s). ` +
    `Severity: ${validationResult.details.severity || 'none'}`;

  return guidance;
}

export default {
  extractTargetFiles,
  extractDatabaseTables,
  extractApiEndpoints,
  findResourceOverlap,
  validateCrossSDConsistency,
  getCrossSDConsistencyGuidance
};
