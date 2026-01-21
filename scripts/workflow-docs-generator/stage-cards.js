/**
 * Stage Cards Generator
 * Generates individual Mermaid diagrams for each stage
 *
 * Extracted from generate-workflow-docs.js for modularity
 * SD-LEO-REFACTOR-WORKFLOW-DOCS-001
 */

import fs from 'fs';
import path from 'path';
import { stagesDir, ensureDir, padStageId, getStages } from './data-loader.js';

/**
 * Generate individual stage detail cards as Mermaid diagrams
 */
export function generateStageCards() {
  const stages = getStages();
  const dir = path.join(stagesDir, 'individual');
  ensureDir(dir);

  stages.forEach(stage => {
    const filename = `${padStageId(stage.id)}.mmd`;
    const filepath = path.join(dir, filename);

    let substagesFlow = '';
    let substageNodes = '';

    if (stage.substages && stage.substages.length > 0) {
      substageNodes = stage.substages.map((sub, idx) => {
        const letter = String.fromCharCode(65 + idx); // A, B, C...
        return `  S${stage.id}_${letter}["${sub.id} ${sub.title}"]`;
      }).join('\n');

      const letters = stage.substages.map((_, idx) => String.fromCharCode(65 + idx));
      substagesFlow = `  S${stage.id}_root --> S${stage.id}_${letters[0]}`;
      for (let i = 0; i < letters.length - 1; i++) {
        substagesFlow += ` --> S${stage.id}_${letters[i + 1]}`;
      }
    } else {
      substageNodes = `  S${stage.id}_A["${stage.id}.1 TBD - Substage A"]\n  S${stage.id}_B["${stage.id}.2 TBD - Substage B"]\n  S${stage.id}_C["${stage.id}.3 TBD - Substage C"]`;
      substagesFlow = `  S${stage.id}_root --> S${stage.id}_A --> S${stage.id}_B --> S${stage.id}_C`;
    }

    const deps = stage.depends_on.length > 0 ? stage.depends_on.join(', ') : '(none)';

    const content = `flowchart TB
%% Stage ${stage.id} Detail
subgraph S${stage.id}["${stage.id}. ${stage.title}"]
  S${stage.id}_root["Purpose: ${stage.description}
Owner: ${stage.owner}"]
${substageNodes}
${substagesFlow}
end
classDef dep stroke-dasharray: 5 5;
D${stage.id}["Depends on: ${deps}"]:::dep -.-> S${stage.id}_root`;

    fs.writeFileSync(filepath, content);
  });

  console.log(`Generated ${stages.length} individual stage cards`);
}
