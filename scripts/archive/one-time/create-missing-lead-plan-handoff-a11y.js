#!/usr/bin/env node

import { createDatabaseClient } from '../lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function createLeadPlanHandoff() {
  const client = await createDatabaseClient('engineer', { verify: true });

  const data = {
    sd_id: 'SD-A11Y-ONBOARDING-001',
    handoff_type: 'LEAD-TO-PLAN',
    from_phase: 'LEAD',
    to_phase: 'PLAN',
    status: 'accepted',
    validation_passed: true,
    created_by: 'LEAD-AGENT',
    accepted_at: new Date(),
    executive_summary: 'LEAD approved SD-A11Y-ONBOARDING-001. Scope: Fix 2 pre-existing ARIA errors. Priority: HIGH (blocks CI/CD).',
    deliverables_manifest: 'Approval to proceed with minimal 2-line ARIA fix',
    key_decisions: 'Approved as urgent tech debt fix',
    completeness_report: 'SD approved for PLAN phase',
    known_issues: 'None',
    resource_utilization: 'N/A (retroactive)',
    action_items: 'PLAN: Create PRD and proceed to EXEC'
  };

  const query = `
    INSERT INTO sd_phase_handoffs (
      sd_id, handoff_type, from_phase, to_phase, status, validation_passed,
      created_by, accepted_at, executive_summary, deliverables_manifest,
      key_decisions, completeness_report, known_issues, resource_utilization, action_items
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING id;
  `;

  const result = await client.query(query, [
    data.sd_id, data.handoff_type, data.from_phase, data.to_phase, data.status,
    data.validation_passed, data.created_by, data.accepted_at, data.executive_summary,
    data.deliverables_manifest, data.key_decisions, data.completeness_report,
    data.known_issues, data.resource_utilization, data.action_items
  ]);

  console.log(`✅ LEAD→PLAN handoff created (ID: ${result.rows[0].id})`);

  await client.end();
}

createLeadPlanHandoff().catch(console.error);
