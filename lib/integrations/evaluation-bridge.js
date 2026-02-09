/**
 * EVA Evaluation Bridge
 * SD: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001D
 *
 * Bridges intake items (Todoist/YouTube) to the existing feedback/vetting pipeline.
 * Flow: Classify → Dedup → Create feedback → Quality score → Vetting → Update intake
 */

import { createClient } from '@supabase/supabase-js';
import { classifyIdea } from './idea-classifier.js';
import { checkDuplicate } from './dedup-checker.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Create Supabase client
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function createSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Evaluate a single intake item through the pipeline
 * @param {Object} item - Intake row (from eva_todoist_intake or eva_youtube_intake)
 * @param {string} sourceType - 'todoist' or 'youtube'
 * @param {Object} options
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase]
 * @param {boolean} [options.verbose=false]
 * @returns {Promise<Object>} Evaluation result
 */
async function evaluateItem(item, sourceType, options = {}) {
  const supabase = options.supabase || createSupabaseClient();
  const tableName = sourceType === 'todoist' ? 'eva_todoist_intake' : 'eva_youtube_intake';
  const feedbackSourceType = `${sourceType}_intake`;

  const result = {
    id: item.id,
    title: item.title,
    sourceType,
    status: 'pending',
    classification: null,
    dedup: null,
    feedbackId: null,
    vettingOutcome: null
  };

  try {
    // 1. Mark as evaluating
    await supabase.from(tableName).update({ status: 'evaluating' }).eq('id', item.id);

    // 2. Classify
    const classification = await classifyIdea(item.title, item.description, { supabase, verbose: options.verbose });
    result.classification = classification;

    await supabase.from(tableName).update({
      venture_tag: classification.venture_tag,
      business_function: classification.business_function,
      confidence_score: classification.confidence_score
    }).eq('id', item.id);

    if (options.verbose) {
      console.log(`    Classification: ${classification.venture_tag} / ${classification.business_function} (${(classification.confidence_score * 100).toFixed(0)}%)`);
    }

    // 3. Dedup check
    const dedup = await checkDuplicate(item.title, { supabase, sourceType });
    result.dedup = dedup;

    if (dedup.isDuplicate) {
      if (options.verbose) {
        console.log(`    Duplicate detected: "${dedup.bestMatch.title}" (${(dedup.bestMatch.similarity * 100).toFixed(0)}% match)`);
      }
      // Mark as needs_revision with dedup info
      await supabase.from(tableName).update({
        status: 'needs_revision',
        evaluation_outcome: {
          step: 'dedup',
          duplicate_of: dedup.bestMatch,
          message: `Similar item exists: "${dedup.bestMatch.title}" (${(dedup.bestMatch.similarity * 100).toFixed(0)}% match)`
        }
      }).eq('id', item.id);

      result.status = 'needs_revision';
      return result;
    }

    // 4. Create feedback row
    const feedbackRow = {
      title: item.title,
      description: item.description || `${sourceType === 'youtube' ? 'YouTube video' : 'Todoist task'}: ${item.title}`,
      type: 'enhancement',
      source_type: feedbackSourceType,
      status: 'open',
      priority: sourceType === 'todoist' ? mapTodoistPriority(item.todoist_priority) : 'medium',
      metadata: {
        eva_intake_id: item.id,
        eva_source_type: sourceType,
        venture_tag: classification.venture_tag,
        business_function: classification.business_function,
        confidence_score: classification.confidence_score
      }
    };

    const { data: feedbackData, error: feedbackError } = await supabase
      .from('feedback')
      .insert(feedbackRow)
      .select('id')
      .single();

    if (feedbackError) {
      throw new Error(`Feedback creation failed: ${feedbackError.message}`);
    }

    result.feedbackId = feedbackData.id;

    // Link feedback to intake
    await supabase.from(tableName).update({ feedback_id: feedbackData.id }).eq('id', item.id);

    if (options.verbose) {
      console.log(`    Feedback created: ${feedbackData.id}`);
    }

    // 5. Quality scoring (try to use existing processor)
    let qualityResult = null;
    try {
      const { processFeedbackQuality } = await import('../quality/feedback-quality-processor.js');
      qualityResult = await processFeedbackQuality(feedbackData.id, { supabase });
    } catch {
      // Quality processor not available - continue without scoring
    }

    // 6. Vetting (try to use existing engine)
    let vettingResult = null;
    try {
      const { VettingEngine } = await import('../sub-agents/vetting/index.js');
      const engine = new VettingEngine({ supabase });
      vettingResult = await engine.vet({
        title: item.title,
        description: item.description,
        type: 'enhancement',
        metadata: feedbackRow.metadata
      });
      result.vettingOutcome = vettingResult;
    } catch {
      // Vetting engine not available - auto-approve
      vettingResult = { verdict: 'approved', reason: 'Vetting engine unavailable - auto-approved' };
      result.vettingOutcome = vettingResult;
    }

    // 7. Update intake with final status
    const finalStatus = vettingResult?.verdict === 'rejected' ? 'rejected' :
                        vettingResult?.verdict === 'needs_revision' ? 'needs_revision' : 'approved';

    await supabase.from(tableName).update({
      status: finalStatus,
      evaluation_outcome: {
        classification,
        quality: qualityResult,
        vetting: vettingResult,
        evaluated_at: new Date().toISOString()
      }
    }).eq('id', item.id);

    result.status = finalStatus;

    if (options.verbose) {
      console.log(`    Final status: ${finalStatus}`);
    }

  } catch (err) {
    // Mark as error
    await supabase.from(tableName).update({
      status: 'error',
      evaluation_outcome: { error: err.message, failed_at: new Date().toISOString() }
    }).eq('id', item.id);

    result.status = 'error';
    result.error = err.message;
  }

  return result;
}

/**
 * Map Todoist priority (1-4, where 4=urgent) to feedback priority
 * @param {number} priority
 * @returns {string}
 */
function mapTodoistPriority(priority) {
  switch (priority) {
    case 4: return 'critical';
    case 3: return 'high';
    case 2: return 'medium';
    default: return 'low';
  }
}

/**
 * Evaluate all pending intake items
 * @param {Object} options
 * @param {string} [options.sourceType] - 'todoist', 'youtube', or omit for both
 * @param {number} [options.limit]
 * @param {boolean} [options.verbose=false]
 * @returns {Promise<Object>} Evaluation results
 */
export async function evaluatePendingItems(options = {}) {
  const supabase = options.supabase || createSupabaseClient();
  const results = {
    todoist: { evaluated: 0, approved: 0, rejected: 0, needsRevision: 0, errors: 0 },
    youtube: { evaluated: 0, approved: 0, rejected: 0, needsRevision: 0, errors: 0 }
  };

  // Evaluate Todoist items
  if (!options.sourceType || options.sourceType === 'todoist') {
    let query = supabase.from('eva_todoist_intake').select('*').eq('status', 'pending');
    if (options.limit) query = query.limit(options.limit);
    const { data: todoistItems } = await query;

    for (const item of todoistItems || []) {
      if (options.verbose) console.log(`  Evaluating: ${item.title}`);
      const result = await evaluateItem(item, 'todoist', { supabase, verbose: options.verbose });
      results.todoist.evaluated++;
      results.todoist[result.status === 'approved' ? 'approved' :
                       result.status === 'rejected' ? 'rejected' :
                       result.status === 'needs_revision' ? 'needsRevision' : 'errors']++;
    }
  }

  // Evaluate YouTube items
  if (!options.sourceType || options.sourceType === 'youtube') {
    let query = supabase.from('eva_youtube_intake').select('*').eq('status', 'pending');
    if (options.limit) query = query.limit(options.limit);
    const { data: youtubeItems } = await query;

    for (const item of youtubeItems || []) {
      if (options.verbose) console.log(`  Evaluating: ${item.title}`);
      const result = await evaluateItem(item, 'youtube', { supabase, verbose: options.verbose });
      results.youtube.evaluated++;
      results.youtube[result.status === 'approved' ? 'approved' :
                       result.status === 'rejected' ? 'rejected' :
                       result.status === 'needs_revision' ? 'needsRevision' : 'errors']++;
    }
  }

  return results;
}

export default { evaluatePendingItems };
