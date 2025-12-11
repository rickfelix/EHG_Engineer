#!/usr/bin/env node

/**
 * LEO Artifact Validator
 *
 * SD: SD-FOUND-AGENTIC-CONTEXT-001 (Agentic Context Engineering v3.0)
 *
 * Purpose: Validates artifact references in PRDs and handoffs, ensuring:
 * - Referenced artifacts exist
 * - Artifact TTLs will survive EXEC duration
 * - Low-confidence artifacts are flagged for mandatory reads
 * - Contract references are valid
 *
 * Usage:
 *   node scripts/leo-artifact-validator.js <SD_ID>
 *   node scripts/leo-artifact-validator.js SD-FOUND-AGENTIC-CONTEXT-001
 *
 * Integration:
 *   Used by handoff.js during PLAN-TO-EXEC validation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_EXEC_DURATION_HOURS = 4; // Assume EXEC takes up to 4 hours
const MIN_ARTIFACT_TTL_HOURS = 2; // Minimum TTL for artifacts during EXEC

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ============================================================================
// Validator Class
// ============================================================================

class ArtifactValidator {
  constructor(sdId) {
    this.sdId = sdId;
    this.results = {
      valid: true,
      score: 100,
      errors: [],
      warnings: [],
      suggestions: [],
      artifacts: {
        total: 0,
        valid: 0,
        expired: 0,
        expiringSoon: 0,
        lowConfidence: 0
      },
      contracts: {
        total: 0,
        pending: 0,
        completed: 0,
        failed: 0
      },
      metadata: {}
    };
  }

  /**
   * Run full validation
   */
  async validate() {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║        Artifact Validator v1.0 - LEO Protocol           ║');
    console.log('║        Agentic Context Engineering v3.0                ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    console.log(`📋 Strategic Directive: ${this.sdId}\n`);

    try {
      // Step 1: Load SD and PRD
      await this.loadSDAndPRD();

      // Step 2: Validate artifact references
      await this.validateArtifactReferences();

      // Step 3: Validate artifact TTLs
      await this.validateArtifactTTLs();

      // Step 4: Check confidence levels
      await this.validateConfidenceLevels();

      // Step 5: Validate task contracts
      await this.validateTaskContracts();

      // Step 6: Check for orphaned artifacts
      await this.checkOrphanedArtifacts();

      // Display results
      this.displayResults();

      return this.results;

    } catch (error) {
      console.error('❌ Validation error:', error.message);
      this.results.valid = false;
      this.results.errors.push(`Validation error: ${error.message}`);
      return this.results;
    }
  }

  /**
   * Load Strategic Directive and PRD
   */
  async loadSDAndPRD() {
    console.log('1️⃣  Loading SD and PRD...');

    // Load SD
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, uuid_id, title, current_phase, status, category, sd_type')
      .eq('id', this.sdId)
      .single();

    if (sdError || !sd) {
      throw new Error(`SD not found: ${this.sdId}`);
    }

    this.results.metadata.sd = sd;
    console.log(`   ✅ SD: ${sd.title}`);
    console.log(`   Phase: ${sd.current_phase} | Status: ${sd.status}`);

    // Load PRD
    const { data: prd, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('id, title, status, phase, metadata')
      .eq('directive_id', this.sdId)
      .single();

    if (prdError || !prd) {
      this.results.warnings.push('No PRD found for this SD');
      console.log('   ⚠️  No PRD found');
    } else {
      this.results.metadata.prd = prd;
      console.log(`   ✅ PRD: ${prd.title}`);
    }
  }

  /**
   * Validate artifact references in PRD metadata
   */
  async validateArtifactReferences() {
    console.log('\n2️⃣  Validating artifact references...');

    // Get all artifacts for this SD
    const { data: artifacts, error } = await supabase
      .from('agent_artifacts')
      .select('id, type, summary, confidence, token_count, expires_at, created_at, source_tool')
      .eq('sd_id', this.sdId);

    if (error) {
      this.results.warnings.push(`Could not load artifacts: ${error.message}`);
      return;
    }

    this.results.artifacts.total = artifacts?.length || 0;
    console.log(`   Found ${this.results.artifacts.total} artifacts for SD`);

    if (!artifacts || artifacts.length === 0) {
      console.log('   ℹ️  No artifacts to validate');
      return;
    }

    // Validate each artifact exists and is accessible
    for (const artifact of artifacts) {
      const now = new Date();
      const expiresAt = artifact.expires_at ? new Date(artifact.expires_at) : null;

      if (expiresAt && expiresAt < now) {
        this.results.artifacts.expired++;
        this.results.warnings.push(`Expired artifact: ${artifact.id} (${artifact.type})`);
      } else {
        this.results.artifacts.valid++;
      }
    }

    console.log(`   ✅ Valid: ${this.results.artifacts.valid}`);
    if (this.results.artifacts.expired > 0) {
      console.log(`   ⚠️  Expired: ${this.results.artifacts.expired}`);
    }
  }

  /**
   * Validate artifact TTLs will survive EXEC duration
   */
  async validateArtifactTTLs() {
    console.log('\n3️⃣  Validating artifact TTLs for EXEC duration...');

    const { data: artifacts, error } = await supabase
      .from('agent_artifacts')
      .select('id, type, summary, expires_at')
      .eq('sd_id', this.sdId)
      .not('expires_at', 'is', null);

    if (error || !artifacts || artifacts.length === 0) {
      console.log('   ℹ️  No artifacts with TTLs to check');
      return;
    }

    const now = new Date();
    const execEndTime = new Date(now.getTime() + DEFAULT_EXEC_DURATION_HOURS * 60 * 60 * 1000);

    for (const artifact of artifacts) {
      const expiresAt = new Date(artifact.expires_at);

      if (expiresAt < execEndTime) {
        this.results.artifacts.expiringSoon++;
        const hoursRemaining = Math.round((expiresAt - now) / (60 * 60 * 1000) * 10) / 10;

        if (hoursRemaining < MIN_ARTIFACT_TTL_HOURS) {
          this.results.errors.push(`Artifact expires too soon: ${artifact.id} (${hoursRemaining}h remaining)`);
          this.results.valid = false;
          this.results.score -= 10;
        } else {
          this.results.warnings.push(`Artifact expires during EXEC: ${artifact.id} (${hoursRemaining}h remaining)`);
          this.results.score -= 3;
        }
      }
    }

    if (this.results.artifacts.expiringSoon > 0) {
      console.log(`   ⚠️  ${this.results.artifacts.expiringSoon} artifacts expire during EXEC window`);
      this.results.suggestions.push('Consider extending artifact TTLs before EXEC phase');
    } else {
      console.log('   ✅ All artifact TTLs will survive EXEC duration');
    }
  }

  /**
   * Validate confidence levels - flag low confidence artifacts
   */
  async validateConfidenceLevels() {
    console.log('\n4️⃣  Validating artifact confidence levels...');

    const { data: artifacts, error } = await supabase
      .from('agent_artifacts')
      .select('id, type, summary, confidence, token_count')
      .eq('sd_id', this.sdId);

    if (error || !artifacts || artifacts.length === 0) {
      console.log('   ℹ️  No artifacts to check');
      return;
    }

    const byConfidence = {
      HIGH: [],
      MEDIUM: [],
      LOW: []
    };

    for (const artifact of artifacts) {
      const confidence = artifact.confidence || 'HIGH';
      byConfidence[confidence] = byConfidence[confidence] || [];
      byConfidence[confidence].push(artifact);
    }

    this.results.artifacts.lowConfidence = (byConfidence.LOW || []).length;

    console.log(`   HIGH confidence: ${byConfidence.HIGH?.length || 0}`);
    console.log(`   MEDIUM confidence: ${byConfidence.MEDIUM?.length || 0}`);
    console.log(`   LOW confidence: ${byConfidence.LOW?.length || 0}`);

    if (byConfidence.LOW && byConfidence.LOW.length > 0) {
      this.results.warnings.push(`${byConfidence.LOW.length} artifacts have LOW confidence - must read before acting`);
      byConfidence.LOW.forEach(a => {
        this.results.suggestions.push(`Read low-confidence artifact: ${a.id} (${a.type})`);
      });
    }

    if (byConfidence.MEDIUM && byConfidence.MEDIUM.length > 3) {
      this.results.suggestions.push('Consider reading MEDIUM confidence artifacts for clarity');
    }
  }

  /**
   * Validate task contracts
   */
  async validateTaskContracts() {
    console.log('\n5️⃣  Validating task contracts...');

    const { data: contracts, error } = await supabase
      .from('agent_task_contracts')
      .select('id, parent_agent, target_agent, objective, status, input_artifacts')
      .eq('sd_id', this.sdId);

    if (error) {
      this.results.warnings.push(`Could not load contracts: ${error.message}`);
      return;
    }

    if (!contracts || contracts.length === 0) {
      console.log('   ℹ️  No task contracts for this SD');
      return;
    }

    this.results.contracts.total = contracts.length;

    for (const contract of contracts) {
      switch (contract.status) {
        case 'pending':
          this.results.contracts.pending++;
          break;
        case 'completed':
          this.results.contracts.completed++;
          break;
        case 'failed':
        case 'cancelled':
          this.results.contracts.failed++;
          break;
      }

      // Validate input artifact references
      if (contract.input_artifacts && contract.input_artifacts.length > 0) {
        const { data: inputArtifacts, error: artifactError } = await supabase
          .from('agent_artifacts')
          .select('id')
          .in('id', contract.input_artifacts);

        if (artifactError || !inputArtifacts) {
          this.results.errors.push(`Contract ${contract.id}: could not validate input artifacts`);
        } else if (inputArtifacts.length !== contract.input_artifacts.length) {
          this.results.errors.push(`Contract ${contract.id}: missing ${contract.input_artifacts.length - inputArtifacts.length} input artifacts`);
          this.results.valid = false;
          this.results.score -= 10;
        }
      }
    }

    console.log(`   Total contracts: ${this.results.contracts.total}`);
    console.log(`   ✅ Completed: ${this.results.contracts.completed}`);
    console.log(`   ⏳ Pending: ${this.results.contracts.pending}`);
    if (this.results.contracts.failed > 0) {
      console.log(`   ❌ Failed: ${this.results.contracts.failed}`);
    }

    if (this.results.contracts.pending > 0) {
      this.results.warnings.push(`${this.results.contracts.pending} task contracts still pending`);
    }

    if (this.results.contracts.failed > 0) {
      this.results.warnings.push(`${this.results.contracts.failed} task contracts failed`);
    }
  }

  /**
   * Check for orphaned artifacts (no SD reference)
   */
  async checkOrphanedArtifacts() {
    console.log('\n6️⃣  Checking for orphaned artifacts...');

    const { data: orphaned, error } = await supabase
      .from('agent_artifacts')
      .select('id, type, created_at, token_count')
      .is('sd_id', null)
      .limit(10);

    if (error) {
      console.log('   ⚠️  Could not check for orphaned artifacts');
      return;
    }

    if (orphaned && orphaned.length > 0) {
      const totalTokens = orphaned.reduce((sum, a) => sum + (a.token_count || 0), 0);
      console.log(`   ⚠️  Found ${orphaned.length}+ orphaned artifacts (${totalTokens} tokens)`);
      this.results.suggestions.push('Consider running cleanup for orphaned artifacts');
    } else {
      console.log('   ✅ No orphaned artifacts found');
    }
  }

  /**
   * Display results
   */
  displayResults() {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 ARTIFACT VALIDATION RESULTS');
    console.log('═'.repeat(60));

    // Overall status
    if (this.results.valid) {
      console.log(`\n✅ VALIDATION PASSED (Score: ${this.results.score}%)`);
    } else {
      console.log(`\n❌ VALIDATION FAILED (Score: ${this.results.score}%)`);
    }

    // Errors
    if (this.results.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      this.results.errors.forEach(e => console.log(`   - ${e}`));
    }

    // Warnings
    if (this.results.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      this.results.warnings.forEach(w => console.log(`   - ${w}`));
    }

    // Suggestions
    if (this.results.suggestions.length > 0) {
      console.log('\n💡 SUGGESTIONS:');
      this.results.suggestions.forEach(s => console.log(`   - ${s}`));
    }

    // Summary stats
    console.log('\n📈 SUMMARY:');
    console.log(`   Artifacts: ${this.results.artifacts.valid}/${this.results.artifacts.total} valid`);
    console.log(`   Contracts: ${this.results.contracts.completed}/${this.results.contracts.total} completed`);
    console.log(`   Low confidence: ${this.results.artifacts.lowConfidence}`);
    console.log(`   Expiring soon: ${this.results.artifacts.expiringSoon}`);

    console.log('\n' + '═'.repeat(60) + '\n');
  }
}

// ============================================================================
// Helper Functions for Integration
// ============================================================================

/**
 * Validate artifacts for a given SD (for use by handoff.js)
 *
 * @param {string} sdId - The SD ID to validate
 * @returns {Promise<{valid: boolean, score: number, errors: string[], warnings: string[]}>}
 */
export async function validateArtifactsForHandoff(sdId) {
  const validator = new ArtifactValidator(sdId);
  return await validator.validate();
}

/**
 * Extend artifact TTLs before EXEC phase
 *
 * @param {string} sdId - The SD ID
 * @param {number} additionalHours - Hours to add to TTL
 * @returns {Promise<{extended: number}>}
 */
export async function extendArtifactTTLs(sdId, additionalHours = 4) {
  const { data, error } = await supabase
    .from('agent_artifacts')
    .update({
      expires_at: supabase.raw(`expires_at + interval '${additionalHours} hours'`)
    })
    .eq('sd_id', sdId)
    .not('expires_at', 'is', null)
    .select('id');

  if (error) {
    throw new Error(`Failed to extend TTLs: ${error.message}`);
  }

  return { extended: data?.length || 0 };
}

/**
 * Get artifact summary for an SD
 *
 * @param {string} sdId - The SD ID
 * @returns {Promise<Object>}
 */
export async function getArtifactSummary(sdId) {
  const { data, error } = await supabase
    .from('agent_artifacts')
    .select('id, type, source_tool, token_count, confidence')
    .eq('sd_id', sdId);

  if (error) {
    throw new Error(`Failed to get summary: ${error.message}`);
  }

  const summary = {
    total: data?.length || 0,
    totalTokens: 0,
    byType: {},
    byTool: {},
    byConfidence: { HIGH: 0, MEDIUM: 0, LOW: 0 }
  };

  if (data) {
    data.forEach(a => {
      summary.totalTokens += a.token_count || 0;
      summary.byType[a.type] = (summary.byType[a.type] || 0) + 1;
      summary.byTool[a.source_tool] = (summary.byTool[a.source_tool] || 0) + 1;
      summary.byConfidence[a.confidence] = (summary.byConfidence[a.confidence] || 0) + 1;
    });
  }

  return summary;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node scripts/leo-artifact-validator.js <SD_ID>');
    console.log('');
    console.log('Example:');
    console.log('  node scripts/leo-artifact-validator.js SD-FOUND-AGENTIC-CONTEXT-001');
    process.exit(1);
  }

  const sdId = args[0];
  const validator = new ArtifactValidator(sdId);
  const results = await validator.validate();

  process.exit(results.valid ? 0 : 1);
}

// Run if called directly
const isMainModule = process.argv[1] && process.argv[1].includes('leo-artifact-validator');
if (isMainModule) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { ArtifactValidator };
export default {
  ArtifactValidator,
  validateArtifactsForHandoff,
  extendArtifactTTLs,
  getArtifactSummary
};
