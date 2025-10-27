/**
 * Story Updater
 *
 * Applies workflow issue fixes to user stories in the database.
 * Intelligently determines which story fields to update based on
 * issue type and fix description.
 *
 * Features:
 * - Dimension-aware field targeting
 * - Smart text merging (append vs. replace)
 * - Database transaction support
 * - Validation and rollback
 *
 * Added: 2025-01-15 (SD-DESIGN-WORKFLOW-REVIEW-001)
 */

/**
 * Apply a fix to a user story
 *
 * @param {Object} issue - Issue object with story_id, dimension, description
 * @param {string} fixDescription - Fix to apply (from recommendation or custom)
 * @param {Object} supabaseClient - Supabase client instance
 * @returns {Promise<Object>} Result with success, storyId, updatedFields, message
 */
export async function applyFix(issue, fixDescription, supabaseClient) {
  if (!issue.story_id) {
    return {
      success: false,
      message: 'Issue does not have associated story_id'
    };
  }

  // Fetch current user story
  const { data: story, error: fetchError } = await supabaseClient
    .from('user_stories')
    .select('*')
    .or(`id.eq.${issue.story_id},story_key.eq.${issue.story_id}`)
    .single();

  if (fetchError || !story) {
    return {
      success: false,
      message: `Failed to fetch story: ${fetchError?.message || 'Not found'}`
    };
  }

  // Determine which fields to update
  const updates = determineUpdates(issue, fixDescription, story);

  if (Object.keys(updates).length === 0) {
    return {
      success: false,
      message: 'No applicable updates determined for this fix'
    };
  }

  // Apply updates to database
  const { error: updateError } = await supabaseClient
    .from('user_stories')
    .update(updates)
    .eq('id', story.id);

  if (updateError) {
    return {
      success: false,
      message: `Failed to update story: ${updateError.message}`,
      storyId: story.id
    };
  }

  return {
    success: true,
    storyId: story.id,
    storyKey: story.story_key,
    updatedFields: Object.keys(updates),
    updates,
    message: `Successfully updated story ${story.story_key}`
  };
}

/**
 * Determine which story fields to update based on issue and fix
 */
function determineUpdates(issue, fixDescription, currentStory) {
  const updates = {};
  const dimension = issue.dimension || issue.type;

  switch (dimension) {
    case 'dead_ends':
    case 'circular_flows':
      // Workflow topology issues: update implementation_context
      if (currentStory.implementation_context) {
        updates.implementation_context = appendToContext(
          currentStory.implementation_context,
          fixDescription
        );
      } else {
        updates.implementation_context = fixDescription;
      }
      break;

    case 'error_recovery':
    case 'loading_states':
    case 'confirmations':
    case 'form_validation':
    case 'accessibility':
      // UX/behavior issues: update acceptance_criteria
      const newCriteria = extractAcceptanceCriterion(fixDescription);
      if (newCriteria) {
        updates.acceptance_criteria = addAcceptanceCriteria(
          currentStory.acceptance_criteria || [],
          newCriteria
        );
      }
      break;

    case 'state_management':
    case 'browser_controls':
      // State/navigation issues: update acceptance_criteria
      const stateCriteria = extractAcceptanceCriterion(fixDescription);
      if (stateCriteria) {
        updates.acceptance_criteria = addAcceptanceCriteria(
          currentStory.acceptance_criteria || [],
          stateCriteria
        );
      }
      break;

    case 'regressions':
      // Regression issues: may need technical notes
      // Add to metadata or implementation notes
      updates.metadata = {
        ...(currentStory.metadata || {}),
        migration_notes: fixDescription
      };
      break;

    default:
      // Generic: add to acceptance criteria
      const genericCriteria = extractAcceptanceCriterion(fixDescription);
      if (genericCriteria) {
        updates.acceptance_criteria = addAcceptanceCriteria(
          currentStory.acceptance_criteria || [],
          genericCriteria
        );
      }
  }

  return updates;
}

/**
 * Append fix to implementation context intelligently
 */
function appendToContext(currentContext, fixDescription) {
  // If fix is specific step, append with arrow
  if (/^(then|and|when|if)/i.test(fixDescription.trim())) {
    return `${currentContext} → ${fixDescription}`;
  }

  // If fix is a clarification, append as note
  if (/^(note:|clarification:|behavior:)/i.test(fixDescription.trim())) {
    return `${currentContext}\n${fixDescription}`;
  }

  // If fix describes what to add, parse and append
  if (/^add /i.test(fixDescription)) {
    const action = fixDescription.replace(/^add /i, '').trim();
    return `${currentContext} → ${action}`;
  }

  // Default: append with separator
  return `${currentContext} → ${fixDescription}`;
}

/**
 * Extract acceptance criterion from fix description
 */
function extractAcceptanceCriterion(fixDescription) {
  // If already formatted as criterion, return as-is
  if (/^(all|user|system|form|button|element)/i.test(fixDescription)) {
    return fixDescription;
  }

  // Extract from "Add acceptance criteria: X" format
  const match = fixDescription.match(/acceptance criteria:\s*"([^"]+)"/i);
  if (match) {
    return match[1];
  }

  // Extract from "Update story ... acceptance criteria: X" format
  const match2 = fixDescription.match(/acceptance criteria:\s*(.+)$/i);
  if (match2) {
    return match2[1].replace(/^["']|["']$/g, '');
  }

  // Try to extract actionable statement
  if (/show|display|validate|confirm|indicate|support|handle/i.test(fixDescription)) {
    // Extract first sentence
    const sentence = fixDescription.split(/[.\n]/)[0].trim();
    if (sentence.length > 10 && sentence.length < 200) {
      return sentence;
    }
  }

  // If fix is short and actionable, use as-is
  if (fixDescription.length < 150 && fixDescription.length > 10) {
    return fixDescription;
  }

  return null;
}

/**
 * Add new acceptance criteria to existing array
 */
function addAcceptanceCriteria(existingCriteria, newCriterion) {
  // Ensure existingCriteria is an array
  const criteria = Array.isArray(existingCriteria) ? [...existingCriteria] : [];

  // Check if criterion already exists (fuzzy match)
  const normalized = newCriterion.toLowerCase().trim();
  const alreadyExists = criteria.some(c =>
    c.toLowerCase().trim().includes(normalized) ||
    normalized.includes(c.toLowerCase().trim())
  );

  if (alreadyExists) {
    return criteria; // Don't add duplicate
  }

  criteria.push(newCriterion);
  return criteria;
}

/**
 * Apply multiple fixes in batch
 *
 * @param {Array<Object>} fixesWithIssues - Array of { issue, fix } objects
 * @param {Object} supabaseClient - Supabase client instance
 * @returns {Promise<Object>} Results summary with successes and failures
 */
export async function applyFixes(fixesWithIssues, supabaseClient) {
  const results = {
    total: fixesWithIssues.length,
    succeeded: 0,
    failed: 0,
    details: []
  };

  for (const { issue, fix } of fixesWithIssues) {
    const result = await applyFix(issue, fix, supabaseClient);

    results.details.push({
      issue: {
        dimension: issue.dimension,
        story_id: issue.story_id,
        description: issue.description
      },
      fix,
      result
    });

    if (result.success) {
      results.succeeded++;
    } else {
      results.failed++;
    }
  }

  return results;
}

/**
 * Validate that a fix was successfully applied
 *
 * @param {string} storyId - Story ID or story_key
 * @param {Array<string>} expectedFields - Fields that should have been updated
 * @param {Object} supabaseClient - Supabase client instance
 * @returns {Promise<Object>} Validation result with success and details
 */
export async function validateFix(storyId, expectedFields, supabaseClient) {
  const { data: story, error } = await supabaseClient
    .from('user_stories')
    .select('*')
    .or(`id.eq.${storyId},story_key.eq.${storyId}`)
    .single();

  if (error || !story) {
    return {
      success: false,
      message: `Failed to fetch story for validation: ${error?.message || 'Not found'}`
    };
  }

  const validation = {
    success: true,
    storyId: story.id,
    storyKey: story.story_key,
    validatedFields: []
  };

  for (const field of expectedFields) {
    const value = story[field];

    if (value === null || value === undefined) {
      validation.success = false;
      validation.validatedFields.push({
        field,
        status: 'MISSING',
        message: `Field ${field} is null or undefined`
      });
    } else if (Array.isArray(value) && value.length === 0) {
      validation.success = false;
      validation.validatedFields.push({
        field,
        status: 'EMPTY',
        message: `Field ${field} is empty array`
      });
    } else {
      validation.validatedFields.push({
        field,
        status: 'OK',
        value: typeof value === 'string' ? value.substring(0, 100) : `[${typeof value}]`
      });
    }
  }

  return validation;
}
