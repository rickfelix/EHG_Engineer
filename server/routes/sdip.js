/**
 * SDIP/DirectiveLab API Routes
 * Extracted from server.js for modularity
 * SD-LEO-REFACTOR-SERVER-001
 */

import { Router } from 'express';
import { dbLoader, openai, directiveEnhancer } from '../config.js';
import { getWss } from '../websocket.js';

const router = Router();

// SDIP submit endpoint
router.post('/submit', async (req, res) => {
  console.log('\n🚀 ========== NEW SUBMISSION (STEP 1) ==========');
  console.log('📥 [SERVER] Received POST /api/sdip/submit');
  console.log('📦 [SERVER] Request body keys:', Object.keys(req.body));

  try {
    const submission = req.body;
    console.log('👤 [SERVER] Chairman Input:', submission.chairman_input ? submission.chairman_input.substring(0, 100) + '...' : 'None');
    console.log('📝 [SERVER] Submission Title:', submission.submission_title || 'Untitled');
    console.log('🔢 [SERVER] Current Step:', submission.current_step || 1);

    // Store initial submission in database (Step 1 data only)
    console.log('💾 [SERVER] Saving to database...');
    const result = await dbLoader.saveSDIPSubmission(submission);

    // Broadcast update to WebSocket clients
    const wss = getWss();
    if (wss) {
      wss.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'sdip_submission',
            data: result
          }));
        }
      });
    }

    console.log('✅ [SERVER] Submission saved with ID:', result.id);
    console.log('🆔 [SERVER] Submission ID type:', typeof result.id);

    // Trigger background enhancement (non-blocking, invisible to chairman)
    if (directiveEnhancer && result.chairman_input) {
      setImmediate(async () => {
        try {
          console.log('🔄 [ENHANCER] Starting background enhancement for submission:', result.id);
          const enhancement = await directiveEnhancer.enhance(result);

          if (enhancement) {
            await dbLoader.updateSubmissionStep(result.id, 1, {
              intent_summary: enhancement.intent,
              questions: enhancement.questions,
              final_summary: enhancement.comprehensiveDescription,
              synthesis_data: {
                codebaseFindings: enhancement.codebaseFindings,
                enhancedSD: enhancement.enhancedSD,
                enhanced_at: enhancement.enhanced_at
              }
            });
            console.log('✅ [ENHANCER] Background enhancement complete for submission:', result.id);
            console.log('📝 [ENHANCER] Intent extracted:', enhancement.intent?.substring(0, 80) + '...');
            console.log('📄 [ENHANCER] Comprehensive description:', enhancement.comprehensiveDescription?.length || 0, 'characters');
            console.log('❓ [ENHANCER] Questions generated:', enhancement.questions?.length || 0);
            console.log('🔍 [ENHANCER] Components found:', enhancement.codebaseFindings?.components?.length || 0);
          }
        } catch (enhanceError) {
          console.error('⚠️ [ENHANCER] Background enhancement failed:', enhanceError.message);
        }
      });
    }

    console.log('✅ [SERVER] Step 1 complete, returning submission');
    res.json({ success: true, submission: result });
  } catch (error) {
    console.error('❌ [SERVER] SDIP submission error:', error.message);
    console.error('❌ [SERVER] Stack trace:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Update submission with data from a specific step
router.put('/submissions/:id/step/:stepNumber', async (req, res) => {
  const { id } = req.params;
  const stepNumber = parseInt(req.params.stepNumber);

  console.log(`\n🔄 ========== UPDATE STEP ${stepNumber} ==========`);
  console.log(`📥 [SERVER] Received PUT /api/sdip/submissions/${id}/step/${stepNumber}`);
  console.log('🆔 [SERVER] Submission ID:', id);
  console.log('🆔 [SERVER] ID type:', typeof id);
  console.log('🔢 [SERVER] Step Number:', stepNumber);
  console.log('📦 [SERVER] Request body keys:', Object.keys(req.body));

  try {
    const stepData = req.body;
    console.log(`📋 [SERVER] Step ${stepNumber} data preview:`, JSON.stringify(stepData).substring(0, 200));

    // Special handling for Step 2: Generate intent summary with OpenAI
    if (stepNumber === 2 && openai) {
      if (stepData.feedback || stepData.chairman_input) {
        try {
          console.log('🤖 Generating intent summary with OpenAI for step 2...');
          const feedback = stepData.feedback || stepData.chairman_input;
          const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'You are an expert at extracting clear, actionable intent from user feedback. Extract the main intent or goal from the following feedback in 1-2 clear sentences. Focus on what the user wants to achieve or improve.'
              },
              {
                role: 'user',
                content: feedback
              }
            ],
            temperature: 0.3,
            max_tokens: 150
          });

          stepData.intent_summary = completion.choices[0].message.content;
          console.log('✅ [SERVER] Intent summary generated:', stepData.intent_summary.substring(0, 100) + '...');
        } catch (aiError) {
          console.error('⚠️ OpenAI intent generation failed:', aiError.message);
        }
      }
    }

    // Update the submission with step data
    console.log('💾 [SERVER] Calling database loader to update submission...');
    const updatedSubmission = await dbLoader.updateSubmissionStep(id, stepNumber, stepData);
    console.log('✅ [SERVER] Database update successful');
    console.log('🆔 [SERVER] Updated submission ID:', updatedSubmission?.id);

    // Broadcast update to WebSocket clients
    const wss = getWss();
    if (wss) {
      wss.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'sdip_step_update',
            submissionId: id,
            stepNumber,
            data: updatedSubmission
          }));
        }
      });
    }

    console.log(`✅ [SERVER] Step ${stepNumber} update complete`);
    res.json({
      success: true,
      submission: updatedSubmission,
      message: `Step ${stepNumber} data updated successfully`
    });
  } catch (error) {
    console.error(`❌ [SERVER] Error updating submission step ${stepNumber}:`, error.message);
    console.error('❌ [SERVER] Stack trace:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// List submissions
router.get('/submissions', async (req, res) => {
  try {
    console.log('📋 API: Starting getRecentSDIPSubmissions request');
    console.log('📋 API: Database connected:', dbLoader.isConnected);

    const submissions = await dbLoader.getRecentSDIPSubmissions();
    console.log('📋 API: Successfully retrieved', submissions.length, 'submissions');
    res.json(submissions);
  } catch (error) {
    console.error('❌ API Error in /api/sdip/submissions:', error.message);
    console.error('❌ Full error details:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to list submissions', details: error.message });
  }
});

// Delete a submission
router.delete('/submissions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🗑️ API: Deleting submission:', id);

    // First check if using in-memory storage
    if (global.sdipSubmissions) {
      const index = global.sdipSubmissions.findIndex(s => s.id === id);
      if (index !== -1) {
        global.sdipSubmissions.splice(index, 1);
        console.log('✅ API: Submission deleted from in-memory storage');
        res.json({ success: true, id });
        return;
      }
    }

    // Try database deletion if connected
    if (dbLoader.isConnected && dbLoader.supabase) {
      const { error: directiveError } = await dbLoader.supabase
        .from('directive_submissions')
        .delete()
        .eq('id', id);

      if (!directiveError) {
        console.log('✅ API: Submission deleted from directive_submissions table');
        res.json({ success: true, id });
        return;
      }

      const { error: sdipError } = await dbLoader.supabase
        .from('sdip_submissions')
        .delete()
        .eq('id', id);

      if (!sdipError) {
        console.log('✅ API: Submission deleted from sdip_submissions table');
        res.json({ success: true, id });
        return;
      }

      console.error('❌ Database errors:', { directiveError, sdipError });
      throw new Error('Failed to delete from both tables');
    }

    throw new Error('No storage method available');
  } catch (error) {
    console.error('❌ API Error in DELETE /api/sdip/submissions:', error.message);
    res.status(500).json({ error: 'Failed to delete submission', details: error.message });
  }
});

// Screenshot upload
router.post('/screenshot', async (req, res) => {
  try {
    const { submissionId, screenshot } = req.body;
    const result = await dbLoader.saveScreenshot(submissionId, screenshot);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Screenshot upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get submission progress
router.get('/progress/:id', async (req, res) => {
  try {
    const progress = await dbLoader.getSubmissionProgress(req.params.id);
    res.json(progress);
  } catch (error) {
    console.error('Error fetching progress:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create Strategic Directive from SDIP submission
router.post('/create-strategic-directive', async (req, res) => {
  try {
    const { submission_id, priority } = req.body;
    console.log('📋 [SERVER] Creating Strategic Directive from submission:', submission_id);
    console.log('📋 [SERVER] Priority from request:', priority || 'medium (default)');

    const submission = await dbLoader.getSubmissionById(submission_id);

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Check if Strategic Directive already exists for this submission
    if (submission.gate_status?.resulting_sd_id) {
      console.log('✅ [SERVER] Strategic Directive already exists:', submission.gate_status.resulting_sd_id);
      return res.json({
        success: true,
        sd_id: submission.gate_status.resulting_sd_id,
        redirect_url: `/strategic-directives/${submission.gate_status.resulting_sd_id}`,
        message: 'Strategic Directive already exists',
        existing: true
      });
    }

    // Also check if any existing SD references this submission
    const existingSDs = await dbLoader.loadStrategicDirectives();
    const existingSD = existingSDs.find(sd =>
      sd.metadata?.submission_id === submission_id
    );

    if (existingSD) {
      console.log('✅ [SERVER] Found existing Strategic Directive:', existingSD.id);
      await dbLoader.updateSubmissionStep(submission_id, 7, {
        status: 'submitted',
        resulting_sd_id: existingSD.id,
        completed_at: existingSD.created_at
      });
      return res.json({
        success: true,
        sd_id: existingSD.id,
        redirect_url: `/strategic-directives/${existingSD.id}`,
        message: 'Strategic Directive already exists',
        existing: true
      });
    }

    // Generate SD ID with proper format
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    const sdId = `SD-${year}-${month}${day}-${random}`;

    // Get enhanced data from synthesis_data
    const enhancedSD = submission.synthesis_data?.enhancedSD || {};
    const questions = submission.questions || [];

    // Create Strategic Directive data using enhanced intelligence
    const rawTitle = enhancedSD.title || submission.intent_summary || 'Strategic Initiative';
    const sdData = {
      id: sdId,
      sd_key: sdId,
      title: rawTitle.substring(0, 500),
      description: submission.final_summary || submission.intent_summary || submission.chairman_input || '',
      status: 'active',
      category: 'strategic_initiative',
      priority: priority || 'high',
      rationale: enhancedSD.rationale || submission.chairman_input || '',
      scope: 'Application Enhancement',
      key_changes: enhancedSD.key_constraints || [],
      strategic_objectives: [],
      success_criteria: enhancedSD.success_criteria || [],
      implementation_guidelines: [],
      dependencies: enhancedSD.dependencies || [],
      risks: enhancedSD.risks || [],
      success_metrics: enhancedSD.acceptance_signals || [],
      metadata: {
        source: 'SDIP',
        submission_id: submission.id,
        created_via: 'Directive Lab',
        target_application: enhancedSD.target_application || 'EHG',
        estimated_complexity: enhancedSD.estimated_complexity || 'medium',
        ai_enhanced: true,
        enhancement_timestamp: submission.synthesis_data?.enhanced_at || null,
        decision_questions: questions,
        codebase_findings: submission.synthesis_data?.codebaseFindings || null
      },
      created_by: 'Chairman',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('📋 [SERVER] Using enhanced SD data:');
    console.log('  - Title:', sdData.title);
    console.log('  - Success Criteria:', sdData.success_criteria.length, 'items');
    console.log('  - Dependencies:', sdData.dependencies.length, 'items');
    console.log('  - Risks:', sdData.risks.length, 'items');
    console.log('  - Questions:', questions.length, 'questions');
    console.log('  - Target App:', sdData.metadata.target_application);
    console.log('  - Complexity:', sdData.metadata.estimated_complexity);

    // Save to database
    await dbLoader.saveStrategicDirective(sdData);

    // Update submission status
    await dbLoader.updateSubmissionStep(submission_id, 7, {
      status: 'submitted',
      resulting_sd_id: sdId,
      completed_at: new Date().toISOString()
    });

    console.log('✅ [SERVER] Strategic Directive created:', sdId);

    res.json({
      success: true,
      sd_id: sdId,
      redirect_url: `/strategic-directives/${sdId}`,
      message: 'Strategic Directive created successfully'
    });

  } catch (error) {
    console.error('❌ Error creating Strategic Directive:', error);
    res.status(500).json({
      error: 'Failed to create Strategic Directive',
      message: error.message
    });
  }
});

export default router;
