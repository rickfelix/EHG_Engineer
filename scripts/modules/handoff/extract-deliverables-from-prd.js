#!/usr/bin/env node
/**
 * Auto-Populate Deliverables from PRD Module
 *
 * Integrates with PLAN→EXEC handoff to auto-extract deliverables from PRD
 * and populate sd_scope_deliverables table.
 *
 * ROOT CAUSE FIX: Addresses systemic gap where deliverables were documented in
 * PRD but not tracked in database, causing EXEC→PLAN handoff failures.
 */

/**
 * Extract deliverables from PRD and populate sd_scope_deliverables table
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} prd - PRD object from database
 * @param {Object} supabase - Supabase client
 * @param {Object} options - Options
 * @returns {Promise<Object>} Extraction results
 */
export async function extractAndPopulateDeliverables(sdId, prd, supabase, options = {}) {
  const { silent = false, skipIfExists = true } = options;

  if (!silent) {
    console.log('\n📦 Deliverables Auto-Population');
    console.log('-'.repeat(50));
  }

  try {
    // Check if deliverables already exist (skip if requested)
    if (skipIfExists) {
      const { data: existing } = await supabase
        .from('sd_scope_deliverables')
        .select('id')
        .eq('sd_id', sdId)
        .limit(1);

      if (existing && existing.length > 0) {
        if (!silent) {
          console.log('   ℹ️  Deliverables already exist - skipping extraction');
        }
        return {
          success: true,
          count: 0,
          skipped: true,
          message: 'Deliverables already exist in database'
        };
      }
    }

    const deliverables = [];

    // Option 1: Extract from exec_checklist (if it's an array)
    if (prd.exec_checklist && Array.isArray(prd.exec_checklist)) {
      prd.exec_checklist.forEach((item, index) => {
        deliverables.push({
          sd_id: sdId,
          deliverable_type: inferDeliverableType(item.text),
          deliverable_name: item.text || `Checklist Item ${index + 1}`,
          description: item.evidence ? `Evidence: ${item.evidence}` : undefined,
          extracted_from: 'prd',
          priority: 'required',
          completion_status: item.checked ? 'completed' : 'pending',
          completion_evidence: item.evidence || null
        });
      });

      if (!silent) {
        console.log(`   Extracted ${deliverables.length} deliverables from exec_checklist`);
      }
    }

    // Option 2: Extract from functional_requirements
    if (deliverables.length === 0 && prd.functional_requirements) {
      const requirements = Array.isArray(prd.functional_requirements)
        ? prd.functional_requirements
        : tryParseJSON(prd.functional_requirements);

      if (Array.isArray(requirements)) {
        requirements.forEach((req, index) => {
          deliverables.push({
            sd_id: sdId,
            deliverable_type: inferDeliverableType(req.title || req.name || req.description),
            deliverable_name: req.title || req.name || `Requirement ${index + 1}`,
            description: req.description || req.details || undefined,
            extracted_from: 'prd',
            priority: 'required',
            completion_status: 'pending'
          });
        });

        if (!silent) {
          console.log(`   Extracted ${deliverables.length} deliverables from functional_requirements`);
        }
      }
    }

    // Option 3: Extract from scope text (pattern matching)
    if (deliverables.length === 0 && prd.scope) {
      const scopeLines = prd.scope.split('\n');
      const checkpointPattern = /(?:Checkpoint|Deliverable|Component|Feature|Phase)\s*(\d+)?[:\-]\s*(.+)/i;

      scopeLines.forEach((line, index) => {
        const match = line.match(checkpointPattern);
        if (match) {
          deliverables.push({
            sd_id: sdId,
            deliverable_type: 'ui_feature', // Default, can be refined
            deliverable_name: match[2].trim(),
            description: `Extracted from PRD scope: ${match[0]}`,
            extracted_from: 'prd',
            priority: 'required',
            completion_status: 'pending'
          });
        }
      });

      if (deliverables.length > 0 && !silent) {
        console.log(`   Extracted ${deliverables.length} deliverables from scope text`);
      }
    }

    // Option 4: Extract from user stories (if no other source found)
    if (deliverables.length === 0) {
      const { data: userStories } = await supabase
        .from('user_stories')
        .select('story_key, title, priority')
        .eq('sd_id', sdId)
        .limit(10); // Max 10 to avoid over-extraction

      if (userStories && userStories.length > 0) {
        userStories.forEach(story => {
          deliverables.push({
            sd_id: sdId,
            deliverable_type: inferDeliverableType(story.title),
            deliverable_name: story.title,
            description: `User story: ${story.story_key}`,
            extracted_from: 'user_stories',
            priority: story.priority === 'high' || story.priority === 'critical' ? 'required' : 'required',
            completion_status: 'pending'
          });
        });

        if (!silent) {
          console.log(`   Extracted ${deliverables.length} deliverables from user stories`);
        }
      }
    }

    if (deliverables.length === 0) {
      if (!silent) {
        console.log('   ⚠️  No deliverables found in PRD - PRD may need refinement');
      }
      return {
        success: false,
        count: 0,
        message: 'No deliverables found in PRD - PRD may need refinement'
      };
    }

    // Insert into database
    const { data, error } = await supabase
      .from('sd_scope_deliverables')
      .insert(deliverables)
      .select();

    if (error) {
      if (!silent) {
        console.error(`   ❌ Database insert failed: ${error.message}`);
      }
      return {
        success: false,
        count: 0,
        message: `Database insert failed: ${error.message}`
      };
    }

    if (!silent) {
      console.log(`   ✅ Populated ${data.length} deliverables in database`);
      console.log('   Types:', [...new Set(data.map(d => d.deliverable_type))].join(', '));
    }

    return {
      success: true,
      count: data.length,
      deliverables: data
    };

  } catch (error) {
    if (!silent) {
      console.error(`   ❌ Extraction error: ${error.message}`);
    }
    return {
      success: false,
      count: 0,
      message: `Extraction error: ${error.message}`
    };
  }
}

/**
 * Infer deliverable type from requirement text
 */
function inferDeliverableType(text) {
  if (!text) return 'ui_feature';

  const lowerText = text.toLowerCase();

  // Database-related
  if (lowerText.includes('database') || lowerText.includes('table') ||
      lowerText.includes('schema') || lowerText.includes('migration')) {
    return 'database';
  }

  // API-related
  if (lowerText.includes('api') || lowerText.includes('endpoint') ||
      lowerText.includes('rest') || lowerText.includes('graphql')) {
    return 'api';
  }

  // Testing-related
  if (lowerText.includes('test') || lowerText.includes('e2e') ||
      lowerText.includes('testing')) {
    return 'test';
  }

  // Integration-related
  if (lowerText.includes('integration') || lowerText.includes('service') ||
      lowerText.includes('external')) {
    return 'integration';
  }

  // Migration-related
  if (lowerText.includes('migration') || lowerText.includes('migrate')) {
    return 'migration';
  }

  // UI-related (default)
  if (lowerText.includes('ui') || lowerText.includes('component') ||
      lowerText.includes('interface') || lowerText.includes('page') ||
      lowerText.includes('button') || lowerText.includes('form') ||
      lowerText.includes('modal') || lowerText.includes('drawer')) {
    return 'ui_feature';
  }

  return 'ui_feature'; // Default
}

/**
 * Try to parse JSON string, return empty array if fails
 */
function tryParseJSON(str) {
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch {
    return [];
  }
}

export default {
  extractAndPopulateDeliverables
};
