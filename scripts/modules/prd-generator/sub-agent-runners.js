/**
 * Sub-Agent Runners for PRD Generator
 * Part of SD-LEO-REFACTOR-PRD-DB-001
 *
 * Functions to run DESIGN, DATABASE, SECURITY, and RISK sub-agents
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run a sub-agent with a prompt file
 *
 * @param {string} agentType - Sub-agent type (DESIGN, DATABASE, SECURITY, RISK)
 * @param {string} prompt - Prompt content
 * @param {Object} options - Options
 * @returns {Promise<string|null>} Agent output or null on failure
 */
async function runSubAgent(agentType, prompt, options = {}) {
  const { timeout = 120000, maxBuffer = 10 * 1024 * 1024 } = options;

  // Write prompt to temp file
  const promptFile = path.join('/tmp', `${agentType.toLowerCase()}-agent-prompt-${Date.now()}.txt`);

  try {
    fs.writeFileSync(promptFile, prompt);
    console.log('\ud83d\udcdd Prompt written to:', promptFile);
    console.log(`\n\ud83e\udd16 Executing ${agentType} sub-agent...\n`);

    const output = execSync(
      `node lib/sub-agent-executor.js ${agentType} --context-file "${promptFile}"`,
      {
        encoding: 'utf-8',
        maxBuffer,
        timeout
      }
    );

    console.log(`\u2705 ${agentType} analysis complete!\n`);
    console.log('\u2500'.repeat(53));
    console.log(output);
    console.log('\u2500'.repeat(53) + '\n');

    // Clean up temp file
    fs.unlinkSync(promptFile);

    return output;
  } catch (error) {
    console.warn(`\u26a0\ufe0f  ${agentType} analysis failed:`, error.message);
    console.log(`   Continuing without ${agentType} analysis...\n`);

    // Clean up temp file if it exists
    try {
      fs.unlinkSync(promptFile);
    } catch {
      // Ignore cleanup errors
    }

    return null;
  }
}

/**
 * Run DESIGN sub-agent
 *
 * @param {string} prompt - Design agent prompt
 * @returns {Promise<string|null>} Design analysis output
 */
export async function runDesignAgent(prompt) {
  console.log('\n\u2550'.repeat(55));
  console.log('\ud83c\udfa8 PHASE 1: DESIGN ANALYSIS');
  console.log('\u2550'.repeat(55));
  console.log('\ud83d\udd0d Invoking DESIGN sub-agent to analyze UI/UX workflows...\n');

  return runSubAgent('DESIGN', prompt);
}

/**
 * Run DATABASE sub-agent
 *
 * @param {string} prompt - Database agent prompt
 * @returns {Promise<string|null>} Database analysis output
 */
export async function runDatabaseAgent(prompt) {
  console.log('\n\u2550'.repeat(55));
  console.log('\ud83d\udcca PHASE 2: DATABASE SCHEMA ANALYSIS');
  console.log('\u2550'.repeat(55));
  console.log('\ud83d\udd0d Invoking DATABASE sub-agent to analyze schema and recommend changes...\n');

  return runSubAgent('DATABASE', prompt);
}

/**
 * Run SECURITY sub-agent (conditional - only for security-related SDs)
 *
 * @param {Object} sdData - SD data
 * @param {string} prompt - Security agent prompt
 * @returns {Promise<string|null>} Security analysis output
 */
export async function runSecurityAgent(sdData, prompt) {
  const sdType = sdData.sd_type || sdData.category || 'feature';
  const needsSecurity = sdType === 'security' ||
                       sdData.scope?.toLowerCase().includes('auth') ||
                       sdData.scope?.toLowerCase().includes('security') ||
                       sdData.description?.toLowerCase().includes('permission') ||
                       sdData.description?.toLowerCase().includes('rls');

  if (!needsSecurity) {
    return null;
  }

  console.log('\n\u2550'.repeat(55));
  console.log('\ud83d\udd12 PHASE 2.1: SECURITY ANALYSIS');
  console.log('\u2550'.repeat(55));
  console.log('\ud83d\udd0d Invoking SECURITY sub-agent to analyze security requirements...\n');

  return runSubAgent('SECURITY', prompt);
}

/**
 * Run RISK sub-agent
 *
 * @param {string} prompt - Risk agent prompt
 * @returns {Promise<string|null>} Risk analysis output
 */
export async function runRiskAgent(prompt) {
  console.log('\n\u2550'.repeat(55));
  console.log('\u26a0\ufe0f  PHASE 2.2: RISK ANALYSIS');
  console.log('\u2550'.repeat(55));
  console.log('\ud83d\udd0d Invoking RISK sub-agent to assess implementation risks...\n');

  return runSubAgent('RISK', prompt);
}

/**
 * Update PRD with analysis metadata
 *
 * @param {Object} supabase - Supabase client
 * @param {string} prdId - PRD ID
 * @param {string} sdId - SD ID
 * @param {Object} sdData - SD data
 * @param {Object} analyses - Object with designAnalysis, databaseAnalysis
 */
export async function updatePRDWithAnalyses(supabase, prdId, sdId, sdData, analyses) {
  const { designAnalysis, databaseAnalysis } = analyses;

  if (!designAnalysis && !databaseAnalysis) return;

  const metadata = {};

  if (designAnalysis) {
    metadata.design_analysis = {
      generated_at: new Date().toISOString(),
      sd_context: {
        id: sdId,
        title: sdData.title,
        scope: sdData.scope
      },
      raw_analysis: designAnalysis.substring(0, 5000)
    };
  }

  if (databaseAnalysis) {
    metadata.database_analysis = {
      generated_at: new Date().toISOString(),
      sd_context: {
        id: sdId,
        title: sdData.title,
        scope: sdData.scope
      },
      raw_analysis: databaseAnalysis.substring(0, 5000),
      design_informed: !!designAnalysis
    };
  }

  const { error: updateError } = await supabase
    .from('product_requirements_v2')
    .update({ metadata })
    .eq('id', prdId);

  if (updateError) {
    console.warn('\u26a0\ufe0f  Failed to update PRD with analyses:', updateError.message);
  } else {
    console.log('\u2705 PRD updated with design + database schema analyses\n');
  }
}
