import { describe, it, expect, beforeEach, vi } from 'vitest';

function makeChain(resolvedValue) {
  const handler = {
    get(_, prop) {
      if (prop === 'then') return (cb) => Promise.resolve(resolvedValue).then(cb);
      if (prop === 'catch') return (cb) => Promise.resolve(resolvedValue).catch(cb);
      return (...args) => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

function makeMockSupabase(rpcResults = {}, fromResults = {}) {
  return {
    rpc(fnName, params) {
      const result = rpcResults[fnName] || { data: null, error: null };
      return makeChain(result);
    },
    from(table) {
      const result = fromResults[table] || { data: null, error: null };
      return makeChain(result);
    },
  };
}

let main, parseArgs;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const mod = require('../../../scripts/manage-department-agents.cjs');
  main = mod.main;
  parseArgs = mod.parseArgs;
});

describe('manage-department-agents', () => {
  it('shows usage when no action provided', async () => {
    process.argv = ['node', 'script'];
    const sb = makeMockSupabase();
    await main(sb);
    expect(console.log).toHaveBeenCalled();
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Usage:');
  });

  it('shows usage with --help flag', async () => {
    process.argv = ['node', 'script', '--help'];
    const sb = makeMockSupabase();
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Usage:');
  });

  it('assigns agent with specified role', async () => {
    process.argv = [
      'node', 'script', '--assign',
      '--agent-id', 'agent-uuid',
      '--department-id', 'dept-uuid',
      '--role', 'lead',
    ];
    const sb = makeMockSupabase({
      assign_agent_to_department: { data: 'assignment-id', error: null },
    });
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('assigned');
    expect(output).toContain('lead');
  });

  it('assigns agent with default member role', async () => {
    process.argv = [
      'node', 'script', '--assign',
      '--agent-id', 'agent-uuid',
      '--department-id', 'dept-uuid',
    ];
    const sb = makeMockSupabase({
      assign_agent_to_department: { data: 'assignment-id', error: null },
    });
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('member');
  });

  it('handles assign RPC error', async () => {
    process.argv = [
      'node', 'script', '--assign',
      '--agent-id', 'a1',
      '--department-id', 'd1',
    ];
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const sb = makeMockSupabase({
      assign_agent_to_department: { data: null, error: { message: 'duplicate' } },
    });
    await expect(main(sb)).rejects.toThrow('exit');
    expect(console.error).toHaveBeenCalledWith('Error assigning agent:', 'duplicate');
    mockExit.mockRestore();
  });

  it('removes agent successfully', async () => {
    process.argv = [
      'node', 'script', '--remove',
      '--agent-id', 'a1',
      '--department-id', 'd1',
    ];
    const sb = makeMockSupabase({
      remove_agent_from_department: { data: true, error: null },
    });
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('removed');
  });

  it('handles remove when agent not in department', async () => {
    process.argv = [
      'node', 'script', '--remove',
      '--agent-id', 'a1',
      '--department-id', 'd1',
    ];
    const sb = makeMockSupabase({
      remove_agent_from_department: { data: false, error: null },
    });
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('was not in');
  });

  it('lists agents in department', async () => {
    process.argv = ['node', 'script', '--list', '--department-id', 'dept-uuid'];
    const sb = makeMockSupabase(
      {
        get_department_agents: {
          data: [
            {
              display_name: 'Test Agent',
              agent_type: 'orchestrator',
              role_in_department: 'lead',
              assigned_at: '2026-01-15T00:00:00Z',
            },
          ],
          error: null,
        },
      },
      {
        departments: { data: { name: 'Engineering' }, error: null },
      }
    );
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('AGENTS IN');
    expect(output).toContain('Test Agent');
  });

  it('lists empty department', async () => {
    process.argv = ['node', 'script', '--list', '--department-id', 'dept-uuid'];
    const sb = makeMockSupabase(
      {
        get_department_agents: { data: [], error: null },
      },
      {
        departments: { data: { name: 'Empty Dept' }, error: null },
      }
    );
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('No agents assigned');
  });

  it('errors when --department-id missing for list', async () => {
    process.argv = ['node', 'script', '--list'];
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const sb = makeMockSupabase();
    await expect(main(sb)).rejects.toThrow('exit');
    expect(console.error).toHaveBeenCalledWith('Error: --department-id is required for --list');
    mockExit.mockRestore();
  });

  it('errors when --agent-id or --department-id missing for assign', async () => {
    process.argv = ['node', 'script', '--assign', '--agent-id', 'a1'];
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const sb = makeMockSupabase();
    await expect(main(sb)).rejects.toThrow('exit');
    expect(console.error).toHaveBeenCalledWith(
      'Error: --agent-id and --department-id are required for --assign'
    );
    mockExit.mockRestore();
  });
});
