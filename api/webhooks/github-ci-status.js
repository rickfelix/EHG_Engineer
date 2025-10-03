/**
 * GitHub CI/CD Status Webhook Handler
 * LEO Protocol Integration for Automated Pipeline Monitoring
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Verify GitHub webhook signature
 */
function verifyGitHubSignature(payload, signature, secret) {
  if (!signature || !secret) return false;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  const actualSignature = signature.replace('sha256=', '');

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(actualSignature, 'hex')
  );
}

/**
 * Extract Strategic Directive ID from commit message or branch name
 */
function extractSDId(commitMessage, branchName) {
  // Look for SD-XXX pattern in commit message first
  const commitMatch = commitMessage?.match(/SD-(\w+)/i);
  if (commitMatch) return `SD-${commitMatch[1].toUpperCase()}`;

  // Look for SD pattern in branch name
  const branchMatch = branchName?.match(/SD-(\w+)/i);
  if (branchMatch) return `SD-${branchMatch[1].toUpperCase()}`;

  // Look for feature branches with SD pattern
  const featureMatch = branchName?.match(/feature\/SD-(\w+)/i);
  if (featureMatch) return `SD-${featureMatch[1].toUpperCase()}`;

  return null;
}

/**
 * Categorize CI/CD failure based on workflow name and failure details
 */
function categorizeFailure(workflowName, conclusion, jobDetails = {}) {
  const workflow = workflowName?.toLowerCase() || '';

  if (workflow.includes('test') || workflow.includes('jest') || workflow.includes('spec')) {
    return 'test_failure';
  }
  if (workflow.includes('lint') || workflow.includes('eslint') || workflow.includes('prettier')) {
    return 'lint_error';
  }
  if (workflow.includes('build') || workflow.includes('compile')) {
    return 'build_failure';
  }
  if (workflow.includes('deploy') || workflow.includes('production')) {
    return 'deployment_failure';
  }
  if (conclusion === 'timed_out') {
    return 'timeout';
  }
  if (workflow.includes('security') || workflow.includes('audit')) {
    return 'security_scan';
  }
  if (workflow.includes('dependencies') || workflow.includes('npm audit')) {
    return 'dependency_issue';
  }

  return 'other';
}

/**
 * Trigger LEO sub-agent for CI/CD failure resolution
 */
async function triggerFailureResolution(pipelineStatusId, sdId, failureCategory) {
  try {
    // Create failure resolution record
    const { data: resolution, error: resolutionError } = await supabase
      .from('ci_cd_failure_resolutions')
      .insert({
        pipeline_status_id: pipelineStatusId,
        sd_id: sdId,
        failure_category: failureCategory,
        auto_resolution_attempted: true,
        sub_agent_triggered: 'GITHUB',
        resolution_method: 'automated_analysis'
      })
      .select()
      .single();

    if (resolutionError) {
      console.error('Failed to create failure resolution record:', resolutionError);
      return false;
    }

    // TODO: Trigger DevOps Platform Architect sub-agent
    // This would integrate with the LEO sub-agent system
    console.log(`🤖 Triggering DevOps Platform Architect for ${failureCategory} failure in ${sdId}`);

    // For now, log the sub-agent execution
    const { error: executionError } = await supabase
      .from('sub_agent_executions')
      .insert({
        sub_agent_id: 'devops-platform-architect',
        triggered_by: 'ci_cd_failure',
        context: {
          sd_id: sdId,
          failure_category: failureCategory,
          pipeline_status_id: pipelineStatusId,
          auto_triggered: true
        },
        status: 'queued'
      });

    if (executionError) {
      console.error('Failed to log sub-agent execution:', executionError);
    }

    return true;
  } catch (error) {
    console.error('Error triggering failure resolution:', error);
    return false;
  }
}

/**
 * Update Strategic Directive CI/CD status
 */
async function updateSDCiCdStatus(sdId) {
  try {
    // Use the database function to get current status
    const { data, error } = await supabase
      .rpc('get_sd_ci_cd_status', { sd_id_param: sdId });

    if (error) {
      console.error('Failed to get SD CI/CD status:', error);
      return false;
    }

    if (data && data.length > 0) {
      const status = data[0];

      // Update the strategic directive
      const { error: updateError } = await supabase
        .from('strategic_directives_v2')
        .update({
          ci_cd_status: status.status,
          last_pipeline_run: status.last_run,
          pipeline_health_score: status.health_score,
          updated_at: new Date().toISOString()
        })
        .eq('id', sdId);

      if (updateError) {
        console.error('Failed to update SD CI/CD status:', updateError);
        return false;
      }

      console.log(`✅ Updated ${sdId} CI/CD status: ${status.status} (${status.health_score}% health)`);
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error updating SD CI/CD status:', error);
    return false;
  }
}

/**
 * Process workflow run event
 */
async function processWorkflowRunEvent(event, payload) {
  const { workflow_run } = payload;
  const repository = payload.repository;

  // Extract SD ID from commit message or branch
  const commitMessage = workflow_run.head_commit?.message || '';
  const branchName = workflow_run.head_branch || '';
  const sdId = extractSDId(commitMessage, branchName);

  if (!sdId) {
    console.log('⚠️ No Strategic Directive ID found in commit or branch');
    return { success: true, message: 'No SD ID found, skipping' };
  }

  // Verify SD exists
  const { data: existingSD, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status')
    .eq('id', sdId)
    .single();

  if (sdError || !existingSD) {
    console.log(`⚠️ Strategic Directive ${sdId} not found in database`);
    return { success: true, message: 'SD not found, skipping' };
  }

  // Store pipeline status
  const pipelineData = {
    sd_id: sdId,
    repository_name: repository.full_name,
    workflow_name: workflow_run.name,
    workflow_id: workflow_run.workflow_id,
    run_id: workflow_run.id,
    run_number: workflow_run.run_number,
    commit_sha: workflow_run.head_sha,
    commit_message: commitMessage,
    branch_name: branchName,
    status: workflow_run.status,
    conclusion: workflow_run.conclusion,
    started_at: workflow_run.run_started_at,
    completed_at: workflow_run.updated_at,
    workflow_url: workflow_run.html_url,
    logs_url: workflow_run.logs_url,
    job_details: {
      event: workflow_run.event,
      actor: workflow_run.actor?.login,
      triggering_actor: workflow_run.triggering_actor?.login,
      attempt: workflow_run.run_attempt
    }
  };

  const { data: pipelineStatus, error: pipelineError } = await supabase
    .from('ci_cd_pipeline_status')
    .upsert(pipelineData, {
      onConflict: 'run_id',
      ignoreDuplicates: false
    })
    .select()
    .single();

  if (pipelineError) {
    console.error('Failed to store pipeline status:', pipelineError);
    return { success: false, error: 'Failed to store pipeline status' };
  }

  console.log(`📊 Stored pipeline status for ${sdId}: ${workflow_run.status}/${workflow_run.conclusion}`);

  // Handle failures
  if (workflow_run.conclusion === 'failure') {
    const failureCategory = categorizeFailure(workflow_run.name, workflow_run.conclusion, pipelineData.job_details);

    console.log(`❌ CI/CD Failure detected for ${sdId}: ${failureCategory}`);

    // Trigger automated resolution
    await triggerFailureResolution(pipelineStatus.id, sdId, failureCategory);
  }

  // Update SD CI/CD status
  await updateSDCiCdStatus(sdId);

  return {
    success: true,
    message: `Processed ${event} for ${sdId}`,
    pipeline_status_id: pipelineStatus.id
  };
}

/**
 * Main webhook handler
 */
async function handleGitHubWebhook(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const signature = req.headers['x-hub-signature-256'];
    const deliveryId = req.headers['x-github-delivery'];
    const event = req.headers['x-github-event'];

    const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const parsedPayload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Get webhook secret from database
    const repository = parsedPayload.repository?.full_name;
    const { data: config } = await supabase
      .from('ci_cd_monitoring_config')
      .select('webhook_secret_hash, monitoring_enabled')
      .eq('repository_name', repository)
      .single();

    // Verify signature (skip in development)
    const isSignatureValid = process.env.NODE_ENV === 'development' ||
      (config?.webhook_secret_hash && verifyGitHubSignature(payload, signature, config.webhook_secret_hash));

    // Store webhook event for audit
    const { error: webhookError } = await supabase
      .from('github_webhook_events')
      .insert({
        event_type: event,
        delivery_id: deliveryId,
        event_payload: parsedPayload,
        signature_valid: isSignatureValid,
        processed_successfully: false
      });

    if (webhookError) {
      console.error('Failed to store webhook event:', webhookError);
    }

    if (!isSignatureValid) {
      console.error('❌ Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    if (!config?.monitoring_enabled) {
      console.log('⚠️ Monitoring disabled for repository:', repository);
      return res.status(200).json({ message: 'Monitoring disabled' });
    }

    let result = { success: true, message: 'Event received but not processed' };

    // Process different event types
    switch (event) {
      case 'workflow_run':
        result = await processWorkflowRunEvent(event, parsedPayload);
        break;

      case 'check_suite':
        // Handle check suite events (for status checks)
        console.log('📋 Check suite event received:', parsedPayload.check_suite.conclusion);
        break;

      case 'deployment_status':
        // Handle deployment status events
        console.log('🚀 Deployment status event received:', parsedPayload.deployment_status.state);
        break;

      default:
        console.log(`ℹ️ Unhandled event type: ${event}`);
    }

    // Update webhook event as processed
    if (deliveryId) {
      await supabase
        .from('github_webhook_events')
        .update({
          processed_successfully: result.success,
          processed_at: new Date().toISOString(),
          processing_error: result.success ? null : result.error
        })
        .eq('delivery_id', deliveryId);
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ Webhook processing error:', error);

    // Log error to database if possible
    if (req.headers['x-github-delivery']) {
      try {
        await supabase
          .from('github_webhook_events')
          .update({
            processed_successfully: false,
            processed_at: new Date().toISOString(),
            processing_error: error.message
          })
          .eq('delivery_id', req.headers['x-github-delivery']);
      } catch (logError) {
        console.error('Failed to log webhook error:', logError);
      }
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Webhook processing failed'
    });
  }
}

module.exports = { handleGitHubWebhook };

// Export for serverless environments
module.exports.default = handleGitHubWebhook;