/**
 * Integration Tests: sd.completed Handler (Return Path)
 * SD: SD-EVA-FEAT-RETURN-PATH-001
 *
 * Tests the business logic of the sd.completed handler:
 * - Story 1: SD completion triggers Stage 19 task status update
 * - Story 2: Partial completion updates progress percentage
 * - Story 3: Failed SDs create issues with severity classification
 * - Sprint evaluation (PASS/FAIL)
 * - Health score determination
 * - Idempotent Stage 19 record creation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

import { handleSdCompleted } from '../../lib/eva/event-bus/handlers/sd-completed.js';

// Required fields for strategic_directives_v2 inserts
const SD_DEFAULTS = {
  rationale: 'Test SD for event bus handler testing',
  scope: 'Test scope',
  description: 'Test description',
  category: 'feature',
  priority: 'medium',
  current_phase: 'EXEC',
  target_application: 'EHG_Engineer',
  created_by: 'test-harness',
  key_principles: ['Test principle'],
  success_criteria: [{ criterion: 'Handler processes correctly', met: false }],
  key_changes: [{ change: 'test handler', type: 'test' }],
  strategic_objectives: ['Validate handler logic'],
  success_metrics: [{ metric: 'Test passes', target: '100%', actual: 'TBD' }],
  smoke_test_steps: ['Run handler test'],
  risks: [{ risk: 'None', mitigation: 'N/A' }],
  governance_metadata: { automation_context: 'test-harness' },
};

let testVentureId;
let parentSdUuid;
let childSdUuids = [];
let createdVenture = false;

// Unique prefix to avoid collisions
const PREFIX = `TEST-${Date.now().toString(36).toUpperCase()}`;

async function createTestVenture() {
  // venture_stage_work.venture_id FK references `ventures` table (not eva_ventures)
  const { data: ventures } = await supabase
    .from('ventures')
    .select('id')
    .limit(1);

  if (ventures && ventures.length > 0) {
    return ventures[0].id;
  }

  const { data, error } = await supabase
    .from('ventures')
    .insert({ name: `Test Venture (sd-completed-tests-${PREFIX})` })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create test venture: ${error.message}`);
  createdVenture = true;
  return data.id;
}

async function insertSD(fields) {
  const uuid = randomUUID();
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert({ id: uuid, ...SD_DEFAULTS, ...fields })
    .select('id, sd_key')
    .single();

  if (error) throw new Error(`Failed to insert SD ${fields.sd_key}: ${error.message}`);
  return data;
}

/** Set SD status, handling the progress=100 requirement for 'completed' */
async function setStatus(uuid, status) {
  if (status === 'completed') {
    // Must set progress first (trigger checks current progress)
    await supabase.from('strategic_directives_v2')
      .update({ progress: 100, progress_percentage: 100 })
      .eq('id', uuid);
  }
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ status })
    .eq('id', uuid);
  if (error) throw new Error(`Failed to set status ${status}: ${error.message}`);
}

/** Child SD templates for DELETE + re-INSERT (bypasses UPDATE triggers) */
const CHILD_TEMPLATES = [
  { sd_key_suffix: 'CHILD-001', title: 'Feature Child', sd_type: 'feature' },
  { sd_key_suffix: 'CHILD-002', title: 'Security Child', sd_type: 'security' },
  { sd_key_suffix: 'CHILD-003', title: 'Infra Child', sd_type: 'infrastructure' },
];

/**
 * Replace a child SD via DELETE + INSERT to bypass UPDATE triggers.
 * The strategic_directives_v2 table has triggers that prevent certain
 * status transitions via UPDATE (e.g., completed→in_progress becomes
 * pending_approval, completed requires handoff-based progress validation).
 * INSERT bypasses these triggers.
 */
async function replaceChild(index, statusOverrides) {
  const template = CHILD_TEMPLATES[index];
  await supabase.from('strategic_directives_v2').delete().eq('id', childSdUuids[index]);

  const newSd = await insertSD({
    sd_key: `SD-${PREFIX}-${template.sd_key_suffix}`,
    title: template.title,
    sd_type: template.sd_type,
    parent_sd_id: parentSdUuid,
    ...statusOverrides,
  });
  childSdUuids[index] = newSd.id;
  return newSd;
}

describe('sd.completed Handler (Return Path)', () => {
  beforeAll(async () => {
    testVentureId = await createTestVenture();

    // Create parent (orchestrator) SD - sd_type must be 'orchestrator'
    // to avoid type-change trigger when children are added
    const parent = await insertSD({
      sd_key: `SD-${PREFIX}-ORCH-001`,
      title: 'Test Orchestrator',
      sd_type: 'orchestrator',
      status: 'in_progress',
    });
    parentSdUuid = parent.id;

    // Create 3 child SDs with different types and statuses
    // Note: status 'completed' requires progress=100 (DB trigger)
    const child1 = await insertSD({
      sd_key: `SD-${PREFIX}-CHILD-001`,
      title: 'Feature Child (completed)',
      sd_type: 'feature',
      status: 'completed',
      progress: 100,
      parent_sd_id: parentSdUuid,
    });
    childSdUuids.push(child1.id);

    const child2 = await insertSD({
      sd_key: `SD-${PREFIX}-CHILD-002`,
      title: 'Security Child (in progress)',
      sd_type: 'security',
      status: 'in_progress',
      parent_sd_id: parentSdUuid,
    });
    childSdUuids.push(child2.id);

    const child3 = await insertSD({
      sd_key: `SD-${PREFIX}-CHILD-003`,
      title: 'Infra Child (draft)',
      sd_type: 'infrastructure',
      status: 'draft',
      parent_sd_id: parentSdUuid,
    });
    childSdUuids.push(child3.id);

    // Pre-create Stage 19 record for the test venture
    // (avoids FK issue with sd_id on auto-create path)
    await supabase.from('venture_stage_work').insert({
      venture_id: testVentureId,
      lifecycle_stage: 19,
      stage_status: 'in_progress',
      work_type: 'sd_required',
      started_at: new Date().toISOString(),
      health_score: 'green',
      advisory_data: {
        tasks: [],
        issues: [],
        total_tasks: 0,
        completed_tasks: 0,
        blocked_tasks: 0,
        completion_pct: 0,
        tasks_by_status: {},
      },
    });
  });

  afterAll(async () => {
    // Clean up in reverse dependency order
    await supabase.from('eva_audit_log').delete().eq('eva_venture_id', testVentureId);
    await supabase.from('venture_stage_work')
      .delete()
      .eq('venture_id', testVentureId)
      .eq('lifecycle_stage', 19);

    // Delete children first (FK on parent_sd_id)
    for (const uuid of childSdUuids) {
      await supabase.from('strategic_directives_v2').delete().eq('id', uuid);
    }
    // Delete parent
    if (parentSdUuid) {
      await supabase.from('strategic_directives_v2').delete().eq('id', parentSdUuid);
    }

    if (createdVenture && testVentureId) {
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
  });

  describe('Story 1: Task Status Update', () => {
    it('should update Stage 19 with task list from sibling SDs', async () => {
      const result = await handleSdCompleted(
        {
          sdKey: `SD-${PREFIX}-CHILD-001`,
          ventureId: testVentureId,
          parentSdId: parentSdUuid,
          parentSdKey: `SD-${PREFIX}-ORCH-001`,
        },
        { supabase, ventureId: testVentureId },
      );

      expect(result.outcome).toBe('task_updated');
      expect(result.totalTasks).toBe(3);
      expect(result.completedTasks).toBe(1);
      expect(result.sprintComplete).toBe(false);

      // Verify Stage 19 record was created
      const { data: stage19 } = await supabase
        .from('venture_stage_work')
        .select('stage_status, health_score, advisory_data')
        .eq('venture_id', testVentureId)
        .eq('lifecycle_stage', 19)
        .single();

      expect(stage19).toBeTruthy();
      expect(stage19.stage_status).toBe('in_progress');
      expect(stage19.advisory_data.total_tasks).toBe(3);
      expect(stage19.advisory_data.tasks).toHaveLength(3);
    });

    it('should skip orchestrator-level completions (no parentSdId)', async () => {
      const result = await handleSdCompleted(
        {
          sdKey: `SD-${PREFIX}-ORCH-001`,
          ventureId: testVentureId,
          // No parentSdId
        },
        { supabase, ventureId: testVentureId },
      );

      expect(result.outcome).toBe('no_parent');
    });
  });

  describe('Story 2: Progress Percentage', () => {
    it('should compute correct completion percentage', async () => {
      const result = await handleSdCompleted(
        {
          sdKey: `SD-${PREFIX}-CHILD-001`,
          ventureId: testVentureId,
          parentSdId: parentSdUuid,
          parentSdKey: `SD-${PREFIX}-ORCH-001`,
        },
        { supabase, ventureId: testVentureId },
      );

      // 1 of 3 completed = 33.33%
      expect(result.completionPct).toBeCloseTo(33.33, 1);
    });

    it('should map SD statuses to task statuses correctly', async () => {
      await handleSdCompleted(
        {
          sdKey: `SD-${PREFIX}-CHILD-001`,
          ventureId: testVentureId,
          parentSdId: parentSdUuid,
          parentSdKey: `SD-${PREFIX}-ORCH-001`,
        },
        { supabase, ventureId: testVentureId },
      );

      // Verify advisory_data in DB
      const { data: stage19 } = await supabase
        .from('venture_stage_work')
        .select('advisory_data')
        .eq('venture_id', testVentureId)
        .eq('lifecycle_stage', 19)
        .single();

      const tasks = stage19.advisory_data.tasks;
      const byRef = Object.fromEntries(tasks.map(t => [t.sprint_item_ref, t]));

      expect(byRef[`SD-${PREFIX}-CHILD-001`].status).toBe('done');       // completed → done
      expect(byRef[`SD-${PREFIX}-CHILD-002`].status).toBe('in_progress'); // in_progress → in_progress
      expect(byRef[`SD-${PREFIX}-CHILD-003`].status).toBe('todo');        // draft → todo

      expect(stage19.advisory_data.tasks_by_status).toEqual({
        todo: 1,
        in_progress: 1,
        done: 1,
        blocked: 0,
      });
    });
  });

  describe('Story 3: Severity Classification', () => {
    it('should classify cancelled security SD as HIGH severity', async () => {
      // Update child 2 (security) to cancelled
      await setStatus(childSdUuids[1], 'cancelled');

      const result = await handleSdCompleted(
        {
          sdKey: `SD-${PREFIX}-CHILD-001`,
          ventureId: testVentureId,
          parentSdId: parentSdUuid,
          parentSdKey: `SD-${PREFIX}-ORCH-001`,
        },
        { supabase, ventureId: testVentureId },
      );

      expect(result.issueCount).toBe(1);

      const { data: stage19 } = await supabase
        .from('venture_stage_work')
        .select('advisory_data, health_score')
        .eq('venture_id', testVentureId)
        .eq('lifecycle_stage', 19)
        .single();

      const issues = stage19.advisory_data.issues;
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('high'); // security type = high
      expect(issues[0].sd_type).toBe('security');
      expect(stage19.health_score).toBe('red'); // high severity → red

      // Restore
      await setStatus(childSdUuids[1], 'in_progress');
    });

    it('should classify cancelled feature SD as HIGH severity (cancelled override)', async () => {
      // Use DELETE+INSERT to bypass UPDATE triggers on strategic_directives_v2
      // (completed→cancelled via UPDATE is blocked by status transition triggers)
      await replaceChild(0, { status: 'cancelled' });

      const result = await handleSdCompleted(
        {
          sdKey: `SD-${PREFIX}-CHILD-002`,
          ventureId: testVentureId,
          parentSdId: parentSdUuid,
          parentSdKey: `SD-${PREFIX}-ORCH-001`,
        },
        { supabase, ventureId: testVentureId },
      );

      expect(result.issueCount).toBe(1);

      const { data: stage19 } = await supabase
        .from('venture_stage_work')
        .select('advisory_data, health_score')
        .eq('venture_id', testVentureId)
        .eq('lifecycle_stage', 19)
        .single();

      const issues = stage19.advisory_data.issues;
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('high'); // cancelled status = high
      expect(stage19.health_score).toBe('red');

      // Restore child1 to completed for subsequent tests
      await replaceChild(0, { status: 'completed', progress: 100 });
    });
  });

  describe('Sprint Evaluation', () => {
    it('should produce PASS evaluation when all SDs complete', async () => {
      // Use DELETE+INSERT to set all children to completed
      // (UPDATE cannot set status='completed' — trigger requires handoff progress)
      await replaceChild(0, { status: 'completed', progress: 100 });
      await replaceChild(1, { status: 'completed', progress: 100 });
      await replaceChild(2, { status: 'completed', progress: 100 });

      // Reset stage_status to in_progress for a clean evaluation
      await supabase.from('venture_stage_work')
        .update({ stage_status: 'in_progress', completed_at: null })
        .eq('venture_id', testVentureId)
        .eq('lifecycle_stage', 19);

      const result = await handleSdCompleted(
        {
          sdKey: `SD-${PREFIX}-CHILD-003`,
          ventureId: testVentureId,
          parentSdId: parentSdUuid,
          parentSdKey: `SD-${PREFIX}-ORCH-001`,
        },
        { supabase, ventureId: testVentureId },
      );

      expect(result.outcome).toBe('sprint_complete');
      expect(result.completionPct).toBe(100);
      expect(result.sprintComplete).toBe(true);
      expect(result.issueCount).toBe(0);

      const { data: stage19 } = await supabase
        .from('venture_stage_work')
        .select('advisory_data, stage_status, health_score')
        .eq('venture_id', testVentureId)
        .eq('lifecycle_stage', 19)
        .single();

      expect(stage19.stage_status).toBe('completed');
      expect(stage19.health_score).toBe('green');
      expect(stage19.advisory_data.sprint_evaluation).toBeTruthy();
      expect(stage19.advisory_data.sprint_evaluation.result).toBe('PASS');
      expect(stage19.advisory_data.sprint_evaluation.total).toBe(3);
      expect(stage19.advisory_data.sprint_evaluation.completed).toBe(3);
      expect(stage19.advisory_data.sprint_evaluation.failed).toBe(0);
    });

    it('should produce FAIL evaluation when some SDs cancelled', async () => {
      // Use DELETE+INSERT: 2 completed + 1 cancelled
      await replaceChild(0, { status: 'completed', progress: 100 });
      await replaceChild(1, { status: 'completed', progress: 100 });
      await replaceChild(2, { status: 'cancelled' });

      // Reset stage_status so it can be re-evaluated
      await supabase.from('venture_stage_work')
        .update({ stage_status: 'in_progress', completed_at: null })
        .eq('venture_id', testVentureId)
        .eq('lifecycle_stage', 19);

      const result = await handleSdCompleted(
        {
          sdKey: `SD-${PREFIX}-CHILD-002`,
          ventureId: testVentureId,
          parentSdId: parentSdUuid,
          parentSdKey: `SD-${PREFIX}-ORCH-001`,
        },
        { supabase, ventureId: testVentureId },
      );

      expect(result.sprintComplete).toBe(true); // allTerminal triggers completion
      expect(result.issueCount).toBe(1);

      const { data: stage19 } = await supabase
        .from('venture_stage_work')
        .select('advisory_data, stage_status, health_score')
        .eq('venture_id', testVentureId)
        .eq('lifecycle_stage', 19)
        .single();

      expect(stage19.stage_status).toBe('completed');
      expect(stage19.advisory_data.sprint_evaluation.result).toBe('FAIL');
      expect(stage19.advisory_data.sprint_evaluation.failed).toBe(1);
      // infrastructure type = high severity
      expect(stage19.advisory_data.sprint_evaluation.high_severity_failures).toBe(1);
      expect(stage19.health_score).toBe('red');
    });
  });

  describe('Error Handling', () => {
    it('should throw on missing ventureId', async () => {
      await expect(
        handleSdCompleted(
          { sdKey: 'SD-TEST-001' },
          { supabase },
        ),
      ).rejects.toThrow('Missing ventureId');
    });

    it('should throw on missing sdKey', async () => {
      await expect(
        handleSdCompleted(
          { ventureId: testVentureId },
          { supabase, ventureId: testVentureId },
        ),
      ).rejects.toThrow('Missing sdKey');
    });
  });
});
