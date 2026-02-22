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
  main = require('../../../scripts/department-hierarchy.cjs').main;
});

describe('department-hierarchy', () => {
  it('renders a tree with parent and child', async () => {
    const parentId = 'p1';
    const childId = 'c1';
    const sb = makeMockSupabase({
      departments: {
        data: [
          {
            id: parentId,
            name: 'EHG Corp',
            slug: 'ehg',
            hierarchy_path: 'ehg',
            parent_department_id: null,
            is_active: true,
            description: 'Top level',
          },
          {
            id: childId,
            name: 'Engineering',
            slug: 'eng',
            hierarchy_path: 'ehg.eng',
            parent_department_id: parentId,
            is_active: true,
            description: 'Dev team',
          },
        ],
        error: null,
      },
      department_agents: { data: [{ department_id: childId }], error: null },
      department_capabilities: { data: [{ department_id: childId }], error: null },
    });
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('EHG Corp');
    expect(output).toContain('Engineering');
    expect(output).toContain('1 agent');
  });

  it('shows message when no departments', async () => {
    const sb = makeMockSupabase({
      departments: { data: [], error: null },
    });
    await main(sb);
    expect(console.log).toHaveBeenCalledWith('No departments found.');
  });

  it('handles database error', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const sb = makeMockSupabase({
      departments: { data: null, error: { message: 'db error' } },
    });
    await expect(main(sb)).rejects.toThrow('exit');
    expect(console.error).toHaveBeenCalledWith('Error fetching departments:', 'db error');
    mockExit.mockRestore();
  });

  it('marks inactive departments', async () => {
    const sb = makeMockSupabase({
      departments: {
        data: [
          {
            id: 'x',
            name: 'Old Dept',
            slug: 'old',
            hierarchy_path: 'old',
            parent_department_id: null,
            is_active: false,
            description: null,
          },
        ],
        error: null,
      },
      department_agents: { data: [], error: null },
      department_capabilities: { data: [], error: null },
    });
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('[INACTIVE]');
  });

  it('shows summary with counts', async () => {
    const sb = makeMockSupabase({
      departments: {
        data: [
          {
            id: 'd1',
            name: 'Dept A',
            slug: 'a',
            hierarchy_path: 'a',
            parent_department_id: null,
            is_active: true,
            description: null,
          },
        ],
        error: null,
      },
      department_agents: { data: [{ department_id: 'd1' }], error: null },
      department_capabilities: { data: [{ department_id: 'd1' }, { department_id: 'd1' }], error: null },
    });
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Summary:');
    expect(output).toContain('1 departments');
    expect(output).toContain('1 agent assignments');
    expect(output).toContain('2 capabilities');
  });
});
