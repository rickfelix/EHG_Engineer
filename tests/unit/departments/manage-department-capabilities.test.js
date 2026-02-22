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
  const mod = require('../../../scripts/manage-department-capabilities.cjs');
  main = mod.main;
  parseArgs = mod.parseArgs;
});

describe('manage-department-capabilities', () => {
  it('shows usage when no action provided', async () => {
    process.argv = ['node', 'script'];
    const sb = makeMockSupabase();
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Usage:');
  });

  it('adds capability with description', async () => {
    process.argv = [
      'node', 'script', '--add',
      '--department-id', 'dept-1',
      '--name', 'code-review',
      '--description', 'Review pull requests',
    ];
    const sb = makeMockSupabase(
      {
        add_department_capability: { data: 'cap-uuid', error: null },
      },
      {
        departments: { data: { name: 'Engineering' }, error: null },
      }
    );
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('code-review');
    expect(output).toContain('Engineering');
    expect(output).toContain('Review pull requests');
  });

  it('adds capability without description', async () => {
    process.argv = [
      'node', 'script', '--add',
      '--department-id', 'dept-1',
      '--name', 'testing',
    ];
    const sb = makeMockSupabase(
      {
        add_department_capability: { data: 'cap-uuid', error: null },
      },
      {
        departments: { data: { name: 'QA' }, error: null },
      }
    );
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('testing');
    expect(output).toContain('QA');
  });

  it('removes capability successfully', async () => {
    process.argv = [
      'node', 'script', '--remove',
      '--department-id', 'dept-1',
      '--name', 'old-cap',
    ];
    const sb = makeMockSupabase(
      {
        remove_department_capability: { data: true, error: null },
      },
      {
        departments: { data: { name: 'Ops' }, error: null },
      }
    );
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('removed');
    expect(output).toContain('Ops');
  });

  it('handles remove when capability not found', async () => {
    process.argv = [
      'node', 'script', '--remove',
      '--department-id', 'dept-1',
      '--name', 'nonexistent',
    ];
    const sb = makeMockSupabase(
      {
        remove_department_capability: { data: false, error: null },
      },
      {
        departments: { data: { name: 'Ops' }, error: null },
      }
    );
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('was not found');
  });

  it('lists direct capabilities', async () => {
    process.argv = ['node', 'script', '--list', '--department-id', 'dept-1'];
    const sb = makeMockSupabase(
      {},
      {
        department_capabilities: {
          data: [
            { capability_name: 'testing', description: 'Run tests' },
            { capability_name: 'deploy', description: 'Deploy services' },
          ],
          error: null,
        },
        departments: { data: { name: 'DevOps', hierarchy_path: 'devops' }, error: null },
      }
    );
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('CAPABILITIES');
    expect(output).toContain('testing');
    expect(output).toContain('deploy');
  });

  it('errors when --name missing for add', async () => {
    process.argv = ['node', 'script', '--add', '--department-id', 'dept-1'];
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const sb = makeMockSupabase();
    await expect(main(sb)).rejects.toThrow('exit');
    expect(console.error).toHaveBeenCalledWith('Error: --name is required for --add');
    mockExit.mockRestore();
  });

  it('errors when --department-id missing', async () => {
    process.argv = ['node', 'script', '--add', '--name', 'test'];
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const sb = makeMockSupabase();
    await expect(main(sb)).rejects.toThrow('exit');
    expect(console.error).toHaveBeenCalledWith('Error: --department-id is required');
    mockExit.mockRestore();
  });

  it('handles add RPC error', async () => {
    process.argv = [
      'node', 'script', '--add',
      '--department-id', 'dept-1',
      '--name', 'test',
    ];
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const sb = makeMockSupabase({
      add_department_capability: { data: null, error: { message: 'rpc failed' } },
    });
    await expect(main(sb)).rejects.toThrow('exit');
    expect(console.error).toHaveBeenCalledWith('Error adding capability:', 'rpc failed');
    mockExit.mockRestore();
  });
});
