#!/usr/bin/env node
/**
 * Auto-Populate Deliverables from PRD Module
 *
 * Integrates with PLAN→EXEC handoff to auto-extract deliverables from PRD
 * and populate sd_scope_deliverables table.
 *
 * ROOT CAUSE FIX: Addresses systemic gap where deliverables were documented in
 * PRD but not tracked in database, causing EXEC→PLAN handoff failures.
 *
 * ENHANCEMENT (SD-DELIVERABLES-V2-001 Phase 2):
 * - Priority source: exec_checklist with user_story_ids for linking
 * - Links deliverables to user stories via user_story_id FK
 * - Enables bi-directional sync between stories and deliverables
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

    // Build user story lookup map for ID resolution
    const storyKeyToId = new Map();
    const { data: userStories } = await supabase
      .from('user_stories')
      .select('id, story_key')
      .eq('sd_id', sdId);

    if (userStories) {
      userStories.forEach(s => storyKeyToId.set(s.story_key, s.id));
    }

    // PRIORITY: Extract from exec_checklist with user_story_ids (SD-DELIVERABLES-V2-001 Phase 2)
    if (prd.exec_checklist && Array.isArray(prd.exec_checklist)) {
      let linkedCount = 0;

      prd.exec_checklist.forEach((item, index) => {
        // Resolve user_story_id from user_story_ids array
        let userStoryId = null;
        if (item.user_story_ids && Array.isArray(item.user_story_ids) && item.user_story_ids.length > 0) {
          // Use first story key to resolve ID
          const storyKey = item.user_story_ids[0];
          userStoryId = storyKeyToId.get(storyKey) || null;
          if (userStoryId) linkedCount++;
        }

        deliverables.push({
          sd_id: sdId,
          deliverable_type: inferDeliverableType(item.text),
          deliverable_name: item.text || `Checklist Item ${index + 1}`,
          description: item.evidence ? `Evidence: ${item.evidence}` : undefined,
          extracted_from: 'prd',
          priority: 'required',
          completion_status: item.checked ? 'completed' : 'pending',
          completion_evidence: item.evidence || null,
          user_story_id: userStoryId,
          metadata: item.user_story_ids && item.user_story_ids.length > 1
            ? { linked_stories: item.user_story_ids }
            : {}
        });
      });

      if (!silent) {
        console.log(`   Extracted ${deliverables.length} deliverables from exec_checklist`);
        if (linkedCount > 0) {
          console.log(`   ✅ ${linkedCount}/${deliverables.length} linked to user stories (Phase 2)`);
        } else if (deliverables.length > 0) {
          console.log('   ⚠️  No user_story_ids in exec_checklist - consider updating PRD');
        }
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
    // Enhanced for SD-DELIVERABLES-V2-001: Links deliverables directly to user stories
    if (deliverables.length === 0) {
      const { data: storiesForExtract } = await supabase
        .from('user_stories')
        .select('id, story_key, title, priority')
        .eq('sd_id', sdId)
        .limit(10); // Max 10 to avoid over-extraction

      if (storiesForExtract && storiesForExtract.length > 0) {
        storiesForExtract.forEach(story => {
          deliverables.push({
            sd_id: sdId,
            deliverable_type: inferDeliverableType(story.title),
            deliverable_name: story.title,
            description: `User story: ${story.story_key}`,
            extracted_from: 'user_stories',
            priority: story.priority === 'high' || story.priority === 'critical' ? 'required' : 'required',
            completion_status: 'pending',
            user_story_id: story.id // Direct link for bi-directional sync
          });
        });

        if (!silent) {
          console.log(`   Extracted ${deliverables.length} deliverables from user stories`);
          console.log(`   ✅ All ${deliverables.length} linked to user stories (Phase 2)`);
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
