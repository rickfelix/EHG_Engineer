/**
 * Phase Diagrams Generator
 * Generates Mermaid diagrams for each workflow phase
 *
 * Extracted from generate-workflow-docs.js for modularity
 * SD-LEO-REFACTOR-WORKFLOW-DOCS-001
 */

import fs from 'fs';
import path from 'path';
import { stagesDir, getStages } from './data-loader.js';

/**
 * Generate phase diagrams for each workflow phase
 */
export function generatePhaseDiagrams() {
  const stages = getStages();

  const phases = [
    { file: '02-planning.mmd', start: 11, end: 20, name: 'PLANNING', emoji: '📋' },
    { file: '03-development.mmd', start: 21, end: 28, name: 'DEVELOPMENT', emoji: '🔧' },
    { file: '04-launch.mmd', start: 29, end: 34, name: 'LAUNCH', emoji: '🚀' },
    { file: '05-operations.mmd', start: 35, end: 40, name: 'OPERATIONS', emoji: '📈' }
  ];

  phases.forEach(phase => {
    const filepath = path.join(stagesDir, phase.file);
    const phaseStages = stages.filter(s => s.id >= phase.start && s.id <= phase.end);

    let nodes = phaseStages.map(s =>
      `  S${s.id}["${s.id}. ${s.title}<br/>Owner: ${s.owner}"]`
    ).join('\n');

    let flow = '';
    for (let i = phase.start; i < phase.end; i++) {
      flow += `S${i} --> S${i + 1}\n`;
    }

    const content = `flowchart TB
%% Phase ${phase.name} (Stages ${phase.start}-${phase.end})

subgraph ${phase.name}["${phase.emoji} Phase: ${phase.name}"]
${nodes}
end

%% Sequential flow
${flow}

%% Cross-dependencies
${phaseStages.map(s => {
  return s.depends_on
    .filter(d => d < phase.start || d > phase.end)
    .map(d => `S${d} -.-> S${s.id}`)
    .join('\n');
}).filter(Boolean).join('\n')}`;

    fs.writeFileSync(filepath, content);
  });

  console.log('Generated 4 phase diagrams');
}
