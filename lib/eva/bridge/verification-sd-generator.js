/**
 * Verification SD Generator
 * SD-LEO-INFRA-REPLIT-ALTERNATIVE-BUILD-001 (FR-5)
 *
 * Auto-generates QA and Security verification SDs for Replit-built code.
 * These SDs execute in Claude Code to maintain EHG governance standards.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isMainModule } from '../../utils/is-main-module.js';
dotenv.config();

/**
 * Create verification SDs for a Replit-built venture.
 *
 * @param {string} ventureId - UUID of the venture
 * @param {object} syncData - GitHub sync data (commitSha, branch, repoUrl)
 * @returns {Promise<{created: string[], errors: string[]}>}
 */
export async function createVerificationSDs(ventureId, syncData) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const created = [];
  const errors = [];

  // Get venture name for SD titles
  const { data: venture } = await supabase
    .from('ventures')
    .select('name')
    .eq('id', ventureId)
    .single();

  const ventureName = venture?.name || 'Venture';
  const shortHash = syncData.commitSha?.slice(0, 7) || 'unknown';

  // SD templates for verification
  const verificationSDs = [
    {
      sd_key: `SD-VERIFY-QA-${ventureName.replace(/[^A-Z0-9]/gi, '-').toUpperCase().slice(0, 20)}-001`,
      title: `QA Verification: ${ventureName} (Replit Build ${shortHash})`,
      description: `Run QA verification on Replit-built code for ${ventureName}. Clone repo from ${syncData.repoUrl}, branch ${syncData.branch}, run test suite, collect coverage, and validate against Stage 20-22 quality thresholds (95% pass rate, 60% coverage).`,
      sd_type: 'fix',
      category: 'quality_assurance',
      scope: `QA verification of Replit-built code at commit ${syncData.commitSha}`,
      success_criteria: [
        { criterion: 'Test suite passes', measure: '95%+ pass rate on Vitest/Jest' },
        { criterion: 'Code coverage meets threshold', measure: '60%+ line coverage' },
        { criterion: 'No critical vulnerabilities', measure: 'npm audit clean' },
      ],
      key_changes: [
        { change: 'Run test suite against Replit-built code', type: 'verification' },
        { change: 'Collect build feedback (Vitest JSON, lcov)', type: 'verification' },
      ],
    },
    {
      sd_key: `SD-VERIFY-SEC-${ventureName.replace(/[^A-Z0-9]/gi, '-').toUpperCase().slice(0, 20)}-001`,
      title: `Security Verification: ${ventureName} (Replit Build ${shortHash})`,
      description: `Run security verification on Replit-built code for ${ventureName}. Check for hardcoded secrets, dependency vulnerabilities, and RLS policy compliance. Code was built externally and has not been through LEO's security-agent.`,
      sd_type: 'fix',
      category: 'security',
      scope: `Security scan of Replit-built code at commit ${syncData.commitSha}`,
      success_criteria: [
        { criterion: 'No hardcoded secrets', measure: 'Pre-commit secret scan passes' },
        { criterion: 'Dependencies secure', measure: 'No critical/high npm audit findings' },
        { criterion: 'Supabase RLS configured', measure: 'All tables have RLS policies if applicable' },
      ],
      key_changes: [
        { change: 'Run secret detection scan', type: 'verification' },
        { change: 'Run dependency audit', type: 'verification' },
        { change: 'Verify RLS policies', type: 'verification' },
      ],
    },
  ];

  for (const sdTemplate of verificationSDs) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, status')
      .eq('sd_key', sdTemplate.sd_key)
      .maybeSingle();

    if (existing) {
      created.push(sdTemplate.sd_key);
      continue; // Already created
    }

    const { error } = await supabase.from('strategic_directives_v2').insert({
      id: sdTemplate.sd_key,
      sd_key: sdTemplate.sd_key,
      title: sdTemplate.title,
      description: sdTemplate.description,
      sd_type: sdTemplate.sd_type,
      category: sdTemplate.category,
      status: 'draft',
      current_phase: 'LEAD',
      priority: 'high',
      is_active: true,
      progress: 0,
      scope: sdTemplate.scope,
      venture_id: ventureId,
      success_criteria: sdTemplate.success_criteria,
      key_changes: sdTemplate.key_changes,
      key_principles: ['Verify externally-built code meets EHG governance standards'],
      strategic_objectives: ['Maintain code quality for Replit-built ventures'],
      risks: [{ risk: 'Replit code may have different patterns than Claude Code output', mitigation: 'Run full test suite and security scan' }],
      target_application: 'EHG_Engineer',
      metadata: {
        source: 'verification-sd-generator',
        build_method: 'replit_agent',
        source_commit: syncData.commitSha,
        source_branch: syncData.branch,
        repo_url: syncData.repoUrl,
        venture_id: ventureId,
      },
    });

    if (error) {
      errors.push(`Failed to create ${sdTemplate.sd_key}: ${error.message}`);
    } else {
      created.push(sdTemplate.sd_key);
    }
  }

  return { created, errors };
}

// CLI entry point
if (isMainModule(import.meta.url)) {
  const ventureId = process.argv[2];
  const commitSha = process.argv[3] || 'unknown';
  const branch = process.argv[4] || 'replit/sprint-1';

  if (!ventureId) {
    console.error('Usage: node lib/eva/bridge/verification-sd-generator.js <venture-id> [commit-sha] [branch]');
    process.exit(1);
  }

  createVerificationSDs(ventureId, {
    commitSha,
    branch,
    repoUrl: `https://github.com/rickfelix/${ventureId}`,
  })
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
