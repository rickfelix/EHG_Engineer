/**
 * Todoist client wrapper for /eva-support.
 * SD: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A
 *
 * Reuses createTodoistClient from lib/integrations/todoist/todoist-sync.js
 * (no new TodoistApi instantiation here — TR-2 reuse mandate).
 *
 * Provides:
 *   - findParentTask(name)            — locate the chairman's tracked parent task by title
 *   - listSubtasks(parentTaskId)      — fetch all subtasks of that parent
 *   - getTask(taskId)                 — fetch a single task by id
 *   - listComments(taskId)            — fetch all comments on a task (chronological)
 *   - postComment(taskId, content)    — append a comment to a task
 */

import { createTodoistClient } from '../../lib/integrations/todoist/todoist-sync.js';

export const DEFAULT_PARENT_TASK_NAME = 'EHG Critical Path to First Venture';

function normalizeListResponse(response) {
  if (Array.isArray(response)) return response;
  if (response && Array.isArray(response.results)) return response.results;
  return [];
}

export async function findParentTask(name = DEFAULT_PARENT_TASK_NAME, { client } = {}) {
  const api = client ?? createTodoistClient();
  const tasks = normalizeListResponse(await api.getTasks({}));
  return tasks.find((t) => t.content === name) ?? null;
}

export async function listSubtasks(parentTaskId, { client } = {}) {
  if (!parentTaskId) throw new Error('parentTaskId is required');
  const api = client ?? createTodoistClient();
  const all = normalizeListResponse(await api.getTasks({}));
  return all.filter((t) => t.parentId === parentTaskId);
}

export async function getTask(taskId, { client } = {}) {
  if (!taskId) throw new Error('taskId is required');
  const api = client ?? createTodoistClient();
  return api.getTask(taskId);
}

export async function listComments(taskId, { client } = {}) {
  if (!taskId) throw new Error('taskId is required');
  const api = client ?? createTodoistClient();
  const comments = normalizeListResponse(await api.getComments({ taskId }));
  return comments.sort((a, b) => new Date(a.postedAt) - new Date(b.postedAt));
}

export async function postComment(taskId, content, { client } = {}) {
  if (!taskId) throw new Error('taskId is required');
  if (!content || typeof content !== 'string') throw new Error('content (string) is required');
  const api = client ?? createTodoistClient();
  return api.addComment({ taskId, content });
}

export default { findParentTask, listSubtasks, getTask, listComments, postComment, DEFAULT_PARENT_TASK_NAME };
