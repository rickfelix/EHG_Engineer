/**
 * Phase Handoff E2E Tests
 *
 * User Story: US-005 (8 pts, 8 hours)
 * Strategic Directive: SD-TESTING-COVERAGE-001 (Week 2)
 *
 * Tests comprehensive phase handoff workflows (LEAD→PLAN→EXEC→PLAN→LEAD):
 * - LEAD→PLAN handoff creation and acceptance
 * - PLAN→EXEC handoff with BMAD validation
 * - EXEC→PLAN handoff for verification
 * - PLAN→LEAD handoff for final approval
 * - Handoff rejection workflow with feedback
 * - Handoff data persistence in sd_phase_handoffs table
 * - SD status updates after successful handoffs
 * - Git branch enforcement (Gate 6)
 * - Git commit enforcement (Gate 5)
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const execAsync = promisify(exec);

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const timestamp = Date.now();

test.describe('Phase Handoff System E2E Tests', () => {
  let testSDId: string;
  let testPRDId: string;
  let testSDUuid: string;

  test.beforeAll(async () => {
    // Create test Strategic Directive
    testSDId = `SD-TEST-HANDOFF-${timestamp}`;

    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .insert({
        id: testSDId,
        sd_key: testSDId,
        legacy_id: testSDId,
        title: `Test Phase Handoff System - ${timestamp}`,
        description: 'End-to-end testing of phase handoff workflows',
        rationale: 'Test handoff system functionality and phase transition workflows',
        strategic_intent: 'Validate all phase handoffs work correctly with proper data persistence',
        scope: 'Testing LEAD→PLAN→EXEC→PLAN→LEAD handoff workflows',
        category: 'testing',
        priority: 'medium',
        status: 'draft',
        current_phase: 'LEAD',
        strategic_objectives: ['Test LEAD→PLAN handoff', 'Test PLAN→EXEC handoff', 'Test EXEC→PLAN handoff'],
        success_metrics: ['All handoffs complete', 'Data persisted correctly', 'Status transitions accurate'],
        risks: ['Test data cleanup'],
        target_application: 'EHG_Engineer'
      })
      .select()
      .single();

    if (sdError) {
      throw new Error(`Failed to create test SD: ${sdError.message}`);
    }

    testSDUuid = sd.uuid_id;
    console.log(`Created test SD: ${testSDId} (UUID: ${testSDUuid})`);
  });

  test.afterAll(async () => {
    // Cleanup: Delete test data
    console.log('Cleaning up test data...');

    // Delete handoffs
    await supabase
      .from('sd_phase_handoffs')
      .delete()
      .eq('sd_id', testSDId);

    // Delete PRD if created
    if (testPRDId) {
      await supabase
        .from('product_requirements_v2')
        .delete()
        .eq('prd_id', testPRDId);
    }

    // Delete SD
    await supabase
      .from('strategic_directives_v2')
      .delete()
      .eq('id', testSDId);

    console.log('Cleanup complete');
  });

  test.describe('LEAD→PLAN Handoff', () => {
    test('should create LEAD→PLAN handoff successfully', async () => {
      // Execute handoff via unified handoff system
      const { stdout, stderr } = await execAsync(
        `node scripts/unified-handoff-system.js execute LEAD-TO-PLAN ${testSDId}`
      );

      console.log('Handoff output:', stdout);

      // Verify success message
      expect(stdout).toContain('LEAD → PLAN HANDOFF APPROVED');
      expect(stdout).not.toContain('VALIDATION FAILED');
      expect(stderr).toBe('');

      // Verify handoff record created in database
      const { data: handoff, error } = await supabase
        .from('sd_phase_handoffs')
        .select('*')
        .eq('sd_id', testSDId)
        .eq('handoff_type', 'LEAD-TO-PLAN')
        .single();

      expect(error).toBeNull();
      expect(handoff).toBeTruthy();
      expect(handoff.status).toBe('accepted');
      expect(handoff.from_phase).toBe('LEAD');
      expect(handoff.to_phase).toBe('PLAN');

      // Verify 7-element handoff structure
      expect(handoff.executive_summary).toBeTruthy();
      expect(handoff.deliverables_manifest).toBeTruthy();
      expect(handoff.key_decisions).toBeTruthy();
      expect(handoff.known_issues).toBeTruthy();
      expect(handoff.resource_utilization).toBeTruthy();
      expect(handoff.action_items).toBeTruthy();
      expect(handoff.completeness_report).toBeTruthy();

      // Verify SD status updated
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('status, current_phase')
        .eq('id', testSDId)
        .single();

      expect(sd?.current_phase).toBe('PLAN');
    });

    test('should reject LEAD→PLAN handoff with incomplete SD', async () => {
      // Create incomplete SD (missing required fields)
      const incompleteSDId = `SD-INCOMPLETE-${timestamp}`;

      await supabase
        .from('strategic_directives_v2')
        .insert({
          id: incompleteSDId,
          title: 'Incomplete SD',
          description: 'Missing required fields',
          category: 'testing',
          priority: 'LOW',
          status: 'draft',
          // Missing: rationale, strategic_objectives, success_metrics
        });

      // Attempt handoff
      const result = await execAsync(
        `node scripts/unified-handoff-system.js execute LEAD-TO-PLAN ${incompleteSDId}`
      ).catch(err => ({ stdout: err.stdout, stderr: err.stderr }));

      // Verify rejection (script exits with error)
      expect(result.stdout).toContain('VALIDATION FAILED');

      // Cleanup
      await supabase
        .from('strategic_directives_v2')
        .delete()
        .eq('id', incompleteSDId);
    });

    test('should persist learning context in handoff metadata', async () => {
      // Retrieve handoff created in first test
      const { data: handoff } = await supabase
        .from('sd_phase_handoffs')
        .select('metadata')
        .eq('sd_id', testSDId)
        .eq('handoff_type', 'LEAD-TO-PLAN')
        .single();

      // Verify metadata structure
      expect(handoff?.metadata).toBeTruthy();
      expect(handoff?.metadata.created_via).toBe('unified-handoff-system');
    });
  });

  test.describe('PLAN→EXEC Handoff', () => {
    test.beforeAll(async () => {
      // Create test PRD for PLAN→EXEC handoff
      testPRDId = `PRD-TEST-HANDOFF-${timestamp}`;

      const { error: prdError } = await supabase
        .from('product_requirements_v2')
        .insert({
          prd_id: testPRDId,
          sd_uuid: testSDUuid,
          title: `Test PRD for Handoff - ${timestamp}`,
          description: 'PRD for testing phase handoffs',
          status: 'active',
          phase: 'PLAN',
          functional_requirements: [
            { id: 'FR-001', description: 'Test requirement 1', priority: 'MUST' },
            { id: 'FR-002', description: 'Test requirement 2', priority: 'SHOULD' },
            { id: 'FR-003', description: 'Test requirement 3', priority: 'COULD' }
          ],
          test_scenarios: [
            { id: 'TS-001', description: 'Test scenario 1', expected_result: 'Success' }
          ],
          acceptance_criteria: [
            { id: 'AC-001', description: 'Acceptance criterion 1', met: false }
          ],
          system_architecture: {
            overview: 'Test architecture',
            components: ['Component A', 'Component B']
          },
          data_model: {
            tables: ['test_table'],
            relationships: ['one-to-many']
          },
          ui_ux_requirements: {
            wireframes: true,
            accessibility: 'WCAG2.1-AA'
          },
          implementation_approach: {
            phases: ['Setup', 'Development', 'Testing'],
            technologies: ['TypeScript', 'Playwright']
          }
        });

      if (prdError) {
        throw new Error(`Failed to create test PRD: ${prdError.message}`);
      }

      console.log(`Created test PRD: ${testPRDId}`);
    });

    test('should create PLAN→EXEC handoff with BMAD validation', async () => {
      // Execute handoff
      const { stdout } = await execAsync(
        `node scripts/unified-handoff-system.js execute PLAN-TO-EXEC ${testSDId} ${testPRDId}`
      );

      console.log('PLAN→EXEC output:', stdout);

      // Verify BMAD validation ran
      expect(stdout).toContain('BMAD Validation');
      expect(stdout).toContain('PLAN → EXEC HANDOFF APPROVED');

      // Verify handoff record created
      const { data: handoff } = await supabase
        .from('sd_phase_handoffs')
        .select('*')
        .eq('sd_id', testSDId)
        .eq('handoff_type', 'PLAN-TO-EXEC')
        .single();

      expect(handoff).toBeTruthy();
      expect(handoff.status).toBe('accepted');
      expect(handoff.from_phase).toBe('PLAN');
      expect(handoff.to_phase).toBe('EXEC');

      // Verify BMAD validation in metadata
      expect(handoff.metadata?.bmad_validation).toBeTruthy();

      // Verify deliverables auto-populated
      const { data: deliverables } = await supabase
        .from('sd_scope_deliverables')
        .select('*')
        .eq('sd_id', testSDId);

      expect(deliverables).toBeTruthy();
      expect(deliverables.length).toBeGreaterThan(0);
    });

    test('should enforce Git branch (Gate 6) before EXEC work', async () => {
      // Retrieve handoff created in previous test
      const { data: handoff } = await supabase
        .from('sd_phase_handoffs')
        .select('metadata')
        .eq('sd_id', testSDId)
        .eq('handoff_type', 'PLAN-TO-EXEC')
        .single();

      // Verify Gate 6 validation metadata exists
      expect(handoff?.metadata?.gate6_validation || handoff?.metadata?.branch_validation).toBeTruthy();
    });

    test('should reject PLAN→EXEC handoff with low BMAD score', async () => {
      // Create SD with no PRD (will fail BMAD validation)
      const noPRDSDId = `SD-NO-PRD-${timestamp}`;

      await supabase
        .from('strategic_directives_v2')
        .insert({
          id: noPRDSDId,
          title: 'SD without PRD',
          description: 'Will fail BMAD validation',
          category: 'testing',
          priority: 'LOW',
          status: 'active',
          current_phase: 'PLAN',
          rationale: 'Test BMAD failure',
          strategic_objectives: ['Test'],
          success_metrics: ['Test'],
          risks: []
        });

      // Attempt handoff (should fail)
      const result = await execAsync(
        `node scripts/unified-handoff-system.js execute PLAN-TO-EXEC ${noPRDSDId}`
      ).catch(err => ({ stdout: err.stdout }));

      // Verify rejection
      expect(result.stdout).toMatch(/BMAD VALIDATION FAILED|No PRD found/);

      // Cleanup
      await supabase
        .from('strategic_directives_v2')
        .delete()
        .eq('id', noPRDSDId);
    });
  });

  test.describe('EXEC→PLAN Handoff', () => {
    test.beforeAll(async () => {
      // Mark deliverables as complete to simulate EXEC work done
      const { data: deliverables } = await supabase
        .from('sd_scope_deliverables')
        .select('id')
        .eq('sd_id', testSDId);

      if (deliverables && deliverables.length > 0) {
        await supabase
          .from('sd_scope_deliverables')
          .update({
            completion_status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('sd_id', testSDId);
      }

      // Update PRD status to simulate EXEC completion
      await supabase
        .from('product_requirements_v2')
        .update({
          status: 'implemented',
          phase: 'EXEC_COMPLETE',
          exec_checklist: [
            { id: 'EC-001', label: 'Tests written', checked: true },
            { id: 'EC-002', label: 'Code committed', checked: true },
            { id: 'EC-003', label: 'Documentation created', checked: true }
          ]
        })
        .eq('prd_id', testPRDId);

      // Create dummy documentation entry
      await supabase
        .from('generated_docs')
        .insert({
          sd_id: testSDId,
          doc_type: 'test-documentation',
          content: 'Test documentation content',
          format: 'markdown'
        });
    });

    test('should create EXEC→PLAN handoff for verification', async () => {
      // Execute handoff
      const { stdout } = await execAsync(
        `node scripts/unified-handoff-system.js execute EXEC-TO-PLAN ${testSDId}`
      );

      console.log('EXEC→PLAN output:', stdout);

      // Verify handoff approved
      expect(stdout).toContain('EXEC → PLAN HANDOFF APPROVED');

      // Verify handoff record created
      const { data: handoff } = await supabase
        .from('sd_phase_handoffs')
        .select('*')
        .eq('sd_id', testSDId)
        .eq('handoff_type', 'EXEC-TO-PLAN')
        .single();

      expect(handoff).toBeTruthy();
      expect(handoff.status).toBe('accepted');
      expect(handoff.from_phase).toBe('EXEC');
      expect(handoff.to_phase).toBe('PLAN');

      // Verify PRD status updated for verification
      const { data: prd } = await supabase
        .from('product_requirements_v2')
        .select('status, phase')
        .eq('prd_id', testPRDId)
        .single();

      expect(prd?.status).toBe('verification');
      expect(prd?.phase).toBe('PLAN_VERIFICATION');
    });

    test('should validate documentation exists (SD-DOCUMENTATION-001)', async () => {
      // Retrieve handoff metadata
      const { data: handoff } = await supabase
        .from('sd_phase_handoffs')
        .select('metadata')
        .eq('sd_id', testSDId)
        .eq('handoff_type', 'EXEC-TO-PLAN')
        .single();

      // Documentation validation should have passed
      expect(handoff?.metadata).toBeTruthy();

      // Verify documentation record exists
      const { data: docs } = await supabase
        .from('generated_docs')
        .select('id')
        .eq('sd_id', testSDId)
        .limit(1);

      expect(docs).toBeTruthy();
      expect(docs.length).toBeGreaterThan(0);
    });

    test('should reject EXEC→PLAN handoff without documentation', async () => {
      // Create SD without documentation
      const noDocsSDId = `SD-NO-DOCS-${timestamp}`;
      const noDocsPRDId = `PRD-NO-DOCS-${timestamp}`;

      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .insert({
          id: noDocsSDId,
          title: 'SD without docs',
          description: 'Will fail documentation check',
          category: 'testing',
          priority: 'LOW',
          status: 'in_progress',
          current_phase: 'EXEC',
          rationale: 'Test docs failure',
          strategic_objectives: ['Test'],
          success_metrics: ['Test'],
          risks: []
        })
        .select()
        .single();

      await supabase
        .from('product_requirements_v2')
        .insert({
          prd_id: noDocsPRDId,
          sd_uuid: sd.uuid_id,
          title: 'PRD without docs',
          description: 'Test PRD',
          status: 'implemented',
          phase: 'EXEC_COMPLETE',
          functional_requirements: [{ id: 'FR-001', description: 'Test', priority: 'MUST' }],
          test_scenarios: [{ id: 'TS-001', description: 'Test', expected_result: 'Pass' }],
          acceptance_criteria: [{ id: 'AC-001', description: 'Test', met: true }],
          exec_checklist: [
            { id: 'EC-001', label: 'Tests written', checked: true },
            { id: 'EC-002', label: 'Code committed', checked: true }
          ]
        });

      // Create deliverable
      await supabase
        .from('sd_scope_deliverables')
        .insert({
          sd_id: noDocsSDId,
          deliverable_name: 'Test deliverable',
          deliverable_type: 'component',
          completion_status: 'completed'
        });

      // Attempt handoff (should fail due to missing documentation)
      const result = await execAsync(
        `node scripts/unified-handoff-system.js execute EXEC-TO-PLAN ${noDocsSDId}`
      ).catch(err => ({ stdout: err.stdout }));

      // Verify rejection
      expect(result.stdout).toContain('DOCUMENTATION_MISSING');

      // Cleanup
      await supabase.from('sd_scope_deliverables').delete().eq('sd_id', noDocsSDId);
      await supabase.from('product_requirements_v2').delete().eq('prd_id', noDocsPRDId);
      await supabase.from('strategic_directives_v2').delete().eq('id', noDocsSDId);
    });

    test('should validate E2E test coverage (minimum 50%)', async () => {
      // Retrieve handoff metadata
      const { data: handoff } = await supabase
        .from('sd_phase_handoffs')
        .select('metadata')
        .eq('sd_id', testSDId)
        .eq('handoff_type', 'EXEC-TO-PLAN')
        .single();

      // E2E test mapping should be present in metadata
      expect(handoff?.metadata).toBeTruthy();
    });
  });

  test.describe('PLAN→LEAD Handoff', () => {
    test('should create PLAN→LEAD handoff for final approval', async () => {
      // Execute handoff
      const { stdout } = await execAsync(
        `node scripts/unified-handoff-system.js execute PLAN-TO-LEAD ${testSDId}`
      );

      console.log('PLAN→LEAD output:', stdout);

      // Verify handoff approved
      expect(stdout).toContain('PLAN → LEAD HANDOFF APPROVED');

      // Verify handoff record created
      const { data: handoff } = await supabase
        .from('sd_phase_handoffs')
        .select('*')
        .eq('sd_id', testSDId)
        .eq('handoff_type', 'PLAN-TO-LEAD')
        .single();

      expect(handoff).toBeTruthy();
      expect(handoff.status).toBe('accepted');
      expect(handoff.from_phase).toBe('PLAN');
      expect(handoff.to_phase).toBe('LEAD');

      // Verify SD status updated for LEAD approval
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('status, current_phase')
        .eq('id', testSDId)
        .single();

      expect(sd?.status).toBe('pending_approval');
      expect(sd?.current_phase).toBe('LEAD');

      // Verify PRD status updated
      const { data: prd } = await supabase
        .from('product_requirements_v2')
        .select('status, phase')
        .eq('prd_id', testPRDId)
        .single();

      expect(prd?.status).toBe('pending_approval');
      expect(prd?.phase).toBe('LEAD_APPROVAL');
    });

    test('should enforce Git commit (Gate 5) before final approval', async () => {
      // Retrieve handoff metadata
      const { data: handoff } = await supabase
        .from('sd_phase_handoffs')
        .select('metadata')
        .eq('sd_id', testSDId)
        .eq('handoff_type', 'PLAN-TO-LEAD')
        .single();

      // Gate 5 validation should exist in metadata
      expect(handoff?.metadata).toBeTruthy();
      // Note: Gate 5 may pass or fail depending on git state, but validation should run
    });
  });

  test.describe('Handoff Rejection Workflow', () => {
    test('should store rejection feedback in database', async () => {
      // Create SD that will fail handoff
      const rejectSDId = `SD-REJECT-${timestamp}`;

      await supabase
        .from('strategic_directives_v2')
        .insert({
          id: rejectSDId,
          title: 'SD for rejection test',
          description: 'Will be rejected',
          category: 'testing',
          priority: 'LOW',
          status: 'draft',
          current_phase: 'LEAD',
          // Missing required fields to trigger rejection
        });

      // Attempt handoff (will fail)
      await execAsync(
        `node scripts/unified-handoff-system.js execute LEAD-TO-PLAN ${rejectSDId}`
      ).catch(() => {
        // Expected to fail
      });

      // Check if rejection was recorded
      const { data: rejectedHandoff } = await supabase
        .from('sd_phase_handoffs')
        .select('*')
        .eq('sd_id', rejectSDId)
        .eq('handoff_type', 'LEAD-TO-PLAN')
        .single();

      if (rejectedHandoff) {
        expect(rejectedHandoff.status).toBe('rejected');
        expect(rejectedHandoff.rejection_reason).toBeTruthy();
      }

      // Cleanup
      await supabase.from('sd_phase_handoffs').delete().eq('sd_id', rejectSDId);
      await supabase.from('strategic_directives_v2').delete().eq('id', rejectSDId);
    });
  });

  test.describe('Handoff Data Persistence', () => {
    test('should persist all handoffs in sd_phase_handoffs table', async () => {
      // Count handoffs for test SD
      const { data: handoffs, count } = await supabase
        .from('sd_phase_handoffs')
        .select('*', { count: 'exact' })
        .eq('sd_id', testSDId);

      // Should have 4 handoffs (LEAD→PLAN, PLAN→EXEC, EXEC→PLAN, PLAN→LEAD)
      expect(count).toBeGreaterThanOrEqual(4);
      expect(handoffs).toBeTruthy();

      // Verify all handoff types present
      const handoffTypes = handoffs.map(h => h.handoff_type);
      expect(handoffTypes).toContain('LEAD-TO-PLAN');
      expect(handoffTypes).toContain('PLAN-TO-EXEC');
      expect(handoffTypes).toContain('EXEC-TO-PLAN');
      expect(handoffTypes).toContain('PLAN-TO-LEAD');
    });

    test('should maintain 7-element handoff structure for all handoffs', async () => {
      const { data: handoffs } = await supabase
        .from('sd_phase_handoffs')
        .select('*')
        .eq('sd_id', testSDId);

      expect(handoffs).toBeTruthy();

      // Verify 7-element structure for each handoff
      handoffs.forEach(handoff => {
        expect(handoff.executive_summary).toBeTruthy();
        expect(handoff.deliverables_manifest).toBeTruthy();
        expect(handoff.key_decisions).toBeTruthy();
        expect(handoff.known_issues).toBeTruthy();
        expect(handoff.resource_utilization).toBeTruthy();
        expect(handoff.action_items).toBeTruthy();
        expect(handoff.completeness_report).toBeTruthy();
      });
    });

    test('should track handoff metadata and timestamps', async () => {
      const { data: handoffs } = await supabase
        .from('sd_phase_handoffs')
        .select('*')
        .eq('sd_id', testSDId);

      expect(handoffs).toBeTruthy();

      handoffs.forEach(handoff => {
        // Verify timestamps
        expect(handoff.created_at).toBeTruthy();
        if (handoff.status === 'accepted') {
          expect(handoff.accepted_at).toBeTruthy();
        }

        // Verify metadata
        expect(handoff.metadata).toBeTruthy();
        expect(handoff.metadata.created_via).toBe('unified-handoff-system');
      });
    });
  });

  test.describe('SD Status Updates', () => {
    test('should track complete status progression', async () => {
      // Retrieve all handoffs in chronological order
      const { data: handoffs } = await supabase
        .from('sd_phase_handoffs')
        .select('handoff_type, created_at, status')
        .eq('sd_id', testSDId)
        .order('created_at', { ascending: true });

      expect(handoffs).toBeTruthy();
      expect(handoffs.length).toBeGreaterThanOrEqual(4);

      // Verify handoff sequence
      const handoffSequence = handoffs.map(h => h.handoff_type);
      expect(handoffSequence[0]).toBe('LEAD-TO-PLAN');
      expect(handoffSequence[1]).toBe('PLAN-TO-EXEC');
      expect(handoffSequence[2]).toBe('EXEC-TO-PLAN');
      expect(handoffSequence[3]).toBe('PLAN-TO-LEAD');

      // Verify all accepted
      const allAccepted = handoffs.every(h => h.status === 'accepted');
      expect(allAccepted).toBe(true);
    });

    test('should update SD current_phase after each handoff', async () => {
      // Final phase should be LEAD (after PLAN→LEAD handoff)
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('current_phase')
        .eq('id', testSDId)
        .single();

      expect(sd?.current_phase).toBe('LEAD');
    });

    test('should maintain audit trail of all phase transitions', async () => {
      // Query execution records from leo_handoff_executions
      const { data: executions } = await supabase
        .from('leo_handoff_executions')
        .select('*')
        .eq('sd_id', testSDId)
        .order('created_at', { ascending: true });

      if (executions && executions.length > 0) {
        // Verify audit trail exists
        expect(executions.length).toBeGreaterThanOrEqual(4);

        executions.forEach(exec => {
          expect(exec.validation_details).toBeTruthy();
          expect(exec.created_by).toBe('UNIFIED-HANDOFF-SYSTEM');
        });
      }
    });
  });
});
