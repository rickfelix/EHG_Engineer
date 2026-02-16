/**
 * Dependency Resolution Service
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-G
 *
 * Resolves and validates dependencies between ventures and stages.
 */

import { createService } from '../shared-services.js';

export const dependencyResolutionService = createService({
  name: 'dependency-resolution',
  capabilities: ['dependency-analysis', 'dependency-resolution', 'critical-path'],
  stages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  async executeFn(context) {
    const { venture, stage } = context;
    const metadata = venture?.metadata || {};
    const dependencies = metadata.dependencies || [];

    const resolved = dependencies.filter(d => d.status === 'resolved' || d.resolved);
    const blocked = dependencies.filter(d => d.status === 'blocked' || d.blocked);
    const pending = dependencies.filter(d => !d.status || d.status === 'pending');

    return {
      ventureId: venture?.id,
      stageId: stage?.id,
      analysis: {
        totalDependencies: dependencies.length,
        resolved: resolved.length,
        blocked: blocked.length,
        pending: pending.length,
        blockers: blocked.map(d => ({
          name: d.name || d.description || 'Unknown',
          type: d.type || 'external',
          owner: d.owner || 'unassigned',
        })),
        isBlocked: blocked.length > 0,
      },
      recommendations: blocked.length > 0
        ? blocked.map(d => `Resolve blocker: ${d.name || d.description || 'Unknown dependency'}`)
        : ['All dependencies resolved — proceed to next stage'],
    };
  },
});
