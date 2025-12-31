/**
 * Genesis Virtual Bunker - Vercel Preview Deployment
 *
 * Deploys generated simulation repositories to Vercel preview URLs.
 * Part of SD-GENESIS-V31-MASON-P3
 *
 * @module lib/genesis/vercel-deploy
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Deployment result structure.
 * @typedef {Object} DeployResult
 * @property {boolean} success - Whether deployment succeeded
 * @property {string} [url] - Preview URL if successful
 * @property {string} [deploymentId] - Vercel deployment ID
 * @property {string} [error] - Error message if failed
 */

/**
 * Execute a command and return output.
 *
 * @param {string} command - Command to run
 * @param {string[]} args - Command arguments
 * @param {string} cwd - Working directory
 * @returns {Promise<{ success: boolean, output: string, exitCode: number }>}
 */
async function execCommand(command, args, cwd, timeout = 120000) {
  return new Promise((resolve) => {
    let output = '';
    let timedOut = false;

    const proc = spawn(command, args, {
      cwd,
      shell: true,
      env: { ...process.env },
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, timeout);

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({
        success: exitCode === 0 && !timedOut,
        output,
        exitCode: timedOut ? -1 : exitCode,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        output: err.message,
        exitCode: -1,
      });
    });
  });
}

/**
 * Deploy a repository to Vercel preview.
 *
 * @param {string} projectPath - Path to the project directory
 * @param {Object} options - Deployment options
 * @param {string} options.projectName - Vercel project name
 * @param {string} options.simulationId - Genesis simulation ID
 * @param {number} options.ttlDays - Time-to-live in days
 * @returns {Promise<DeployResult>}
 */
export async function deployToVercel(projectPath, options = {}) {
  const {
    projectName,
    simulationId,
    ttlDays = 7,
  } = options;

  // Check if Vercel CLI is available
  const vercelCheck = await execCommand('vercel', ['--version'], projectPath);
  if (!vercelCheck.success) {
    return {
      success: false,
      error: 'Vercel CLI not installed. Run: npm i -g vercel',
    };
  }

  // Check if logged in
  const whoami = await execCommand('vercel', ['whoami'], projectPath);
  if (!whoami.success) {
    return {
      success: false,
      error: 'Not logged in to Vercel. Run: vercel login',
    };
  }

  // Deploy to preview
  console.log(`Deploying ${projectName || 'project'} to Vercel preview...`);
  const deployArgs = ['deploy', '--yes'];

  if (projectName) {
    deployArgs.push('--name', projectName);
  }

  const deploy = await execCommand('vercel', deployArgs, projectPath, 300000);

  if (!deploy.success) {
    return {
      success: false,
      error: `Deployment failed: ${deploy.output}`,
    };
  }

  // Extract URL from output
  const urlMatch = deploy.output.match(/https:\/\/[^\s]+\.vercel\.app/);
  if (!urlMatch) {
    return {
      success: false,
      error: 'Could not extract preview URL from deployment output',
    };
  }

  const previewUrl = urlMatch[0];

  // Extract deployment ID
  const idMatch = deploy.output.match(/dpl_[a-zA-Z0-9]+/);
  const deploymentId = idMatch ? idMatch[0] : null;

  // Verify deployment is accessible
  const healthCheck = await verifyDeployment(previewUrl);

  // Store deployment info in database if simulation ID provided
  if (simulationId) {
    await storeDeployment({
      simulationId,
      previewUrl,
      deploymentId,
      projectName,
      ttlDays,
      healthStatus: healthCheck.success ? 'healthy' : 'unhealthy',
    });
  }

  return {
    success: healthCheck.success,
    url: previewUrl,
    deploymentId,
    healthCheck,
    error: healthCheck.success ? undefined : 'Deployment accessible but health check failed',
  };
}

/**
 * Verify a deployment is accessible with HTTP 200.
 *
 * @param {string} url - URL to check
 * @returns {Promise<{ success: boolean, statusCode: number, responseTime: number }>}
 */
export async function verifyDeployment(url) {
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Genesis-Virtual-Bunker/1.0',
      },
    });

    return {
      success: response.status === 200,
      statusCode: response.status,
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      statusCode: 0,
      responseTime: Date.now() - startTime,
      error: error.message,
    };
  }
}

/**
 * Store deployment information in the database.
 *
 * @param {Object} deployment - Deployment info
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function storeDeployment(deployment) {
  const {
    simulationId,
    previewUrl,
    deploymentId,
    projectName,
    ttlDays,
    healthStatus,
  } = deployment;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  const { error } = await supabase
    .from('genesis_deployments')
    .insert({
      simulation_id: simulationId,
      preview_url: previewUrl,
      deployment_id: deploymentId,
      project_name: projectName,
      ttl_days: ttlDays,
      expires_at: expiresAt.toISOString(),
      health_status: healthStatus,
      created_at: new Date().toISOString(),
    });

  if (error) {
    console.warn('Could not store deployment:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * List all active deployments.
 *
 * @returns {Promise<Array>}
 */
export async function listDeployments() {
  const { data, error } = await supabase
    .from('genesis_deployments')
    .select('*')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error listing deployments:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Get deployment by simulation ID.
 *
 * @param {string} simulationId - Simulation ID
 * @returns {Promise<Object|null>}
 */
export async function getDeployment(simulationId) {
  const { data, error } = await supabase
    .from('genesis_deployments')
    .select('*')
    .eq('simulation_id', simulationId)
    .single();

  if (error) {
    return null;
  }

  return data;
}

/**
 * Delete a Vercel deployment.
 *
 * @param {string} deploymentId - Vercel deployment ID
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function deleteVercelDeployment(deploymentId) {
  if (!deploymentId) {
    return { success: false, error: 'No deployment ID provided' };
  }

  const result = await execCommand('vercel', ['rm', deploymentId, '--yes'], process.cwd());

  if (!result.success) {
    return { success: false, error: result.output };
  }

  return { success: true };
}

/**
 * Update deployment health status.
 *
 * @param {string} simulationId - Simulation ID
 * @param {string} status - Health status
 */
export async function updateDeploymentHealth(simulationId, status) {
  await supabase
    .from('genesis_deployments')
    .update({ health_status: status, updated_at: new Date().toISOString() })
    .eq('simulation_id', simulationId);
}

export default {
  deployToVercel,
  verifyDeployment,
  listDeployments,
  getDeployment,
  deleteVercelDeployment,
  updateDeploymentHealth,
};
