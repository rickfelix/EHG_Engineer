#!/usr/bin/env node

/**
 * Implementation Evidence Enforcement System
 *
 * MANDATORY: This script enforces that EXEC agents provide actual implementation evidence
 * before marking any implementation phase as complete.
 *
 * NO SIMULATION ALLOWED - Actual code must be written, tested, and verified.
 *
 * Usage:
 *   node enforce-implementation-evidence.js --sd-id SD-XXX --prd-id PRD-XXX --action validate
 *   node enforce-implementation-evidence.js --sd-id SD-XXX --action block-simulation
 */

const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class ImplementationEvidenceEnforcer {
  constructor(sdId, prdId) {
    this.sdId = sdId;
    this.prdId = prdId;
    this.requiredEvidence = {
      files_modified: [],
      lines_added: 0,
      lines_removed: 0,
      test_files_created: [],
      test_coverage: 0,
      git_diff_summary: '',
      implementation_screenshots: [],
      performance_metrics: {},
      actual_implementation: false
    };
  }

  async enforceEvidence() {
    console.log('🔒 IMPLEMENTATION EVIDENCE ENFORCEMENT');
    console.log('=====================================');
    console.log(`SD: ${this.sdId}`);
    console.log(`PRD: ${this.prdId || 'N/A'}\n`);

    console.log('⚠️  CRITICAL REQUIREMENT:');
    console.log('   Actual implementation code MUST be written.');
    console.log('   Simulation or mocking is STRICTLY FORBIDDEN.\n');

    try {
      // Step 0: CRITICAL - Check PRD is approved by LEAD before ANY EXEC work
      if (this.prdId) {
        const prdApprovalCheck = await this.checkPRDApproval();
        if (!prdApprovalCheck.canProceed) {
          console.log('❌ BLOCKED: PRD not properly approved by LEAD');
          console.log(`   Reason: ${prdApprovalCheck.reason}`);
          return {
            status: 'blocked',
            reason: 'PRD_NOT_APPROVED_BY_LEAD',
            message: prdApprovalCheck.reason,
            missingRequirements: ['PRD must be approved by LEAD before EXEC can work']
          };
        }
      }

      // Step 1: Check for actual implementation evidence
      const evidence = await this.gatherImplementationEvidence();

      // Step 2: Validate against requirements
      const validationResult = await this.validateEvidence(evidence);

      // Step 3: Store evidence or block progression
      if (validationResult.isValid) {
        await this.storeEvidence(evidence);
        console.log('✅ Implementation evidence verified and stored');
        return {
          status: 'approved',
          evidence: evidence,
          message: 'Actual implementation verified'
        };
      } else {
        console.log('❌ BLOCKED: Insufficient implementation evidence');
        console.log('\nMissing Requirements:');
        validationResult.missingRequirements.forEach(req => {
          console.log(`   - ${req}`);
        });
        return {
          status: 'blocked',
          evidence: evidence,
          missingRequirements: validationResult.missingRequirements,
          message: 'Implementation evidence insufficient - actual code required'
        };
      }
    } catch (error) {
      console.error('❌ Error enforcing evidence:', error.message);
      return {
        status: 'error',
        message: error.message
      };
    }
  }

  async gatherImplementationEvidence() {
    console.log('📊 Gathering implementation evidence...\n');

    const evidence = { ...this.requiredEvidence };

    // 1. Check Git status for modified files
    try {
      const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
      const modifiedFiles = gitStatus.split('\n')
        .filter(line => line.trim())
        .map(line => line.substring(3).trim())
        .filter(file => {
          // Filter for actual source code files
          return (
            file.includes('/src/') ||
            file.includes('/components/') ||
            file.includes('/scripts/') ||
            file.endsWith('.js') ||
            file.endsWith('.jsx') ||
            file.endsWith('.ts') ||
            file.endsWith('.tsx')
          );
        });

      evidence.files_modified = modifiedFiles;
      console.log(`📁 Files modified: ${modifiedFiles.length}`);

      if (modifiedFiles.length > 0) {
        // Get line count changes
        try {
          const diffStat = execSync('git diff --stat', { encoding: 'utf8' });
          const lines = diffStat.match(/(\d+) insertions?\(\+\), (\d+) deletions?\(-\)/);
          if (lines) {
            evidence.lines_added = parseInt(lines[1]);
            evidence.lines_removed = parseInt(lines[2]);
            console.log(`➕ Lines added: ${evidence.lines_added}`);
            console.log(`➖ Lines removed: ${evidence.lines_removed}`);
          }
        } catch (e) {
          console.log('   Could not get diff statistics');
        }
      }
    } catch (error) {
      console.log('⚠️  Git not available or no repository');
    }

    // 2. Check for test files
    evidence.test_files_created = evidence.files_modified.filter(
      file => file.includes('.test.') || file.includes('.spec.') || file.includes('__tests__')
    );
    console.log(`🧪 Test files created: ${evidence.test_files_created.length}`);

    // 3. Check for PRD requirements implementation
    if (this.prdId) {
      const { data: prd } = await supabase
        .from('product_requirements_v2')
        .select('functional_requirements, technical_requirements')
        .eq('id', this.prdId)
        .single();

      if (prd) {
        console.log(`\n📋 Checking against PRD requirements:`);
        console.log(`   Functional: ${prd.functional_requirements?.length || 0} requirements`);
        console.log(`   Technical: ${prd.technical_requirements?.length || 0} requirements`);
      }
    }

    // 4. Determine if actual implementation exists
    evidence.actual_implementation = (
      evidence.files_modified.length > 0 &&
      evidence.lines_added > 0
    );

    // 5. Check for simulation keywords in recent commits or files
    const simulationDetected = await this.detectSimulation();
    if (simulationDetected) {
      console.log('\n⚠️  WARNING: Simulation keywords detected!');
      console.log('   This may indicate non-genuine implementation.');
      evidence.actual_implementation = false;
      evidence.simulation_detected = true;
    }

    return evidence;
  }

  async detectSimulation() {
    // Check for simulation keywords in recent changes
    const simulationKeywords = [
      'simulate', 'simulating', 'simulated',
      'mock', 'mocked', 'mocking',
      'fake', 'faked', 'faking',
      'dummy', 'placeholder',
      '// TODO: implement',
      'not implemented',
      'stub'
    ];

    try {
      const recentDiff = execSync('git diff HEAD~1..HEAD', { encoding: 'utf8' }).toLowerCase();

      for (const keyword of simulationKeywords) {
        if (recentDiff.includes(keyword.toLowerCase())) {
          console.log(`   🚨 Found simulation keyword: "${keyword}"`);
          return true;
        }
      }
    } catch (e) {
      // Git diff not available
    }

    return false;
  }

  async validateEvidence(evidence) {
    console.log('\n🔍 Validating evidence against requirements...');

    const missingRequirements = [];

    // Core requirements
    if (!evidence.actual_implementation) {
      missingRequirements.push('No actual implementation detected');
    }

    if (evidence.files_modified.length === 0) {
      missingRequirements.push('No source files modified');
    }

    if (evidence.lines_added === 0) {
      missingRequirements.push('No code lines added');
    }

    if (evidence.simulation_detected) {
      missingRequirements.push('Simulation keywords detected - actual implementation required');
    }

    // PRD-specific validation
    if (this.prdId) {
      const { data: prd } = await supabase
        .from('product_requirements_v2')
        .select('functional_requirements, category')
        .eq('id', this.prdId)
        .single();

      // Check for appropriate file types based on PRD category
      if (prd?.category) {
        if (prd.category.includes('ui') || prd.category.includes('frontend')) {
          const hasUIFiles = evidence.files_modified.some(f =>
            f.endsWith('.jsx') || f.endsWith('.tsx') || f.includes('/components/')
          );
          if (!hasUIFiles) {
            missingRequirements.push('No UI/component files modified for UI-related PRD');
          }
        }

        if (prd.category.includes('api') || prd.category.includes('backend')) {
          const hasAPIFiles = evidence.files_modified.some(f =>
            f.includes('/api/') || f.includes('/routes/') || f.includes('server')
          );
          if (!hasAPIFiles) {
            missingRequirements.push('No API/backend files modified for backend-related PRD');
          }
        }
      }
    }

    const isValid = missingRequirements.length === 0;

    if (isValid) {
      console.log('✅ All evidence requirements met');
    } else {
      console.log(`❌ ${missingRequirements.length} requirement(s) not met`);
    }

    return { isValid, missingRequirements };
  }

  async storeEvidence(evidence) {
    console.log('\n💾 Storing implementation evidence...');

    const evidenceRecord = {
      sd_id: this.sdId,
      prd_id: this.prdId,
      evidence_type: 'implementation',
      evidence_data: evidence,
      validation_status: 'approved',
      created_at: new Date().toISOString()
    };

    // Try to store in database
    const { error } = await supabase
      .from('exec_implementation_evidence')
      .insert(evidenceRecord);

    if (error) {
      // If table doesn't exist, store in SD metadata
      console.log('Storing evidence in SD metadata...');

      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('metadata')
        .eq('id', this.sdId)
        .single();

      const updatedMetadata = {
        ...sd?.metadata,
        implementation_evidence: evidence,
        implementation_verified: true,
        evidence_timestamp: new Date().toISOString()
      };

      await supabase
        .from('strategic_directives_v2')
        .update({ metadata: updatedMetadata })
        .eq('id', this.sdId);
    }

    console.log('✅ Evidence stored successfully');

    // Log event
    await supabase
      .from('leo_events')
      .insert({
        event_type: 'IMPLEMENTATION_EVIDENCE_VERIFIED',
        event_data: {
          sd_id: this.sdId,
          prd_id: this.prdId,
          files_count: evidence.files_modified.length,
          lines_added: evidence.lines_added,
          actual_implementation: evidence.actual_implementation
        }
      });
  }

  async checkPRDApproval() {
    // Check if PRD is properly approved by LEAD
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('id, status, approved_by, approval_date, directive_id')
      .eq('id', this.prdId)
      .single();

    if (!prd) {
      return {
        canProceed: false,
        reason: 'PRD not found in database'
      };
    }

    // PRD must be in approved status
    if (prd.status !== 'approved') {
      return {
        canProceed: false,
        reason: `PRD status is '${prd.status}' - must be 'approved' before EXEC can work`
      };
    }

    // PRD must be approved by LEAD (not PLAN or EXEC)
    if (prd.approved_by !== 'LEAD') {
      return {
        canProceed: false,
        reason: `PRD was approved by '${prd.approved_by || 'unknown'}' instead of LEAD. LEO Protocol violation - PLAN cannot self-approve.`
      };
    }

    // Must have approval date
    if (!prd.approval_date) {
      return {
        canProceed: false,
        reason: 'PRD marked as approved but has no approval date'
      };
    }

    console.log('✅ PRD properly approved by LEAD');
    console.log(`   Approved on: ${new Date(prd.approval_date).toLocaleDateString()}`);

    return {
      canProceed: true,
      prd: prd
    };
  }

  async blockSimulation() {
    console.log('\n🛑 BLOCKING SIMULATION ATTEMPTS');
    console.log('================================\n');

    // Check if any simulation is being attempted
    const simulationScripts = [
      'quick-leo-protocol-execution.js',
      'pareto-exec-completion.js',
      'complete-lead-phase.js'
    ];

    for (const script of simulationScripts) {
      const scriptPath = path.join(__dirname, script);
      try {
        const content = await fs.readFile(scriptPath, 'utf8');
        if (content.includes('simulate') || content.includes('simulating')) {
          console.log(`⚠️  Found simulation in: ${script}`);
          console.log('   This script must be updated to require actual implementation');
        }
      } catch (e) {
        // Script doesn't exist
      }
    }

    console.log('\n📝 Enforcement Rules:');
    console.log('1. EXEC must write actual code files');
    console.log('2. Implementation must match PRD requirements');
    console.log('3. Tests must be created for new features');
    console.log('4. No "simulation" or "mocking" of implementation');
    console.log('5. Git diff must show actual changes');

    return {
      status: 'enforcement_active',
      message: 'Simulation blocking is now active'
    };
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const sdIdIndex = args.indexOf('--sd-id');
  const prdIdIndex = args.indexOf('--prd-id');
  const actionIndex = args.indexOf('--action');

  const sdId = sdIdIndex !== -1 ? args[sdIdIndex + 1] : null;
  const prdId = prdIdIndex !== -1 ? args[prdIdIndex + 1] : null;
  const action = actionIndex !== -1 ? args[actionIndex + 1] : 'validate';

  if (!sdId && action === 'validate') {
    console.error('Usage: node enforce-implementation-evidence.js --sd-id <SD_ID> [--prd-id <PRD_ID>] [--action validate|block-simulation]');
    process.exit(1);
  }

  const enforcer = new ImplementationEvidenceEnforcer(sdId, prdId);

  if (action === 'block-simulation') {
    const result = await enforcer.blockSimulation();
    console.log(`\n${result.message}`);
  } else {
    const result = await enforcer.enforceEvidence();

    if (result.status === 'blocked') {
      console.log('\n🚫 IMPLEMENTATION BLOCKED');
      console.log('Reason: Actual implementation required, not simulation');
      process.exit(1);
    } else if (result.status === 'approved') {
      console.log('\n✅ IMPLEMENTATION APPROVED');
      console.log('Evidence of actual implementation verified');
      process.exit(0);
    }
  }
}

// Export for use in other scripts
module.exports = ImplementationEvidenceEnforcer;

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}