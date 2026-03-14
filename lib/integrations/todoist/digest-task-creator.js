import { TodoistApi } from '@doist/todoist-api-typescript';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Create Todoist digest tasks for approved YouTube recommendations.
 * Creates a parent task (daily digest) with child tasks per video.
 *
 * @param {Object} digest
 * @param {string} digest.date - Scan date (YYYY-MM-DD)
 * @param {Array<{title: string, channel_name: string, video_url: string, relevance_score: number, venture_tags: string[]}>} digest.videos
 * @param {Object} [options]
 * @param {string} [options.projectName='EVA'] - Todoist project name
 * @param {boolean} [options.dryRun=false]
 * @returns {Promise<{parentTaskId: string|null, childTaskIds: string[]}>}
 */
export async function createDigestTasks(digest, options = {}) {
  const { projectName = 'EVA', dryRun = false } = options;

  if (dryRun) {
    console.log(`[Todoist] DRY-RUN: Would create digest for ${digest.date} with ${digest.videos.length} videos`);
    for (const v of digest.videos) {
      console.log(`  - [${v.relevance_score}] ${v.title} (${v.channel_name})`);
    }
    return { parentTaskId: null, childTaskIds: [] };
  }

  const token = process.env.TODOIST_API_TOKEN;
  if (!token) throw new Error('TODOIST_API_TOKEN required');

  const api = new TodoistApi(token);

  // Find the target project
  const projects = await api.getProjects();
  const project = projects.find(p => p.name === projectName);
  if (!project) throw new Error(`Todoist project "${projectName}" not found`);

  // Create parent task
  const parentTask = await api.addTask({
    content: `EVA-AUTO: YouTube Digest ${digest.date} (${digest.videos.length} videos)`,
    projectId: project.id,
    description: `Daily YouTube subscription digest. ${digest.videos.length} venture-relevant videos scored and approved.`
  });

  // Create child tasks
  const childTaskIds = [];
  for (const video of digest.videos) {
    const tags = video.venture_tags.length > 0 ? ` [${video.venture_tags.join(', ')}]` : '';
    const task = await api.addTask({
      content: `EVA-AUTO: [${video.relevance_score}] ${video.title}${tags}`,
      projectId: project.id,
      parentId: parentTask.id,
      description: `${video.channel_name}\n${video.video_url}\nScore: ${video.relevance_score}/100`
    });
    childTaskIds.push(task.id);
  }

  return { parentTaskId: parentTask.id, childTaskIds };
}
