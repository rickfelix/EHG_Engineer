/**
 * Backlog Generator
 * Generates workflow improvement backlog
 *
 * Extracted from generate-workflow-docs.js for modularity
 * SD-LEO-REFACTOR-WORKFLOW-DOCS-001
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { workflowDir, ensureDir } from './data-loader.js';

/**
 * Generate backlog items and GitHub issue templates
 */
export function generateBacklog() {
  const backlogPath = path.join(workflowDir, 'backlog', 'backlog.yaml');
  const issuesDir = path.join(workflowDir, 'backlog', 'issues');
  ensureDir(path.join(workflowDir, 'backlog'));
  ensureDir(issuesDir);

  const backlogItems = getBacklogItems();

  // Write YAML backlog
  const backlogYaml = yaml.dump({ items: backlogItems });
  fs.writeFileSync(backlogPath, backlogYaml);

  // Generate GitHub issues
  backlogItems.forEach(item => {
    generateIssueTemplate(issuesDir, item);
  });

  console.log(`Generated backlog with ${backlogItems.length} items`);
}

/**
 * Get backlog items definition
 * @returns {Array} Backlog items
 */
function getBacklogItems() {
  return [
    {
      id: 'WF-001',
      title: 'Fix dependency mismatch between Stage 5 and Stage 15',
      description: 'Pricing Strategy (15) depends on Profitability Forecasting (5), but Stage 15 outputs feed back to Stage 5.',
      source: ['critique/overview.md', 'prd_crosswalk.csv'],
      affects_stages: [5, 15],
      priority: 'P0',
      effort: 'M',
      acceptance_criteria: [
        'Circular dependency resolved',
        'stages.yaml updated',
        'Diagrams regenerated'
      ]
    },
    {
      id: 'WF-002',
      title: 'Add Legal/IP Strategy stage',
      description: 'No dedicated stage for intellectual property and legal structure setup.',
      source: ['critique/overview.md'],
      affects_stages: [13, 14],
      priority: 'P0',
      effort: 'L',
      acceptance_criteria: [
        'New stage defined between 13 and 14',
        'All stages renumbered if needed',
        'Dependencies updated'
      ]
    },
    {
      id: 'WF-003',
      title: 'Add early customer validation touchpoint',
      description: 'Customer feedback comes too late in Stage 23. Need earlier validation.',
      source: ['critique/overview.md', 'critique/stage-07.md'],
      affects_stages: [7],
      priority: 'P0',
      effort: 'M',
      acceptance_criteria: [
        'Customer validation added to Stage 7',
        'Validation criteria defined',
        'SOP updated'
      ]
    },
    {
      id: 'WF-004',
      title: 'Automate phase transitions',
      description: 'Manual handoffs between phases cause delays and data loss.',
      source: ['critique/overview.md'],
      affects_stages: [10, 20, 28, 34],
      priority: 'P1',
      effort: 'L',
      acceptance_criteria: [
        'Automated handoff system designed',
        'Data pipeline specified',
        'Integration points documented'
      ]
    },
    {
      id: 'WF-005',
      title: 'Implement continuous metrics dashboard',
      description: 'No real-time visibility into stage progress and metrics.',
      source: ['critique/overview.md'],
      affects_stages: Array.from({length: 40}, (_, i) => i + 1),
      priority: 'P1',
      effort: 'L',
      acceptance_criteria: [
        'Metrics dashboard designed',
        'KPIs defined for all stages',
        'Real-time data flow established'
      ]
    },
    {
      id: 'WF-006',
      title: 'Add funding/investment stage',
      description: 'No explicit fundraising stage in the workflow.',
      source: ['critique/overview.md'],
      affects_stages: [20, 21],
      priority: 'P1',
      effort: 'M',
      acceptance_criteria: [
        'Funding stage added between 20 and 21',
        'Investor relations process defined',
        'Due diligence requirements specified'
      ]
    },
    {
      id: 'WF-007',
      title: 'Enable parallel development execution',
      description: 'Stages 22-24 could run concurrently to speed up development.',
      source: ['critique/overview.md', 'critique/stage-22.md'],
      affects_stages: [22, 23, 24],
      priority: 'P1',
      effort: 'M',
      acceptance_criteria: [
        'Parallel execution paths defined',
        'Dependencies adjusted',
        'Resource allocation updated'
      ]
    },
    {
      id: 'WF-008',
      title: 'Formalize all decision gates',
      description: 'Only 4 formal gates but 15+ informal checkpoints need formalization.',
      source: ['critique/overview.md'],
      affects_stages: Array.from({length: 40}, (_, i) => i + 1),
      priority: 'P1',
      effort: 'L',
      acceptance_criteria: [
        'All decision points identified',
        'Gate criteria defined',
        'Approval workflows specified'
      ]
    },
    {
      id: 'WF-009',
      title: 'Create comprehensive rollback procedures',
      description: 'Most stages lack defined rollback procedures.',
      source: ['critique/overview.md'],
      affects_stages: Array.from({length: 40}, (_, i) => i + 1),
      priority: 'P1',
      effort: 'L',
      acceptance_criteria: [
        'Rollback triggers defined',
        'Rollback steps documented',
        'Recovery procedures tested'
      ]
    },
    {
      id: 'WF-010',
      title: 'Build stage-skip framework',
      description: 'Experienced ventures should be able to skip certain validation stages.',
      source: ['critique/overview.md'],
      affects_stages: [2, 3, 4, 9],
      priority: 'P2',
      effort: 'M',
      acceptance_criteria: [
        'Skip conditions defined',
        'Fast-track paths created',
        'Risk assessment for skips'
      ]
    },
    {
      id: 'WF-011',
      title: 'Define concrete metrics and KPIs',
      description: 'Metrics listed but no thresholds or measurement methods defined.',
      source: ['prd_crosswalk.md'],
      affects_stages: Array.from({length: 40}, (_, i) => i + 1),
      priority: 'P0',
      effort: 'L',
      acceptance_criteria: [
        'KPIs with target values defined',
        'Measurement methods specified',
        'Data collection automated'
      ]
    },
    {
      id: 'WF-012',
      title: 'Complete Development phase PRDs',
      description: 'Stages 21-28 have partial PRD coverage.',
      source: ['prd_crosswalk.md'],
      affects_stages: Array.from({length: 8}, (_, i) => i + 21),
      priority: 'P0',
      effort: 'L',
      acceptance_criteria: [
        'Full PRDs written for stages 21-28',
        'Technical specifications complete',
        'Integration points defined'
      ]
    },
    {
      id: 'WF-013',
      title: 'Add team scaling framework',
      description: 'No explicit team building and scaling processes.',
      source: ['critique/overview.md'],
      affects_stages: [14, 31, 33],
      priority: 'P2',
      effort: 'M',
      acceptance_criteria: [
        'Team scaling embedded in relevant stages',
        'Hiring processes defined',
        'Onboarding workflows created'
      ]
    },
    {
      id: 'WF-014',
      title: 'Enhance security and compliance coverage',
      description: 'Security only explicit in Stage 26, needs embedding throughout.',
      source: ['critique/overview.md'],
      affects_stages: Array.from({length: 40}, (_, i) => i + 1),
      priority: 'P1',
      effort: 'L',
      acceptance_criteria: [
        'Security checks in all stages',
        'Compliance requirements mapped',
        'Audit trails implemented'
      ]
    },
    {
      id: 'WF-015',
      title: 'Create data pipeline architecture',
      description: 'No clear data flow between stages causing information silos.',
      source: ['critique/overview.md', 'prd_crosswalk.md'],
      affects_stages: Array.from({length: 40}, (_, i) => i + 1),
      priority: 'P0',
      effort: 'L',
      acceptance_criteria: [
        'Data pipeline designed',
        'Data schemas defined',
        'Integration APIs specified'
      ]
    }
  ];
}

/**
 * Generate GitHub issue template
 * @param {string} dir - Output directory
 * @param {Object} item - Backlog item
 */
function generateIssueTemplate(dir, item) {
  const issuePath = path.join(dir, `${item.id}.md`);
  const issueContent = `---
title: ${item.title}
labels: workflow, ${item.priority}, effort-${item.effort}
assignees:
---

# ${item.title}

## Description
${item.description}

## Affected Stages
${item.affects_stages.map(s => `- Stage ${s}`).join('\n')}

## Source Documents
${item.source.map(s => `- ${s}`).join('\n')}

## Priority
**${item.priority}** - ${item.priority === 'P0' ? 'Critical' : item.priority === 'P1' ? 'Important' : 'Nice to have'}

## Effort Estimate
**${item.effort}** - ${item.effort === 'S' ? 'Small (1-2 days)' : item.effort === 'M' ? 'Medium (3-5 days)' : 'Large (1-2 weeks)'}

## Acceptance Criteria
${item.acceptance_criteria.map(c => `- [ ] ${c}`).join('\n')}

## Implementation Notes
- TODO: Add technical implementation details
- TODO: Define testing approach
- TODO: Identify dependencies

## References
- [Workflow Critique](../../critique/overview.md)
- [PRD Crosswalk](../../prd_crosswalk.md)
- [Stages Definition](../../stages.yaml)`;

  fs.writeFileSync(issuePath, issueContent);
}
