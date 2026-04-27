import { describe, it, expect, vi } from 'vitest';
import {
  findParentTask,
  listSubtasks,
  getTask,
  listComments,
  postComment,
  DEFAULT_PARENT_TASK_NAME,
} from '../todoist-client.js';

function fakeApi({ tasks = [], comments = [] } = {}) {
  return {
    getTasks: vi.fn().mockResolvedValue({ results: tasks }),
    getTask: vi.fn().mockImplementation(async (id) => tasks.find((t) => t.id === id)),
    getComments: vi.fn().mockResolvedValue({ results: comments }),
    addComment: vi.fn().mockImplementation(async ({ taskId, content }) => ({ id: 'c-new', taskId, content, postedAt: '2026-04-27T12:00:00Z' })),
  };
}

describe('todoist-client', () => {
  it('default parent name is the chairman\'s tracked task', () => {
    expect(DEFAULT_PARENT_TASK_NAME).toBe('EHG Critical Path to First Venture');
  });

  it('findParentTask returns the task with matching content', async () => {
    const tasks = [
      { id: '1', content: 'Other' },
      { id: '2', content: 'EHG Critical Path to First Venture' },
    ];
    const client = fakeApi({ tasks });
    const parent = await findParentTask(undefined, { client });
    expect(parent.id).toBe('2');
  });

  it('findParentTask returns null when not found', async () => {
    const client = fakeApi({ tasks: [{ id: '1', content: 'Other' }] });
    const parent = await findParentTask('Missing', { client });
    expect(parent).toBeNull();
  });

  it('listSubtasks filters by parentId', async () => {
    const tasks = [
      { id: '1', parentId: 'p-1', content: 'sub a' },
      { id: '2', parentId: 'p-1', content: 'sub b' },
      { id: '3', parentId: 'other', content: 'sub c' },
    ];
    const client = fakeApi({ tasks });
    const subs = await listSubtasks('p-1', { client });
    expect(subs.map((s) => s.id)).toEqual(['1', '2']);
  });

  it('listSubtasks rejects missing parentTaskId', async () => {
    await expect(listSubtasks('', { client: fakeApi() })).rejects.toThrow(/parentTaskId/);
  });

  it('getTask delegates to the API', async () => {
    const tasks = [{ id: 'x', content: 'one' }];
    const client = fakeApi({ tasks });
    const t = await getTask('x', { client });
    expect(t.content).toBe('one');
  });

  it('getTask rejects missing taskId', async () => {
    await expect(getTask('', { client: fakeApi() })).rejects.toThrow(/taskId/);
  });

  it('listComments returns chronological comments', async () => {
    const comments = [
      { id: 'c2', postedAt: '2026-04-27T12:00:00Z', content: 'second' },
      { id: 'c1', postedAt: '2026-04-27T10:00:00Z', content: 'first' },
      { id: 'c3', postedAt: '2026-04-27T14:00:00Z', content: 'third' },
    ];
    const client = fakeApi({ comments });
    const sorted = await listComments('t-1', { client });
    expect(sorted.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('postComment passes through to addComment', async () => {
    const client = fakeApi();
    const c = await postComment('t-1', 'hello', { client });
    expect(client.addComment).toHaveBeenCalledWith({ taskId: 't-1', content: 'hello' });
    expect(c.content).toBe('hello');
  });

  it('postComment rejects non-string content', async () => {
    await expect(postComment('t-1', 42, { client: fakeApi() })).rejects.toThrow(/content/);
  });
});
