/**
 * Submissions Module
 * Handles SDIP submissions and related operations
 * Extracted from database-loader.js - NO BEHAVIOR CHANGES
 */

class SubmissionsManager {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
  }

  /**
   * Save an SDIP submission to the database
   */
  async saveSDIPSubmission(submission) {
    if (!this.connectionManager.isReady()) {
      console.log('⚠️  Database not connected - cannot save SDIP submission');
      return null;
    }

    const supabase = this.connectionManager.getClient();

    try {
      // Prepare the submission data
      const submissionData = {
        id: submission.id || crypto.randomUUID(),
        chairman_input: submission.chairmanInput || submission.chairman_input,
        intent_summary: submission.intentSummary || submission.intent_summary,
        screenshot_url: submission.screenshotUrl || submission.screenshot_url,
        status: submission.status || 'pending',
        current_step: submission.currentStep || submission.current_step || 1,
        processing_history: submission.processingHistory || submission.processing_history || [],
        gate_status: submission.gateStatus || submission.gate_status || {},
        metadata: submission.metadata || {},
        created_at: submission.createdAt || submission.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Insert or update the submission
      const { data, error } = await supabase
        .from('directive_submissions')
        .upsert(submissionData, {
          onConflict: 'id',
          returning: 'representation'
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Error saving SDIP submission:', error.message);
        return null;
      }

      console.log('✅ SDIP submission saved:', data.id);

      // If there are processing steps, save them
      if (submission.steps && submission.steps.length > 0) {
        const stepPromises = submission.steps.map((step, index) =>
          this.updateSubmissionStep(data.id, index + 1, step)
        );
        await Promise.all(stepPromises);
      }

      return data;
    } catch (error) {
      console.error('❌ Failed to save SDIP submission:', error.message);
      return null;
    }
  }

  /**
   * Get recent SDIP submissions
   */
  async getRecentSDIPSubmissions(limit = 20) {
    if (!this.connectionManager.isReady()) {
      console.log('⚠️  Database not connected - cannot load SDIP submissions');
      return [];
    }

    const supabase = this.connectionManager.getClient();

    try {
      const { data, error } = await supabase
        .from('directive_submissions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('❌ Error loading SDIP submissions:', error.message);
        return [];
      }

      console.log(`📊 Loaded ${data.length} recent SDIP submissions`);
      return data;
    } catch (error) {
      console.error('❌ Failed to load SDIP submissions:', error.message);
      return [];
    }
  }

  /**
   * Update a specific step in the submission process
   */
  async updateSubmissionStep(submissionId, stepNumber, stepData) {
    if (!this.connectionManager.isReady()) {
      return null;
    }

    const supabase = this.connectionManager.getClient();

    try {
      // First get the current submission
      const { data: submission, error: fetchError } = await supabase
        .from('directive_submissions')
        .select('*')
        .eq('id', submissionId)
        .single();

      if (fetchError) {
        console.error('❌ Error fetching submission:', fetchError.message);
        return null;
      }

      // Update the processing history
      const processingHistory = submission.processing_history || [];
      processingHistory[stepNumber - 1] = {
        step: stepNumber,
        ...stepData,
        timestamp: new Date().toISOString()
      };

      // Update gate status if provided
      const gateStatus = submission.gate_status || {};
      if (stepData.gate) {
        gateStatus[stepData.gate] = {
          passed: stepData.passed || false,
          message: stepData.message || '',
          timestamp: new Date().toISOString()
        };
      }

      // Update the submission
      const { data, error } = await supabase
        .from('directive_submissions')
        .update({
          current_step: stepNumber,
          processing_history: processingHistory,
          gate_status: gateStatus,
          status: stepData.status || submission.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', submissionId)
        .select()
        .single();

      if (error) {
        console.error('❌ Error updating submission step:', error.message);
        return null;
      }

      console.log(`✅ Updated step ${stepNumber} for submission ${submissionId}`);
      return data;
    } catch (error) {
      console.error('❌ Failed to update submission step:', error.message);
      return null;
    }
  }

  /**
   * Save screenshot for a submission
   */
  async saveScreenshot(submissionId, screenshot) {
    if (!this.connectionManager.isReady()) {
      return null;
    }

    const supabase = this.connectionManager.getClient();

    try {
      const { data, error } = await supabase
        .from('directive_submissions')
        .update({
          screenshot_url: screenshot,
          updated_at: new Date().toISOString()
        })
        .eq('id', submissionId)
        .select()
        .single();

      if (error) {
        console.error('❌ Error saving screenshot:', error.message);
        return null;
      }

      console.log('✅ Screenshot saved for submission:', submissionId);
      return data;
    } catch (error) {
      console.error('❌ Failed to save screenshot:', error.message);
      return null;
    }
  }

  /**
   * Get submission progress
   */
  async getSubmissionProgress(submissionId) {
    if (!this.connectionManager.isReady()) {
      return null;
    }

    const supabase = this.connectionManager.getClient();

    try {
      const { data, error } = await supabase
        .from('directive_submissions')
        .select('current_step, processing_history, gate_status, status')
        .eq('id', submissionId)
        .single();

      if (error) {
        console.error('❌ Error fetching submission progress:', error.message);
        return null;
      }

      return data;
    } catch (error) {
      console.error('❌ Failed to get submission progress:', error.message);
      return null;
    }
  }

  /**
   * Get submission by ID
   */
  async getSubmissionById(submissionId) {
    if (!this.connectionManager.isReady()) {
      console.log('⚠️  Database not connected - cannot load submission');
      return null;
    }

    const supabase = this.connectionManager.getClient();

    try {
      const { data, error } = await supabase
        .from('directive_submissions')
        .select('*')
        .eq('id', submissionId)
        .single();

      if (error) {
        console.error('❌ Error loading submission:', error.message);
        return null;
      }

      // Also fetch any related strategic directive if it was created
      if (data.gate_status?.resulting_sd_id) {
        const { data: sdData } = await supabase
          .from('strategic_directives_v2')
          .select('*')
          .eq('id', data.gate_status.resulting_sd_id)
          .single();

        if (sdData) {
          data.created_strategic_directive = sdData;
        }
      }

      console.log('✅ Loaded submission:', submissionId);
      return data;
    } catch (error) {
      console.error('❌ Failed to load submission:', error.message);
      return null;
    }
  }

  /**
   * Save a strategic directive
   */
  async saveStrategicDirective(sdData) {
    if (!this.connectionManager.isReady()) {
      console.log('⚠️  Database not connected - cannot save SD');
      return null;
    }

    const supabase = this.connectionManager.getClient();

    try {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(sdData)
        .select()
        .single();

      if (error) {
        console.error('❌ Error saving Strategic Directive:', error.message);
        return null;
      }

      console.log('✅ Strategic Directive saved:', data.sd_key);
      return data;
    } catch (error) {
      console.error('❌ Failed to save Strategic Directive:', error.message);
      return null;
    }
  }
}

export default SubmissionsManager;