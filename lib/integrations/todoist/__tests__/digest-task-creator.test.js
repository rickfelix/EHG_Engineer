import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDigestTasks } from '../digest-task-creator.js';

let mockApiInstance;

vi.mock('@doist/todoist-api-typescript', () => ({
  TodoistApi: vi.fn(function () { return mockApiInstance; })
}));

describe('digest-task-creator', () => {
  const mockDigest = {
    date: '2026-03-14',
    videos: [
      {
        title: 'AI Agents Deep Dive',
        channel_name: 'Tech Channel',
        video_url: 'https://www.youtube.com/watch?v=abc123',
        relevance_score: 85,
        venture_tags: ['AI Automation']
      },
      {
        title: 'SaaS Metrics 2026',
        channel_name: 'Business Channel',
        video_url: 'https://www.youtube.com/watch?v=def456',
        relevance_score: 72,
        venture_tags: ['SaaS']
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TODOIST_API_TOKEN = 'test-token';
  });

  it('returns null IDs in dry-run mode', async () => {
    const result = await createDigestTasks(mockDigest, { dryRun: true });

    expect(result.parentTaskId).toBeNull();
    expect(result.childTaskIds).toEqual([]);
  });

  it('creates parent and child tasks in production mode', async () => {
    mockApiInstance = {
      getProjects: vi.fn().mockResolvedValue([
        { id: 'proj1', name: 'EVA' }
      ]),
      addTask: vi.fn()
        .mockResolvedValueOnce({ id: 'parent1' })
        .mockResolvedValueOnce({ id: 'child1' })
        .mockResolvedValueOnce({ id: 'child2' })
    };

    const result = await createDigestTasks(mockDigest, { dryRun: false });

    expect(result.parentTaskId).toBe('parent1');
    expect(result.childTaskIds).toEqual(['child1', 'child2']);

    // Verify parent task creation
    expect(mockApiInstance.addTask).toHaveBeenCalledTimes(3);
    const parentCall = mockApiInstance.addTask.mock.calls[0][0];
    expect(parentCall.content).toContain('EVA-AUTO');
    expect(parentCall.content).toContain('2026-03-14');
    expect(parentCall.projectId).toBe('proj1');

    // Verify child tasks have parentId
    const childCall = mockApiInstance.addTask.mock.calls[1][0];
    expect(childCall.parentId).toBe('parent1');
    expect(childCall.content).toContain('EVA-AUTO');
  });

  it('throws when project not found', async () => {
    mockApiInstance = {
      getProjects: vi.fn().mockResolvedValue([
        { id: 'proj1', name: 'Other' }
      ])
    };

    await expect(createDigestTasks(mockDigest, { dryRun: false }))
      .rejects.toThrow('Todoist project "EVA" not found');
  });

  it('throws when no API token', async () => {
    delete process.env.TODOIST_API_TOKEN;

    await expect(createDigestTasks(mockDigest, { dryRun: false }))
      .rejects.toThrow('TODOIST_API_TOKEN required');
  });

  it('uses custom project name', async () => {
    mockApiInstance = {
      getProjects: vi.fn().mockResolvedValue([
        { id: 'proj2', name: 'Custom' }
      ]),
      addTask: vi.fn().mockResolvedValue({ id: 'task1' })
    };

    await createDigestTasks(mockDigest, { dryRun: false, projectName: 'Custom' });

    const parentCall = mockApiInstance.addTask.mock.calls[0][0];
    expect(parentCall.projectId).toBe('proj2');
  });
});
