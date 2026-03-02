#!/usr/bin/env node
/**
 * Workflow Documentation Generator
 * Generates comprehensive workflow documentation from stages.yaml
 *
 * REFACTORED: This file now re-exports from modular structure
 * See scripts/workflow-docs-generator/ directory for implementation:
 *   - data-loader.js - YAML loading and helper functions
 *   - stage-cards.js - Individual stage diagram generation
 *   - phase-diagrams.js - Phase diagram generation
 *   - sops.js - SOP generation
 *   - critiques.js - Critique document generation
 *   - prd-crosswalk.js - PRD crosswalk generation
 *   - backlog.js - Backlog and issue generation
 *   - research-packs.js - Research brief generation
 *   - validation-script.js - Validation script generation
 *   - readmes.js - README generation
 *   - index.js - Main orchestration
 *
 * SD-LEO-REFACTOR-WORKFLOW-DOCS-001
 */

// Re-export everything from modular structure
export {
  // Data loading utilities
  loadStages,
  getStages,
  ensureDir,
  slugify,
  padStageId,

  // Generator functions
  generateStageCards,
  generatePhaseDiagrams,
  generateSOPs,
  generateCritiques,
  generatePRDCrosswalk,
  generateBacklog,
  generateResearchPacks,
  generateValidationScript,
  generateREADMEs,

  // Main entry point
  generateAll
} from './workflow-docs-generator/index.js';

// CLI execution - delegate to modular index
import { generateAll } from './workflow-docs-generator/index.js';

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  generateAll().catch(err => {
    console.error('Generation failed:', err.message);
    process.exit(1);
  });
}
