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
  const mod = require('../../../scripts/query-capabilities.cjs');
  main = mod.main;
  parseArgs = mod.parseArgs;
});

describe('query-capabilities', () => {
  it('shows usage when no args provided', async () => {
    process.argv = ['node', 'script'];
    const sb = makeMockSupabase();
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Usage:');
  });

  it('shows usage with --help', async () => {
    process.argv = ['node', 'script', '--help'];
    const sb = makeMockSupabase();
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Usage:');
  });

  it('queries single agent capabilities via RPC', async () => {
    process.argv = ['node', 'script', '--agent-id', 'agent-uuid'];
    const sb = makeMockSupabase(
      {
        get_effective_capabilities: {
          data: [
            {
              capability_name: 'code-review',
              source_department_name: 'Engineering',
              inheritance_type: 'direct',
            },
            {
              capability_name: 'deploy',
              source_department_name: 'DevOps',
              inheritance_type: 'inherited',
            },
          ],
          error: null,
        },
      },
      {
        agent_registry: { data: { display_name: 'Test Agent' }, error: null },
      }
    );
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('EFFECTIVE CAPABILITIES');
    expect(output).toContain('code-review');
    expect(output).toContain('DIRECT');
    expect(output).toContain('INHERITED');
  });

  it('shows message for agent with no capabilities', async () => {
    process.argv = ['node', 'script', '--agent-id', 'agent-uuid'];
    const sb = makeMockSupabase(
      {
        get_effective_capabilities: { data: [], error: null },
      },
      {
        agent_registry: { data: { display_name: 'Empty Agent' }, error: null },
      }
    );
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('No capabilities found');
  });

  it('queries all capabilities via view', async () => {
    process.argv = ['node', 'script', '--all'];
    const sb = makeMockSupabase(
      {},
      {
        v_agent_effective_capabilities: {
          data: [
            {
              agent_name: 'Agent A',
              capability_name: 'testing',
              source_department_name: 'QA',
              inheritance_type: 'direct',
            },
          ],
          error: null,
        },
      }
    );
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('ALL AGENT EFFECTIVE CAPABILITIES');
    expect(output).toContain('Agent A');
    expect(output).toContain('Total: 1');
  });

  it('handles RPC error for single agent', async () => {
    process.argv = ['node', 'script', '--agent-id', 'bad-uuid'];
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const sb = makeMockSupabase({
      get_effective_capabilities: { data: null, error: { message: 'rpc failed' } },
    });
    await expect(main(sb)).rejects.toThrow('exit');
    expect(console.error).toHaveBeenCalledWith('Error querying capabilities:', 'rpc failed');
    mockExit.mockRestore();
  });

  it('handles view error for --all', async () => {
    process.argv = ['node', 'script', '--all'];
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const sb = makeMockSupabase(
      {},
      {
        v_agent_effective_capabilities: { data: null, error: { message: 'view error' } },
      }
    );
    await expect(main(sb)).rejects.toThrow('exit');
    expect(console.error).toHaveBeenCalledWith('Error querying capabilities:', 'view error');
    mockExit.mockRestore();
  });
});
