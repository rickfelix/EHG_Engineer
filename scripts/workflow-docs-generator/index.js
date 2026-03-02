#!/usr/bin/env node
/**
 * Workflow Docs Generator Index
 * Main entry point that orchestrates all generators
 *
 * Extracted from generate-workflow-docs.js for modularity
 * SD-LEO-REFACTOR-WORKFLOW-DOCS-001
 */

// Re-export all functions for programmatic use
export { loadStages, getStages, ensureDir, slugify, padStageId } from './data-loader.js';
export { generateStageCards } from './stage-cards.js';
export { generatePhaseDiagrams } from './phase-diagrams.js';
export { generateSOPs } from './sops.js';
export { generateCritiques } from './critiques.js';
export { generatePRDCrosswalk } from './prd-crosswalk.js';
export { generateBacklog } from './backlog.js';
export { generateResearchPacks } from './research-packs.js';
export { generateValidationScript } from './validation-script.js';
export { generateREADMEs } from './readmes.js';

// Import for CLI execution
import { generateStageCards } from './stage-cards.js';
import { generatePhaseDiagrams } from './phase-diagrams.js';
import { generateSOPs } from './sops.js';
import { generateCritiques } from './critiques.js';
import { generatePRDCrosswalk } from './prd-crosswalk.js';
import { generateBacklog } from './backlog.js';
import { generateResearchPacks } from './research-packs.js';
import { generateValidationScript } from './validation-script.js';
import { generateREADMEs } from './readmes.js';

/**
 * Run all generators
 */
export async function generateAll() {
  console.log('Starting workflow documentation generation...');

  generateStageCards();
  generatePhaseDiagrams();
  generateSOPs();
  generateCritiques();
  generatePRDCrosswalk();
  generateBacklog();
  generateResearchPacks();
  generateValidationScript();
  generateREADMEs();

  console.log('\nWorkflow documentation generation complete!');
  console.log('\nNext steps:');
  console.log('1. Run validation: node scripts/validate-stages.js');
  console.log('2. Review generated documentation in /docs/workflow/');
  console.log('3. View diagrams in /docs/stages/');
  console.log('4. Check backlog in /docs/workflow/backlog/');
  console.log('5. Use research packs in /docs/research/ for analysis');
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  generateAll().catch(err => {
    console.error('Generation failed:', err.message);
    process.exit(1);
  });
}
