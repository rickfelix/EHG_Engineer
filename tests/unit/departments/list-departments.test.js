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

function makeMockSupabase(fromResults) {
  return {
    from(table) {
      const result = fromResults[table] || { data: null, error: null };
      return makeChain(result);
    },
  };
}

let main;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  main = require('../../../scripts/list-departments.cjs').main;
});

describe('list-departments', () => {
  it('shows message when no departments found', async () => {
    const sb = makeMockSupabase({
      departments: { data: [], error: null },
      department_agents: { data: [], error: null },
    });
    await main(sb);
    expect(console.log).toHaveBeenCalledWith('No departments found.');
  });

  it('lists departments with agent counts', async () => {
    const deptId = '111-222';
    const sb = makeMockSupabase({
      departments: {
        data: [
          { id: deptId, name: 'Engineering', slug: 'eng', hierarchy_path: 'eng', is_active: true },
        ],
        error: null,
      },
      department_agents: {
        data: [{ department_id: deptId }, { department_id: deptId }],
        error: null,
      },
    });
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Engineering');
    expect(output).toContain('Total: 1 department(s)');
  });

  it('handles departments query error', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const sb = makeMockSupabase({
      departments: { data: null, error: { message: 'connection refused' } },
    });
    await expect(main(sb)).rejects.toThrow('exit');
    expect(console.error).toHaveBeenCalledWith(
      'Error fetching departments:',
      'connection refused'
    );
    mockExit.mockRestore();
  });

  it('handles agent count error gracefully', async () => {
    const sb = makeMockSupabase({
      departments: {
        data: [
          { id: 'x', name: 'Ops', slug: 'ops', hierarchy_path: 'ops', is_active: true },
        ],
        error: null,
      },
      department_agents: { data: null, error: { message: 'no access' } },
    });
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Ops');
  });

  it('shows active/inactive status', async () => {
    const sb = makeMockSupabase({
      departments: {
        data: [
          { id: 'a', name: 'Active Dept', slug: 'act', hierarchy_path: 'act', is_active: true },
          { id: 'b', name: 'Inactive Dept', slug: 'ina', hierarchy_path: 'ina', is_active: false },
        ],
        error: null,
      },
      department_agents: { data: [], error: null },
    });
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Yes');
    expect(output).toContain('No');
  });
});
