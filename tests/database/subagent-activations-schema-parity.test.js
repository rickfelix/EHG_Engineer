/**
 * QF-20260905-374 — subagent-enforcement-system.js's recordSubAgentActivation wrote
 * {agent_type, activation_time, result}, none of which exist on subagent_activations
 * (real columns: activating_agent, phase, subagent_code, subagent_name, activation_trigger,
 * status, execution_results, activated_at). Every insert failed silently, so
 * getUsedSubAgents() (read by scripts/handoff-validator.js's was-sub-agent-used check) has
 * returned empty for its whole history.
 *
 * BINDING round-trip against the real table (not a mock of the write/read seam) — a mocked
 * client would happily accept the old phantom-column payload too, which is exactly how this
 * regressed silently in the first place.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import SubAgentEnforcementSystem from '../../scripts/subagent-enforcement-system.js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const SD_FIXTURE = 'SD-DEMO-QF374-001';

async function cleanup() {
  await supabase.from('subagent_activations').delete().eq('sd_id', SD_FIXTURE);
  await supabase.from('strategic_directives_v2').delete().eq('sd_key', SD_FIXTURE);
}

beforeAll(async () => {
  await cleanup();
  // subagent_activations.sd_id carries a live FK to strategic_directives_v2 -- the fixture row
  // must exist first (measured: the fixture-free version of this test silently inserted zero
  // rows via a 23503 foreign_key_violation, which the class under test swallows).
  const { error } = await supabase.from('strategic_directives_v2').upsert({
    id: SD_FIXTURE,
    sd_key: SD_FIXTURE,
    title: `Test fixture SD for QF-20260905-374 schema-parity — ${SD_FIXTURE}`,
    description: 'Test fixture for QF-20260905-374 — auto-cleaned',
    rationale: 'Test fixture for QF-20260905-374 — auto-cleaned',
    scope: 'Test sandbox only',
    sd_type: 'infrastructure',
    category: 'infrastructure',
    priority: 'low',
    status: 'draft',
    current_phase: 'LEAD',
    target_application: 'EHG_Engineer',
  }, { onConflict: 'sd_key' });
  if (error) throw new Error(`fixture SD upsert failed: ${error.message}`);
});

afterAll(cleanup);

describe('subagent_activations schema parity (QF-20260905-374)', () => {
  it('recordSubAgentActivation writes real columns and getUsedSubAgents reads the same row back', async () => {
    const enforcer = new SubAgentEnforcementSystem();

    const written = await enforcer.recordSubAgentActivation(
      'DATABASE', SD_FIXTURE, 'implementation', { verdict: 'PASS' }
    );
    expect(written.subagent_code).toBe('DATABASE');
    expect(written.activating_agent).toBe('EXEC');

    // Read back the RAW row -- proves the insert actually landed with the real columns
    // populated, not merely that the client call didn't throw.
    const { data: row, error } = await supabase
      .from('subagent_activations')
      .select('sd_id, activating_agent, phase, subagent_code, subagent_name, activation_trigger, status, execution_results')
      .eq('sd_id', SD_FIXTURE)
      .single();
    expect(error).toBeNull();
    expect(row).toMatchObject({
      sd_id: SD_FIXTURE,
      activating_agent: 'EXEC',
      phase: 'implementation',
      subagent_code: 'DATABASE',
      subagent_name: 'DATABASE',
      activation_trigger: 'manual',
      status: 'completed',
      execution_results: { verdict: 'PASS' },
    });

    // The actual regression this QF fixes: getUsedSubAgents must see the row it just wrote.
    const used = await enforcer.getUsedSubAgents(SD_FIXTURE);
    expect(used).toEqual(['DATABASE']);
  });

  it('recordSubAgentActivation honors an overridden activatingAgent/activationTrigger', async () => {
    const enforcer = new SubAgentEnforcementSystem();
    const written = await enforcer.recordSubAgentActivation(
      'SECURITY', SD_FIXTURE, 'verification', {}, { activatingAgent: 'PLAN', activationTrigger: 'automated' }
    );
    expect(written.activating_agent).toBe('PLAN');
    expect(written.activation_trigger).toBe('automated');

    const used = await enforcer.getUsedSubAgents(SD_FIXTURE);
    expect(used.sort()).toEqual(['DATABASE', 'SECURITY']);
  });
});
