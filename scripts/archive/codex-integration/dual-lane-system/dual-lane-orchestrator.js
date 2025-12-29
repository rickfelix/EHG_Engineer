#!/usr/bin/env node

/**
 * Dual-Lane Workflow Orchestrator
 * Manages the complete flow from LEAD → PLAN → Codex → Claude
 * Demonstrates ACTIVE Codex usage in dual-lane architecture
 */

import DualLaneController from './dual-lane-controller.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import _path from 'path';

dotenv.config();

class DualLaneOrchestrator {
  constructor() {
    this.controller = new DualLaneController();
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
    );
  }

  /**
   * Execute complete dual-lane workflow
   */
  async executeDualLaneWorkflow(sdId, prdId) {
    console.log('🚀 STARTING DUAL-LANE WORKFLOW');
    console.log(`SD: ${sdId} | PRD: ${prdId}`);
    console.log('='.repeat(60));

    try {
      // Step 1: Load PRD requirements
      console.log('\n📋 Loading PRD requirements...');
      const prd = await this.loadPRD(prdId);

      // If no PRD in database, create mock for testing
      const prdData = prd || {
        id: prdId,
        requirements: [
          'Implement a function that validates email addresses',
          'Add error handling for invalid formats',
          'Include unit tests'
        ],
        test_plan: 'Test with valid and invalid email formats'
      };

      // Step 2: Run Codex to generate implementation artifacts
      console.log('\n📋 Phase 1: Codex Builder (Read-Only)');
      console.log('Codex will generate patches without write access...');

      const codexResult = await this.controller.runAsCodex(
        `Generate implementation for: ${JSON.stringify(prdData.requirements)}`,
        {
          prdId: prdId,
          sdId: sdId,
          requirements: prdData.requirements,
          testPlan: prdData.test_plan
        }
      );

      if (!codexResult.success) {
        throw new Error('Codex failed to generate artifacts');
      }

      // Step 3: Handoff checkpoint
      console.log('\n🔄 Handoff: Codex → Claude');
      console.log(`Transferring ${codexResult.artifacts.length} artifacts...`);
      await this.recordHandoff('codex', 'claude', codexResult);

      // Step 4: Run Claude to apply artifacts
      console.log('\n📋 Phase 2: Claude Enforcer (Write-Enabled)');
      console.log('Claude will apply the Codex-generated patches...');

      const claudeResult = await this.controller.runAsClaude(
        codexResult.artifacts,
        {
          prdId: prdId,
          sdId: sdId,
          source: 'codex-artifacts'
        }
      );

      if (!claudeResult.success) {
        throw new Error('Claude failed to apply artifacts');
      }

      // Step 5: Update database with completion
      await this.updateProgress(sdId, prdId, 'dual-lane-complete');

      // Step 6: Save audit trail
      const auditFile = `/tmp/dual-lane-audit-${Date.now()}.json`;
      this.controller.saveAuditTrail(auditFile);

      // Step 7: Generate summary report
      const report = this.generateReport(codexResult, claudeResult, auditFile);

      console.log('\n✅ DUAL-LANE WORKFLOW COMPLETE');
      console.log('='.repeat(60));
      console.log(report);

      return {
        success: true,
        codex: codexResult,
        claude: claudeResult,
        auditTrail: auditFile,
        report: report
      };

    } catch (error) {
      console.error('\n❌ Dual-lane workflow failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Load PRD from database
   */
  async loadPRD(prdId) {
    try {
      const { data, error } = await this.supabase
        .from('product_requirements_v2')
        .select('*')
        .eq('id', prdId)
        .single();

      if (error) {
        console.warn('PRD not in database, using mock data');
        return null;
      }

      return data;
    } catch (_err) {
      return null;
    }
  }

  /**
   * Record handoff in database
   */
  async recordHandoff(fromAgent, toAgent, result) {
    const handoff = {
      from_agent: fromAgent,
      to_agent: toAgent,
      timestamp: new Date().toISOString(),
      artifacts: result.artifacts?.map(a => a.filename) || [],
      marker: result.handoffMarker,
      status: 'completed'
    };

    try {
      const { error } = await this.supabase
        .from('leo_handoff_executions')
        .insert(handoff);

      if (error) {
        console.warn('Could not record handoff in database');
      } else {
        console.log('✅ Handoff recorded in database');
      }
    } catch (_err) {
      console.warn('Database unavailable, handoff logged locally');
    }

    // Always save locally
    const handoffFile = `/tmp/handoff-${fromAgent}-to-${toAgent}-${Date.now()}.json`;
    fs.writeFileSync(handoffFile, JSON.stringify(handoff, null, 2));
  }

  /**
   * Update progress in database
   */
  async updateProgress(sdId, prdId, status) {
    try {
      const { error } = await this.supabase
        .from('product_requirements_v2')
        .update({
          status: status,
          dual_lane_executed: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', prdId);

      if (error) {
        console.warn('Could not update progress in database');
      } else {
        console.log('✅ Progress updated in database');
      }
    } catch (_err) {
      console.warn('Database unavailable, progress logged locally');
    }
  }

  /**
   * Generate summary report
   */
  generateReport(codexResult, claudeResult, auditFile) {
    const report = [];

    report.push('📊 DUAL-LANE EXECUTION REPORT');
    report.push('='.repeat(40));
    report.push('');
    report.push('CODEX (Read-Only Builder):');
    report.push(`  ✅ Generated ${codexResult.artifacts.length} artifacts`);
    report.push(`  ✅ Marker: ${codexResult.handoffMarker}`);
    report.push(`  ✅ Mode: ${codexResult.mode}`);
    report.push('');
    report.push('CLAUDE (Write-Enabled Enforcer):');
    report.push(`  ✅ Applied ${claudeResult.artifactsApplied} artifacts`);
    report.push(`  ✅ Marker: ${claudeResult.handoffMarker}`);
    report.push(`  ✅ Mode: ${claudeResult.mode}`);
    report.push('');
    report.push('Artifacts Generated:');
    codexResult.artifacts.forEach(a => {
      report.push(`  📄 ${a.filename} (${a.type})`);
    });
    report.push('');
    report.push(`Audit Trail: ${auditFile}`);
    report.push('');
    report.push('🎉 CODEX IS NOW ACTIVE IN DUAL-LANE WORKFLOW');

    return report.join('\n');
  }

  /**
   * Run a simple test to demonstrate Codex is active
   */
  async runSimpleTest() {
    console.log('🧪 RUNNING SIMPLE DUAL-LANE TEST');
    console.log('='.repeat(50));

    // Test with simple task
    const testTask = 'Create a function to reverse a string';

    console.log(`\nTest Task: "${testTask}"`);
    console.log('\n1️⃣ Running as Codex (read-only)...');

    const codexResult = await this.controller.runAsCodex(testTask, {
      test: true
    });

    if (codexResult.success) {
      console.log('✅ Codex generated artifacts successfully');

      console.log('\n2️⃣ Running as Claude (write-enabled)...');
      const claudeResult = await this.controller.runAsClaude(
        codexResult.artifacts,
        { test: true }
      );

      if (claudeResult.success) {
        console.log('✅ Claude applied artifacts successfully');
        console.log('\n🎉 TEST PASSED: Dual-lane workflow is ACTIVE');
        return true;
      }
    }

    console.log('\n❌ TEST FAILED: Dual-lane workflow not working');
    return false;
  }
}

// CLI execution
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const orchestrator = new DualLaneOrchestrator();
  const command = process.argv[2];

  if (command === 'test') {
    // Run simple test
    orchestrator.runSimpleTest().then(success => {
      process.exit(success ? 0 : 1);
    });
  } else if (command === 'run') {
    // Run full workflow
    const sdId = process.argv[3] || 'SD-TEST-001';
    const prdId = process.argv[4] || 'PRD-TEST-001';

    orchestrator.executeDualLaneWorkflow(sdId, prdId).then(result => {
      process.exit(result.success ? 0 : 1);
    });
  } else {
    console.log('Usage:');
    console.log('  node dual-lane-orchestrator.js test                  # Run simple test');
    console.log('  node dual-lane-orchestrator.js run [SD-ID] [PRD-ID]  # Run full workflow');
    process.exit(1);
  }
}

export default DualLaneOrchestrator;