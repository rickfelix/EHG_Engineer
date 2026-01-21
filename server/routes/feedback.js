/**
 * Feedback API Routes
 * SD-QUALITY-INT-001: Feedback-to-SD Promotion
 * Extracted from server.js for modularity
 * SD-LEO-REFACTOR-SERVER-001
 */

import { Router } from 'express';
import { dbLoader } from '../config.js';

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

    // Get the feedback item
    const { data: feedback, error: fetchError } = await dbLoader.supabase
      .from('feedback')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !feedback) {
      console.error('❌ Feedback not found:', fetchError?.message || 'No data');
      return res.status(404).json({ error: 'Feedback not found' });
    }

    // Check if already promoted
    if (feedback.resolution_sd_id) {
      return res.json({
        success: true,
        sd_id: feedback.resolution_sd_id,
        message: 'Feedback already promoted to SD',
        existing: true
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
      legacy_id: sdId,
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
      .select('id, legacy_id')
      .single();

    if (insertError) {
      console.error('❌ Failed to create SD:', insertError.message);
      return res.status(500).json({ error: 'Failed to create Strategic Directive', details: insertError.message });
    }

    // Update the feedback with the SD reference
    const { error: updateError } = await dbLoader.supabase
      .from('feedback')
      .update({
        resolution_sd_id: newSD.legacy_id,
        status: 'triaged',
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      console.error('⚠️ Failed to update feedback with SD reference:', updateError.message);
    }

    console.log(`✅ [SERVER] Created SD ${newSD.legacy_id} from feedback ${id}`);

    res.json({
      success: true,
      sd_id: newSD.legacy_id,
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

export default router;
