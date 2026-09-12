/**
 * Feedback API Routes
 * SD-QUALITY-INT-001: Feedback-to-SD Promotion
 * SD-FDBK-ENH-ADD-INTELLIGENT-RESOLUTION-001: Resolution enforcement
 * Extracted from server.js for modularity
 * SD-LEO-REFACTOR-SERVER-001
 */

import { Router } from 'express';
import { dbLoader } from '../config.js';
import {
  validateStatusTransition,
  validateReferences,
  ERROR_CODES
} from '../../lib/quality/feedback-resolution-validator.js';
import { fetchLatestFeedback, buildFeedbackCorrection } from '../../lib/governance/feedback-correction.js';

const router = Router();

/**
 * Promote a feedback item to a Strategic Directive
 * Called from QualityInboxPage when user clicks "Promote to SD" button
 */
router.post('/:id/promote-to-sd', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority } = req.body;

    console.log(`📋 [SERVER] Promoting feedback ${id} to Strategic Directive`);

    if (!dbLoader.supabase) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    // SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A: public.feedback is append-only. Resolve to the
    // LATEST row in the correction chain (never trust the raw :id row for the idempotency
    // guard below, which may already be stale) -- a resolution error is fail-closed, not
    // silently treated as "not yet promoted".
    const latestResult = await fetchLatestFeedback(dbLoader.supabase, id);
    if (latestResult.error) {
      console.error('❌ Feedback not found:', latestResult.error);
      return res.status(404).json({ error: 'Feedback not found' });
    }
    const feedback = latestResult.row;

    // Check if already promoted
    if (feedback.resolution_sd_id) {
      return res.json({
        success: true,
        sd_id: feedback.resolution_sd_id,
        message: 'Feedback already promoted to SD',
        existing: true
      });
    }

    // SD-LEO-INFRA-WIRE-FEEDBACK-QUALITY-001: Vetting gate before SD promotion
    // Quality score must meet minimum threshold for promotion.
    // SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A: feedback.quality_score does not exist on the
    // table (real columns are rubric_score/quality_assessment) -- this gate has always been
    // a silent no-op. Corrected to read rubric_score.
    if (feedback.rubric_score != null && feedback.rubric_score < 40) {
      console.log(`⚠️ [SERVER] Feedback ${id} blocked: rubric_score ${feedback.rubric_score} < 40`);
      return res.status(422).json({
        error: 'Feedback quality too low for SD promotion',
        code: 'QUALITY_GATE_FAILED',
        quality_score: feedback.rubric_score,
        threshold: 40,
        message: 'Improve feedback quality before promoting to SD. Add details, reproduction steps, or impact assessment.'
      });
    }

    // Generate SD ID
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    const sdId = `SD-FB-${year}${month}${day}-${random}`;

    // Map feedback priority to SD priority
    const sdPriority = priority || feedback.priority || 'P2';
    const sdPriorityLevel = sdPriority === 'P0' ? 'critical' :
                           sdPriority === 'P1' ? 'high' :
                           sdPriority === 'P2' ? 'medium' : 'low';

    // Create the Strategic Directive
    const sdData = {
      sd_key: sdId,
      title: title || feedback.title,
      description: description || feedback.description || `Promoted from feedback: ${feedback.title}`,
      status: 'draft',
      current_phase: 'LEAD',
      priority: sdPriorityLevel,
      category: feedback.type === 'enhancement' ? 'enhancement' : 'bug_fix',
      metadata: {
        source: 'feedback_promotion',
        feedback_id: feedback.id,
        original_priority: feedback.priority,
        original_severity: feedback.severity,
        occurrence_count: feedback.occurrence_count,
        error_type: feedback.error_type,
        promoted_at: new Date().toISOString()
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: newSD, error: insertError } = await dbLoader.supabase
      .from('strategic_directives_v2')
      .insert(sdData)
      .select('id, sd_key')
      .single();

    if (insertError) {
      console.error('❌ Failed to create SD:', insertError.message);
      return res.status(500).json({ error: 'Failed to create Strategic Directive', details: insertError.message });
    }

    // Record the feedback -> SD link as a correction (feedback is append-only; UPDATE is
    // rejected unconditionally). SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A / TS-12: a failed
    // correction-insert now returns an error response instead of silently warn-and-succeeding
    // -- the old warn-only path let a repeat click mint a second SD, because the idempotency
    // guard above never saw resolution_sd_id land on a failed write.
    const correctionPayload = buildFeedbackCorrection(feedback, {
      resolution_sd_id: newSD.sd_key,
      status: 'triaged',
    });
    const { error: correctionError } = await dbLoader.supabase.from('feedback').insert(correctionPayload);

    if (correctionError) {
      console.error('❌ Failed to record feedback -> SD correction:', correctionError.message);
      return res.status(500).json({
        error: 'Strategic Directive created, but failed to record the feedback link',
        sd_id: newSD.sd_key,
        details: correctionError.message,
      });
    }

    console.log(`✅ [SERVER] Created SD ${newSD.sd_key} from feedback ${id}`);

    res.json({
      success: true,
      sd_id: newSD.sd_key,
      sd_uuid: newSD.id,
      feedback_id: id,
      message: 'Feedback successfully promoted to Strategic Directive'
    });

  } catch (error) {
    console.error('❌ Error promoting feedback to SD:', error);
    res.status(500).json({ error: 'Failed to promote feedback', details: error.message });
  }
});

/**
 * Get feedback item with SD promotion status
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!dbLoader.supabase) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { data: feedback, error } = await dbLoader.supabase
      .from('feedback')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    res.json(feedback);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

/**
 * Update feedback status with resolution enforcement (FR-4)
 * Validates terminal status transitions have proper resolution metadata.
 * Returns stable error codes for constraint violations.
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolution_sd_id, quick_fix_id, duplicate_of_id, resolution_notes } = req.body;

    if (!dbLoader.supabase) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    if (!status) {
      return res.status(400).json({ error: 'status field is required' });
    }

    // Fetch existing feedback for merge validation. SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A:
    // resolve to the LATEST row in the correction chain (never trust the raw :id row, which
    // may already be stale) -- a resolution error is fail-closed, not treated as "not found".
    const latestResult = await fetchLatestFeedback(dbLoader.supabase, id);
    if (latestResult.error) {
      return res.status(404).json({
        error: 'Feedback not found',
        code: ERROR_CODES.FEEDBACK_REFERENCE_NOT_FOUND
      });
    }
    const existing = latestResult.row;

    const updateData = { status };
    if (resolution_sd_id !== undefined) updateData.resolution_sd_id = resolution_sd_id;
    if (quick_fix_id !== undefined) updateData.quick_fix_id = quick_fix_id;
    if (duplicate_of_id !== undefined) updateData.duplicate_of_id = duplicate_of_id;
    if (resolution_notes !== undefined) updateData.resolution_notes = resolution_notes;

    // Validate status transition (FR-4: structured error codes)
    const validation = validateStatusTransition({
      feedbackId: id,
      newStatus: status,
      updateData,
      existingFeedback: existing
    });

    if (!validation.valid) {
      return res.status(422).json(validation.error);
    }

    // Validate foreign key references exist
    const refValidation = await validateReferences(dbLoader.supabase, {
      quick_fix_id: updateData.quick_fix_id,
      duplicate_of_id: updateData.duplicate_of_id,
      resolution_sd_id: updateData.resolution_sd_id
    });

    if (!refValidation.valid) {
      return res.status(422).json(refValidation.error);
    }

    // Persist the change as a correction (feedback is append-only; UPDATE is rejected
    // unconditionally).
    const correctionPayload = buildFeedbackCorrection(existing, updateData);
    const { error: correctionError } = await dbLoader.supabase.from('feedback').insert(correctionPayload);

    if (correctionError) {
      console.error(`[feedback] Failed to record correction for ${id}:`, correctionError.message);
      return res.status(500).json({ error: 'Failed to update feedback', details: correctionError.message });
    }

    res.json({ success: true, id, status, message: `Feedback status updated to '${status}'` });

  } catch (error) {
    console.error('[feedback] Error updating status:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
