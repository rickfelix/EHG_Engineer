/**
 * Linkage Validators for PRD Validator
 * Validates links to other documents like SDs and test plans
 */

import fs from 'fs';
import path from 'path';

/**
 * Validate linkages to other documents
 * @param {string} content - PRD content
 * @param {Object} results - Results object to update
 * @param {string} _filePath - Path to PRD file (unused but kept for API compatibility)
 */
function validateLinkages(content, results, _filePath) {
  // Check SD linkage
  if (results.metadata.relatedSD) {
    const sdFileName = `${results.metadata.relatedSD}.md`;
    const possiblePaths = [
      path.join('docs', 'strategic-directives', sdFileName),
      path.join('docs', 'wbs_artefacts', 'strategic_directives', sdFileName),
      path.join('docs', 'strategic_directives', sdFileName)
    ];

    let sdFound = false;
    for (const sdPath of possiblePaths) {
      if (fs.existsSync(sdPath)) {
        sdFound = true;
        results.metadata.sdPath = sdPath;
        break;
      }
    }

    if (!sdFound) {
      results.warnings.push(`Referenced Strategic Directive ${results.metadata.relatedSD} file not found`);
      results.score -= 5;
    }
  }

  // Check for test plan linkage
  const hasTestPlan = /test plan|test strategy|testing approach/i.test(content);
  if (!hasTestPlan) {
    results.warnings.push('No test plan or testing strategy mentioned');
    results.score -= 3;
  }

  // Check for design/mockup references
  const hasUIWork = /UI|user interface|frontend|screen|page|component|button|form/i.test(content);
  const hasDesignRefs = /mockup|wireframe|design|figma|sketch|prototype/i.test(content);

  if (hasUIWork && !hasDesignRefs) {
    results.suggestions.push('UI work detected - consider adding mockups or design references');
  }
}

export { validateLinkages };
