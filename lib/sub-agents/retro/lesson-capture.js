/**
 * RETRO Sub-Agent Lesson Capture Mode
 * Extracted from retro.js for modularity
 */

import { categorizeLearning, extractAffectedComponents } from './analyzers.js';
import { detectTagsFromMessage } from './utils.js';

/**
 * Capture an ad-hoc lesson learned (LESSON MODE)
 *
 * This is a lightweight flow for quickly capturing insights during implementation.
 * These lessons are stored as DRAFT/INCIDENT type entries that will be:
 * 1. Enhanced into the completion retrospective later
 * 2. Searchable for future reference
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} sdData - SD metadata
 * @param {Object} options - Execution options with lesson details
 * @param {Object} results - Results object to populate
 * @returns {Promise<Object>} Results with lesson capture status
 */
export async function captureLessonLearned(supabase, sdId, sdData, options, results) {
  console.log('\n📝 Phase 2: Capturing lesson learned...');

  if (!options.message) {
    console.log('   ❌ Missing required --message parameter');
    results.verdict = 'BLOCKED';
    results.critical_issues.push({
      severity: 'CRITICAL',
      issue: 'Lesson message is required',
      recommendation: 'Provide --message="Your lesson description here"'
    });
    return results;
  }

  const message = options.message;
  const title = options.title || message.substring(0, 80) + (message.length > 80 ? '...' : '');
  const severity = options.severity || 'medium';
  const tags = options.tags || [];
  const rootCause = options.root_cause || null;
  const prevention = options.prevention || null;

  const autoTags = detectTagsFromMessage(message);
  const allTags = [...new Set([...tags, ...autoTags])];

  console.log(`   Title: ${title}`);
  console.log(`   Severity: ${severity}`);
  console.log(`   Tags: ${allTags.join(', ') || '(none)'}`);

  const keyLearning = {
    title,
    description: message,
    severity,
    tags: allTags,
    ...(rootCause && { root_cause: rootCause }),
    ...(prevention && { prevention })
  };

  const { data: existingRetros } = await supabase
    .from('retrospectives')
    .select('id, key_learnings, what_needs_improvement')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: false })
    .limit(1);

  let stored;
  if (existingRetros && existingRetros.length > 0) {
    const existing = existingRetros[0];
    console.log(`\n   🔄 Adding lesson to existing retrospective: ${existing.id}`);

    const updatedLearnings = [...(existing.key_learnings || []), keyLearning];
    const updatedImprovements = [
      ...(existing.what_needs_improvement || []),
      `[${severity.toUpperCase()}] ${title}`
    ];

    const { data, error } = await supabase
      .from('retrospectives')
      .update({
        key_learnings: updatedLearnings,
        what_needs_improvement: updatedImprovements,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      stored = { success: false, error: error.message };
    } else {
      stored = { success: true, id: data.id, added_to_existing: true };
      console.log(`   ✅ Lesson added to retrospective (now ${updatedLearnings.length} learnings)`);
    }
  } else {
    console.log('\n   📄 Creating new DRAFT retrospective for lesson...');

    const lessonCategory = categorizeLearning(sdData, null, null, null);

    const lessonRetro = {
      sd_id: sdId,
      target_application: sdData.target_application || 'EHG',
      title,
      description: message,
      retro_type: 'INCIDENT',
      status: 'DRAFT',
      generated_by: 'MANUAL',
      learning_category: lessonCategory,
      key_learnings: [keyLearning],
      what_needs_improvement: [`[${severity.toUpperCase()}] ${title}`],
      what_went_well: [],
      action_items: prevention ? [{
        owner: 'AI',
        action: prevention,
        priority: severity
      }] : [],
      success_patterns: [],
      failure_patterns: [title],
      quality_score: 30,
      auto_generated: false,
      tags: allTags,
      affected_components: extractAffectedComponents(sdData, lessonCategory),
      trigger_event: `Lesson captured during ${sdData.status} phase`
    };

    const { data, error } = await supabase
      .from('retrospectives')
      .insert(lessonRetro)
      .select()
      .single();

    if (error) {
      stored = { success: false, error: error.message };
    } else {
      stored = { success: true, id: data.id, created_new: true };
      console.log(`   ✅ New DRAFT retrospective created: ${data.id}`);
    }
  }

  if (stored.success) {
    results.findings.retrospective = {
      id: stored.id,
      mode: 'lesson',
      lesson: keyLearning,
      added_to_existing: stored.added_to_existing || false,
      created_new: stored.created_new || false
    };
    results.recommendations.push(
      `Lesson captured: "${title}"`,
      'This lesson will be merged into the completion retrospective',
      'Run RETRO again (without --mode=lesson) after EXEC-TO-PLAN handoff for full retrospective'
    );
    console.log(`\n🏁 RETRO (LESSON MODE) Complete: ${results.verdict}`);
    console.log('   ℹ️  Note: This DRAFT entry will be enhanced into the completion retrospective');
  } else {
    results.verdict = 'ERROR';
    results.critical_issues.push({
      severity: 'HIGH',
      issue: 'Failed to store lesson',
      recommendation: 'Check database connection and retry',
      error: stored.error
    });
    console.log(`\n❌ RETRO (LESSON MODE) Failed: ${stored.error}`);
  }

  return results;
}
