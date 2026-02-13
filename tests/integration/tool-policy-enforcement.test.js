import { describe, it, expect, beforeAll } from 'vitest';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { filterToolsByProfile, canUseTool, isValidProfile } from '../../lib/tool-policy.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

describe('Tool Policy E2E: Compile-Time Enforcement', () => {
  let agents;

  beforeAll(async () => {
    const { data, error } = await supabase
      .from('leo_sub_agents')
      .select('code, name, allowed_tools, tool_policy_profile')
      .eq('active', true)
      .order('code');

    expect(error).toBeNull();
    agents = data;
  });

  it('all agents have a valid tool_policy_profile', () => {
    for (const agent of agents) {
      expect(isValidProfile(agent.tool_policy_profile),
        `Agent ${agent.code} has invalid profile: ${agent.tool_policy_profile}`
      ).toBe(true);
    }
  });

  it('agents with full profile have unrestricted tools', () => {
    const fullAgents = agents.filter(a => a.tool_policy_profile === 'full');
    expect(fullAgents.length).toBeGreaterThan(0);

    for (const agent of fullAgents) {
      const filtered = filterToolsByProfile('full', agent.allowed_tools);
      expect(filtered).toEqual(agent.allowed_tools);
    }
  });

  it('readonly profile filters to only read-only tools', () => {
    const baseTools = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task', 'SendMessage'];
    const result = filterToolsByProfile('readonly', baseTools);
    expect(result).toEqual(['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']);
    expect(result).not.toContain('Bash');
    expect(result).not.toContain('Write');
    expect(result).not.toContain('Edit');
  });

  it('minimal profile filters to only Read', () => {
    const baseTools = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'];
    const result = filterToolsByProfile('minimal', baseTools);
    expect(result).toEqual(['Read']);
  });

  it('coding profile blocks WebFetch and WebSearch', () => {
    const baseTools = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];
    const result = filterToolsByProfile('coding', baseTools);
    expect(result).not.toContain('WebFetch');
    expect(result).not.toContain('WebSearch');
    expect(result).toContain('Bash');
    expect(result).toContain('Edit');
  });

  it('DB constraint rejects invalid profile values', async () => {
    const { error } = await supabase
      .from('leo_sub_agents')
      .update({ tool_policy_profile: 'superuser' })
      .eq('code', 'QUICKFIX'); // Use a real agent for the test

    expect(error).not.toBeNull();
    expect(error.message).toContain('chk_tool_policy_profile');
  });

  it('backward compatibility: default full profile exists for all agents', () => {
    for (const agent of agents) {
      expect(agent.tool_policy_profile).toBeDefined();
      // All existing agents should have 'full' since we just added the column
      expect(agent.tool_policy_profile).toBe('full');
    }
  });

  it('canUseTool returns correct results for runtime validation', () => {
    // Readonly: allowed
    expect(canUseTool('readonly', 'Read')).toBe(true);
    expect(canUseTool('readonly', 'Glob')).toBe(true);
    // Readonly: blocked
    expect(canUseTool('readonly', 'Write')).toBe(false);
    expect(canUseTool('readonly', 'Bash')).toBe(false);

    // Minimal: only Read
    expect(canUseTool('minimal', 'Read')).toBe(true);
    expect(canUseTool('minimal', 'Glob')).toBe(false);
  });
});
